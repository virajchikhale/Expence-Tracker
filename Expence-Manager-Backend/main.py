from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Depends, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field, EmailStr
from typing import List, Dict, Optional, Union
from passlib.context import CryptContext
from datetime import date, datetime, timedelta # 'date' is imported
import jwt
from jwt.exceptions import PyJWTError
import matplotlib.pyplot as plt
from io import BytesIO
import base64
import pandas as pd
import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.server_api import ServerApi
from bson import ObjectId
from fastapi.middleware.cors import CORSMiddleware
import certifi

# Constants and configuration
import logging
import secrets
import threading
import time

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("expense_tracker")

ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()
IS_DEV = ENVIRONMENT in {"dev", "development", "local", "test"}
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "expense_tracker_db")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 8)))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

_PLACEHOLDERS = {"", "your_secret_key", "change-me", "change-me-in-production", "secret", "changeme"}


def _load_secret_key() -> str:
    """The JWT signing key must come from the environment. Production refuses to start without a strong one."""
    key = os.getenv("JWT_SECRET", "").strip()
    if key.lower() in _PLACEHOLDERS or len(key) < 32:
        if IS_DEV:
            logger.warning("JWT_SECRET missing/weak: using a random per-process key (tokens die on restart)")
            return secrets.token_urlsafe(48)
        raise RuntimeError("JWT_SECRET must be set to a random value of at least 32 characters (openssl rand -hex 32). "
                           "Set ENVIRONMENT=dev to run locally without it.")
    if "*" in CORS_ORIGINS and not IS_DEV:
        raise RuntimeError("CORS_ORIGINS must list the frontend origin(s), not *")
    return key


SECRET_KEY = _load_secret_key()

# Minimal in-memory fixed-window limiter (single process; enough to blunt password guessing)
_rl_lock = threading.Lock()
_rl_hits: dict = {}


def _rl_blocked(key: str, limit: int, window: int) -> bool:
    now = time.monotonic()
    with _rl_lock:
        count, start = _rl_hits.get(key, (0, now))
        return now - start <= window and count >= limit


def _rl_hit(key: str, window: int) -> None:
    now = time.monotonic()
    with _rl_lock:
        if len(_rl_hits) > 10000:
            for k in [k for k, (_, st) in _rl_hits.items() if now - st > window]:
                _rl_hits.pop(k, None)
        count, start = _rl_hits.get(key, (0, now))
        if now - start > window:
            count, start = 0, now
        _rl_hits[key] = (count + 1, start)


def _rl_clear(key: str) -> None:
    with _rl_lock:
        _rl_hits.pop(key, None)


# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Lifespan context manager for MongoDB connection
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB
    client_kwargs = {}
    if MONGO_URI and (MONGO_URI.startswith("mongodb+srv://") or "tls=true" in MONGO_URI.lower()):
        # Atlas / TLS deployments (MongoDB 5+): verified TLS and the Stable API
        client_kwargs.update(server_api=ServerApi('1'), tlsCAFile=certifi.where())
    app.mongodb_client = AsyncIOMotorClient(MONGO_URI, **client_kwargs)
    app.mongodb = app.mongodb_client[DB_NAME]
    
    # Check connection
    try:
        # Send a ping to confirm a successful connection
        await app.mongodb_client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB Atlas!")
        
        # Create a unique index on email field
        await app.mongodb["users"].create_index("email", unique=True)
       
        # Create compound unique index on accounts (user_id, name)
        await app.mongodb["accounts"].create_index([("user_id", 1), ("name", 1)], unique=True)
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        raise
    
    yield  # This is where FastAPI serves requests
    
    # Shutdown: Close MongoDB connection
    app.mongodb_client.close()
    print("MongoDB connection closed.")

# FastAPI app with lifespan (interactive docs are off in production unless ENABLE_DOCS=true)
_docs = IS_DEV or os.getenv("ENABLE_DOCS", "false").strip().lower() == "true"
app = FastAPI(
    title="Expense Tracker API", description="API for tracking personal expenses", lifespan=lifespan,
    docs_url="/docs" if _docs else None, redoc_url=None, openapi_url="/openapi.json" if _docs else None,
)

