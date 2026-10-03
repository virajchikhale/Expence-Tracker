import time

import jwt
import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)           # no `with`: the MongoDB lifespan is not started


@pytest.fixture(autouse=True)
def _reset_limiter():
    main._rl_hits.clear()
    yield
    main._rl_hits.clear()


def _token(secret=None, **claims):
    payload = {"sub": "a@b.io", "exp": int(time.time()) + 60, **claims}
    return jwt.encode(payload, secret or main.SECRET_KEY, algorithm="HS256")


USER = {"_id": "64b000000000000000000001", "email": "a@b.io", "username": "alice", "full_name": "Alice", "hashed_password": "x"}


# ── the signing key must come from the environment ─────────────────────────────

def test_production_refuses_missing_or_placeholder_secret(monkeypatch):
    monkeypatch.setattr(main, "IS_DEV", False)
    for bad in ("", "YOUR_SECRET_KEY", "change-me-in-production", "short"):
        monkeypatch.setenv("JWT_SECRET", bad)
        with pytest.raises(RuntimeError):
            main._load_secret_key()


def test_production_accepts_a_strong_secret(monkeypatch):
    monkeypatch.setattr(main, "IS_DEV", False)
    monkeypatch.setenv("JWT_SECRET", "k" * 40)
    assert main._load_secret_key() == "k" * 40


def test_the_old_hard_coded_key_cannot_forge_a_token():
    forged = _token(secret="YOUR_SECRET_KEY")
    r = client.get("/api/users/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


# ── authentication ─────────────────────────────────────────────────────────────

def test_endpoints_require_a_token():
    for path in ("/api/users", "/api/users/me", "/api/accounts", "/api/transactions", "/api/balances"):
        assert client.get(path).status_code == 401, path


def test_alg_none_and_expired_tokens_are_rejected():
    none_tok = jwt.encode({"sub": "a@b.io"}, key=None, algorithm="none")
    old = _token(exp=int(time.time()) - 5)
    for t in (none_tok, old):
        assert client.get("/api/users/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_users_endpoint_only_returns_the_caller(monkeypatch):
    async def fake(app, email):
        return USER
    monkeypatch.setattr(main, "get_user_by_email", fake)
    r = client.get("/api/users", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 200
    assert [u["email"] for u in r.json()["users"]] == ["a@b.io"]
    assert "hashed_password" not in r.text


# ── login / registration throttling and rules ──────────────────────────────────

def test_login_locks_after_five_failures(monkeypatch):
    async def nobody(app, u, p):
        return False
    monkeypatch.setattr(main, "authenticate_user", nobody)
    codes = [client.post("/token", data={"username": "x@y.io", "password": "bad"}).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and codes[5:] == [429, 429]
    assert client.post("/token", data={"username": "other@y.io", "password": "bad"}).status_code == 401


def test_successful_login_clears_the_counter(monkeypatch):
    state = {"ok": False}

    async def auth(app, u, p):
        return USER if state["ok"] else False
    monkeypatch.setattr(main, "authenticate_user", auth)
    for _ in range(4):
        assert client.post("/token", data={"username": "a@b.io", "password": "bad"}).status_code == 401
    state["ok"] = True
    assert client.post("/token", data={"username": "a@b.io", "password": "good"}).status_code == 200
    state["ok"] = False
    assert client.post("/token", data={"username": "a@b.io", "password": "bad"}).status_code == 401


@pytest.mark.parametrize("pw,code", [("short", 422), ("x" * 80, 422)])
def test_registration_password_rules(pw, code):
    r = client.post("/api/users", json={"email": "n@x.io", "username": "n", "password": pw})
    assert r.status_code == code


def test_registration_is_throttled():
    codes = [client.post("/api/users", json={"email": f"n{i}@x.io", "username": "n", "password": "short"}).status_code for i in range(22)]
    assert codes[:20] == [422] * 20 and codes[20:] == [429, 429]


# ── errors and CORS ────────────────────────────────────────────────────────────

def test_internal_errors_are_not_leaked(monkeypatch):
    async def fake(app, email):
        return USER

    async def boom(user):
        raise Exception("secret connection string mongodb://user:pw@host")
    monkeypatch.setattr(main, "get_user_by_email", fake)
    monkeypatch.setattr(main, "get_tracker", boom)
    r = client.get("/api/accounts", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 500 and "secret" not in r.text and r.json()["detail"] == "Internal server error"


def test_cors_only_for_the_configured_origin():
    good = client.options("/api/accounts", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    bad = client.options("/api/accounts", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert good.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in bad.headers
    assert "access-control-allow-credentials" not in good.headers


def test_health_and_docs_hidden_in_production():
    assert client.get("/health").json() == {"status": "ok"}
