import os
import sys

os.environ.setdefault("ENVIRONMENT", "dev")
os.environ.setdefault("JWT_SECRET", "t" * 40)
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