# CORS: only the configured frontend origin(s); tokens travel in the Authorization header, not cookies
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Models
class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserInDB(UserBase):
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class User(UserBase):
    id: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Account models
class AccountBase(BaseModel):
    name: str = Field(..., min_length=1)
    type: str = Field(..., description="Type of account, e.g., 'personal' or 'friend'")

class AccountCreate(AccountBase):
    initial_balance: float = 0.0

class AccountResponse(AccountBase):
    id: str
    balance: float

class AccountListResponse(BaseModel):
    success: bool = True
    accounts: List[AccountResponse]

# Transaction models
class TransactionBase(BaseModel):
    # --- CHANGE 1: Changed from str to date. FastAPI handles "YYYY-MM-DD" parsing.
    date: date 
    description: str
    place: str
    amount: float
    type: str
    category: str
    account: str
    to_account: Optional[str] = "None"
    paid_by: Optional[str] = "Self"
    status: Optional[str] = "Pending"

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    status: str

class TransactionResponse(TransactionBase):
    id: str

class TransactionFilterPayload(BaseModel):
    page: int = 1
    limit: int = 20
    searchTerm: Optional[str] = None
    dateFrom: Optional[date] = None
    dateTo: Optional[date] = None
    type: Optional[List[str]] = None  # Now a list
    categories: Optional[List[str]] = None
    accounts: Optional[List[str]] = None
    minAmount: Optional[float] = None
    maxAmount: Optional[float] = None

# Response models (no changes needed here)
class SpendingResponse(BaseModel):
    category: str
    amount: float

class ChartResponse(BaseModel):
    chart: str

class ErrorResponse(BaseModel):
    success: bool = False
    error: str

class SuccessResponse(BaseModel):
    success: bool = True
    message: str

class BalanceResponse(BaseModel):
    success: bool = True
    balances: Dict[str, float]

class SpendingCategoryResponse(BaseModel):
    success: bool = True
    spending: Dict[str, float]

class ChartResponseModel(BaseModel):
    success: bool = True
    chart: str

class TransactionListResponse(BaseModel):
    success: bool = True
    transactions: List[dict]

class UserListResponse(BaseModel):
    success: bool = True
    users: List[User]

# Helper functions (no changes needed here)
def get_password_hash(password):
    return pwd_context.hash(password)

_DUMMY_HASH = pwd_context.hash("not-a-real-password")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_user_by_email(app, email: str):
    user = await app.mongodb["users"].find_one({"email": email})
    if user:
        return user
    return None

async def authenticate_user(app, email: str, password: str):
    user = await get_user_by_email(app, email)
    if not user:
        verify_password(password, _DUMMY_HASH)      # same cost as a real check: no user enumeration by timing
        return False
    if not verify_password(password, user["hashed_password"]):
        return False
    return user

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except PyJWTError:
        raise credentials_exception
    
    user = await get_user_by_email(app, email)
    if user is None:
        raise credentials_exception
    return user

# Expense Tracker class that uses MongoDB
class ExpenseTracker:
    def __init__(self, app, user_id):
        self.app = app
        self.user_id = user_id
        self.accounts_collection = app.mongodb["accounts"]
        self.transactions_collection = app.mongodb["transactions"]
    
    async def create_account(self, name: str, type: str, initial_balance: float = 0.0):
        account_doc = {
            "user_id": self.user_id,
            "name": name,
            "type": type,
            "created_at": datetime.utcnow()
        }
        try:
            result = await self.accounts_collection.insert_one(account_doc)
            account_id = str(result.inserted_id)
            if initial_balance != 0:
                trans_type = "credit" if initial_balance > 0 else "debit"
                await self.add_transaction(
                    date=date.today(), # Use today's date for opening balance
                    description="Opening Balance",
                    place="Opening Balance",
                    amount=abs(initial_balance),
                    transaction_type=trans_type,
                    category="Initial Balance",
                    account_name=name
                )
            return account_id
        except Exception as e:
            if "duplicate key" in str(e):
                raise ValueError(f"Account with name '{name}' already exists.")
            raise

    async def add_transaction(self, date: date, description, place, amount, transaction_type, 
                       category, account_name, to_account="None", paid_by="Self", status="Pending"):
        # Convert the `date` object to a `datetime` object for MongoDB.
        transaction_date = datetime.combine(date, datetime.min.time())

        # Validate that accounts exist
        from_account_exists = await self.accounts_collection.find_one({"user_id": self.user_id, "name": account_name})
        if not from_account_exists:
            raise ValueError(f"Account '{account_name}' does not exist.")

        if to_account != "None":
            to_account_exists = await self.accounts_collection.find_one({"user_id": self.user_id, "name": to_account})
            if not to_account_exists:
                raise ValueError(f"Account '{to_account}' does not exist.")

        prev_balance = 0.0

        # 1. Fetch outgoing transactions (account_name is the sender)
        outgoing_cursor = self.transactions_collection.find({
            "user_id": self.user_id,
            "account": account_name
        }).sort("date", 1)

        async for t in outgoing_cursor:
            t_type = t.get("type", "").lower()
            t_amount = float(t.get("amount", 0))
            if t_type == "credit":
                prev_balance += t_amount
            elif t_type in ["debit", "debt_incurred", "transferred", "self_transferred"]:
                prev_balance -= t_amount

        # 2. Fetch incoming transfer transactions (account_name is the receiver)
        incoming_cursor = self.transactions_collection.find({
            "user_id": self.user_id,
            "to_account": account_name,
            "type": {"$in": ["transferred", "self_transferred"]}
        }).sort("date", 1)

        async for t in incoming_cursor:
            t_amount = float(t.get("amount", 0))
            prev_balance += t_amount

        # Apply this transaction
        transaction_balance = prev_balance
        t_type = transaction_type.lower()

        if t_type == "credit":
            transaction_balance += amount
        elif t_type in ["debit", "debt_incurred"]:
            transaction_balance -= amount
        elif t_type in ["transferred", "self_transferred"]:
            if account_name == to_account:
                transaction_balance += amount  # Incoming
            else:
                transaction_balance -= amount  # Outgoing

        transaction = {
            'user_id': self.user_id,
            'date': transaction_date,
            'description': description,
            'place': place,
            'amount': amount,
            'type': transaction_type,
            'category': category,
            'account': account_name,
            'to_account': to_account,
            'paid_by': paid_by,
            'status': status,
            'created_at': datetime.utcnow(),
            'transaction_balance': transaction_balance
        }

        result = await self.transactions_collection.insert_one(transaction)
        return str(result.inserted_id)

    
    async def delete_transaction(self, transaction_id):
        try:
            result = await self.transactions_collection.delete_one({
                "_id": ObjectId(transaction_id),
                "user_id": self.user_id
            })
            return result.deleted_count > 0
        except Exception as e:
            print(f"Error deleting transaction: {e}")
            return False
    
    async def update_transaction_status(self, transaction_id, new_status):
        try:
            result = await self.transactions_collection.update_one(
                {"_id": ObjectId(transaction_id), "user_id": self.user_id},
                {"$set": {"status": new_status}}
            )
            return result.modified_count > 0
        except Exception as e:
            print(f"Error updating transaction: {e}")
            return False
    
    async def get_transactions(self, limit=None):
        cursor = self.transactions_collection.find({"user_id": self.user_id})
        cursor = cursor.sort("created_at", -1)
        if limit:
            cursor = cursor.limit(limit)
        transactions = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            # Format date back to "YYYY-MM-DD" for response consistency
            if isinstance(doc["date"], datetime):
                doc["date"] = doc["date"].strftime("%Y-%m-%d")
            del doc["_id"]
            transactions.append(doc)
        return transactions
    
    async def get_transactions_by_filter(self, filters: TransactionFilterPayload):
        query_filter = {"user_id": self.user_id}

        print(f"Filters received: {filters}")

        if filters.searchTerm:
            query_filter["$or"] = [
                {"description": {"$regex": filters.searchTerm, "$options": "i"}},
                {"place": {"$regex": filters.searchTerm, "$options": "i"}},
                {"category": {"$regex": filters.searchTerm, "$options": "i"}},
            ]

        date_filter = {}
        if filters.dateFrom:
            date_filter["$gte"] = datetime.combine(filters.dateFrom, datetime.min.time())
        if filters.dateTo:
            date_filter["$lte"] = datetime.combine(filters.dateTo, datetime.max.time())
        if date_filter:
            query_filter["date"] = date_filter

        if filters.type:
            if isinstance(filters.type, list):
                query_filter["type"] = {"$in": filters.type}
            else:
                query_filter["type"] = filters.type
        if filters.categories:
            query_filter["category"] = {"$in": filters.categories}
        if filters.accounts:
            query_filter["account"] = {"$in": filters.accounts}

        amount_filter = {}
        if filters.minAmount is not None:
            amount_filter["$gte"] = filters.minAmount
        if filters.maxAmount is not None:
            amount_filter["$lte"] = filters.maxAmount
        if amount_filter:
            query_filter["amount"] = amount_filter

        skip = (filters.page - 1) * filters.limit
        cursor = self.transactions_collection.find(query_filter).sort("created_at", -1).skip(skip).limit(filters.limit)

        transactions = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            if isinstance(doc["date"], datetime):
                doc["date"] = doc["date"].strftime("%Y-%m-%d")
            del doc["_id"]
            transactions.append(doc)

        return transactions
    
    async def get_all_account_balances(self):
        accounts_cursor = self.accounts_collection.find({"user_id": self.user_id})
        accounts = await accounts_cursor.to_list(length=None)
        balances = {account['name']: 0.0 for account in accounts}
        transactions = await self.get_transactions()
        
        for transaction in transactions:
            account = transaction['account']
            amount = float(transaction['amount'])
            transaction_type = transaction['type'].lower()
            to_account = transaction['to_account']
            
            if transaction_type == "credit":
                balances[account] += amount
            elif transaction_type == "debit":
                balances[account] -= amount
            elif transaction_type == "debt_incurred":
                balances[account] -= amount
            elif transaction_type in ["transferred", "self_transferred"]:
                balances[account] -= amount
                if to_account != "None":
                    balances[to_account] += amount
        return balances
    
    # --- CHANGE 3: The date parameters are now `date` objects.
    async def get_spending_by_category(self, start_date: Optional[date] = None, end_date: Optional[date] = None):
        transactions = await self.get_transactions()
        if not transactions:
            return {}
        
        df = pd.DataFrame(transactions)
        
        # --- FIX: The `date` column from the DB is now datetime, so convert it with pd.to_datetime
        df['date'] = pd.to_datetime(df['date'])
        
        if start_date and end_date:
            # Convert input `date` objects to `datetime` for comparison
            start_dt = pd.to_datetime(start_date)
            end_dt = pd.to_datetime(end_date)
            df = df[(df['date'] >= start_dt) & (df['date'] <= end_dt)]
        
        if not df.empty:
            debit_df = df[df['type'].str.lower() == 'debit']
            if not debit_df.empty:
                category_spending = debit_df.groupby('category')['amount'].sum().to_dict()
                return category_spending
        return {}
    
    # --- CHANGE 4: The date parameters are now `date` objects.
    async def plot_spending_by_category(self, start_date: Optional[date] = None, end_date: Optional[date] = None):
        category_spending = await self.get_spending_by_category(start_date, end_date)
        if not category_spending:
            return None
        
        plt.figure(figsize=(10, 6))
        plt.bar(category_spending.keys(), category_spending.values())
        plt.xlabel('Category')
        plt.ylabel('Amount Spent')
        plt.title('Spending by Category')
        plt.xticks(rotation=45)
        plt.tight_layout()
        
        buffer = BytesIO()
        plt.savefig(buffer, format='png')
        buffer.seek(0)
        plt.close()
        
        img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return img_str
    
    async def plot_monthly_spending(self):
        transactions = await self.get_transactions()
        if not transactions:
            return None
        
        df = pd.DataFrame(transactions)
        
        # --- FIX: This works correctly now because `get_transactions` returns datetime strings
        df['date'] = pd.to_datetime(df['date'])
        
        if not df.empty:
            debit_df = df[df['type'].str.lower() == 'debit']
            if not debit_df.empty:
                debit_df['Month'] = debit_df['date'].dt.strftime('%Y-%m')
                monthly_spending = debit_df.groupby('Month')['amount'].sum()
                
                plt.figure(figsize=(12, 6))
                monthly_spending.plot(kind='bar')
                plt.xlabel('Month')
                plt.ylabel('Amount Spent')
                plt.title('Monthly Spending')
                plt.xticks(rotation=45)
                plt.tight_layout()
                
                buffer = BytesIO()
                plt.savefig(buffer, format='png')
                buffer.seek(0)
                plt.close()
                
                img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
                return img_str
        return None

# Get tracker instance for specific user
async def get_tracker(user):
    user_id = str(user["_id"])
    return ExpenseTracker(app, user_id)

# --- All API Endpoints below are updated to use the new date formats ---

# Authentication endpoints (no changes)
@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    key = "login:" + form_data.username.strip().lower()
    if _rl_blocked(key, 5, 900) or _rl_blocked("login:*", 300, 900):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait 15 minutes and try again.")
    user = await authenticate_user(app, form_data.username, form_data.password)
    if not user:
        _rl_hit(key, 900)
        _rl_hit("login:*", 900)
        raise HTTPException(status_code=401, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    _rl_clear(key)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user["email"]}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

# Account management endpoints (no changes)
@app.post("/api/accounts", response_model=SuccessResponse, status_code=status.HTTP_201_CREATED)
async def create_account(account: AccountCreate, current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        account_id = await tracker.create_account(account.name, account.type, account.initial_balance)
        return {"success": True, "message": f"Account created with ID {account_id}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/accounts", response_model=AccountListResponse)
async def list_accounts(current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        balances = await tracker.get_all_account_balances()
        accounts_cursor = tracker.accounts_collection.find({"user_id": tracker.user_id})
        accounts_list = []
        async for acc in accounts_cursor:
            accounts_list.append(AccountResponse(id=str(acc["_id"]), name=acc["name"], type=acc["type"], balance=balances.get(acc["name"], 0.0)))
        return {"success": True, "accounts": accounts_list}
    except Exception as e:
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/api/accounts/{account_id}", response_model=SuccessResponse)
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Account deletion not yet implemented.")

# User management endpoints (no changes)
@app.post("/api/users", response_model=User, status_code=status.HTTP_201_CREATED)
async def create_user(user: UserCreate):
    if _rl_blocked("register:*", 20, 3600):
        raise HTTPException(status_code=429, detail="Too many registrations. Please try again later.")
    _rl_hit("register:*", 3600)
    if len(user.password) < 10:
        raise HTTPException(status_code=422, detail="Password must be at least 10 characters")
    if len(user.password.encode()) > 72:
        raise HTTPException(status_code=422, detail="Password must be at most 72 bytes")
    existing_user = await get_user_by_email(app, user.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    user_data = UserInDB(email=user.email, username=user.username, full_name=user.full_name, hashed_password=hashed_password)
    new_user = await app.mongodb["users"].insert_one(user_data.dict())
    created_user = await app.mongodb["users"].find_one({"_id": new_user.inserted_id})
    return {"id": str(created_user["_id"]), "email": created_user["email"], "username": created_user["username"], "full_name": created_user.get("full_name")}

@app.get("/api/users/me", response_model=User)
async def read_users_me(current_user = Depends(get_current_user)):
    return {"id": str(current_user["_id"]), "email": current_user["email"], "username": current_user["username"], "full_name": current_user.get("full_name")}

@app.get("/api/users", response_model=UserListResponse)
async def get_users(current_user: dict = Depends(get_current_user)):
    # Only the caller: listing every registered user would leak other people's e-mail addresses
    me = User(id=str(current_user["_id"]), email=current_user["email"], username=current_user["username"], full_name=current_user.get("full_name"))
    return {"success": True, "users": [me]}

# Transaction endpoints (no changes)
@app.get("/api/transactions", response_model=TransactionListResponse)
async def get_transactions(limit: int = Query(10, description="Number of transactions to return"), current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        transactions = await tracker.get_transactions(limit)
        return {"success": True, "transactions": transactions}
    except Exception as e:
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")
    
@app.post("/api/transactions/filter", response_model=TransactionListResponse)
async def filter_transactions(payload: TransactionFilterPayload, current_user: dict = Depends(get_current_user)):
    print(f"Filtering transactions with payload: {payload}")
    try:
        tracker = await get_tracker(current_user)
        transactions = await tracker.get_transactions_by_filter(payload)
        return {"success": True, "transactions": transactions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@app.post("/api/transactions", response_model=SuccessResponse)
async def add_transaction(transaction: TransactionCreate, current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        # The `transaction.date` is now a `date` object and is passed directly
        transaction_id = await tracker.add_transaction(
            transaction.date, transaction.description, transaction.place, transaction.amount,
            transaction.type, transaction.category, transaction.account, transaction.to_account,
            transaction.paid_by, transaction.status
        )
        return {"success": True, "message": f"Transaction added with ID {transaction_id}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/api/transactions/{transaction_id}", response_model=SuccessResponse)
async def delete_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        if await tracker.delete_transaction(transaction_id):
            return {"success": True, "message": "Transaction deleted"}
        else:
            raise HTTPException(status_code=404, detail="Transaction not found")
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

@app.put("/api/transactions/{transaction_id}/status", response_model=SuccessResponse)
async def update_status(transaction_id: str, update_data: TransactionUpdate, current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        if await tracker.update_transaction_status(transaction_id, update_data.status):
            return {"success": True, "message": "Status updated"}
        else:
            raise HTTPException(status_code=404, detail="Transaction not found")
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/balances", response_model=BalanceResponse)
async def get_balances(current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        balances = await tracker.get_all_account_balances()
        return {"success": True, "balances": balances}
    except Exception as e:
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

# --- CHANGE 5: Updated endpoint signature to use `date` type.
@app.get("/api/spending/category", response_model=SpendingCategoryResponse)
async def get_spending_by_category(
    start_date: Optional[date] = Query(None, description="Start date in YYYY-MM-DD format"),
    end_date: Optional[date] = Query(None, description="End date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user)
):
    try:
        tracker = await get_tracker(current_user)
        spending = await tracker.get_spending_by_category(start_date, end_date)
        return {"success": True, "spending": spending}
    except Exception as e:
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

# --- CHANGE 6: Updated endpoint signature to use `date` type.
@app.get("/api/charts/category", response_model=ChartResponseModel)
async def get_category_chart(
    start_date: Optional[date] = Query(None, description="Start date in YYYY-MM-DD format"),
    end_date: Optional[date] = Query(None, description="End date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user)
):
    try:
        tracker = await get_tracker(current_user)
        img_str = await tracker.plot_spending_by_category(start_date, end_date)
        if img_str:
            return {"success": True, "chart": img_str}
        else:
            raise HTTPException(status_code=404, detail="No data available for chart")
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/charts/monthly", response_model=ChartResponseModel)
async def get_monthly_chart(current_user: dict = Depends(get_current_user)):
    try:
        tracker = await get_tracker(current_user)
        img_str = await tracker.plot_monthly_spending()
        if img_str:
            return {"success": True, "chart": img_str}
        else:
            raise HTTPException(status_code=404, detail="No data available for chart")
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        logger.exception("Unhandled error"); raise HTTPException(status_code=500, detail="Internal server error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)