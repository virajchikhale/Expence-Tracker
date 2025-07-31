// User types
export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  created_at: Date;
  updated_at: Date;
}

// Auth types
export interface RegisterData {
  email: string;
  username: string;
  full_name: string;
  password: string;
}

export interface LoginData {
  username: string; // This is actually email as per your API
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// Account types
export interface Account {
  id: string;
  name: string;
  type: 'personal' | 'friend';
  initial_balance: number;
  current_balance: number;
  created_at: Date;
  updated_at: Date;
  balance: number; // This is the total balance, not used in frontend
}

export interface CreateAccountData {
  name: string;
  type: 'personal' | 'friend';
  initial_balance: number;
}

// Transaction types
export interface Transaction {
  id: string;
  date: string;
  description: string;
  place: string;
  amount: number;
  type: 'debit' | 'credit' | 'transferred'|"debt_incurred" | "self_transferred";
  category: string;
  account: string;
  status: 'Pending' | 'Completed' | 'Failed';
  created_at: Date;
  updated_at: Date;
}

export interface CreateTransactionData {
  date: string;
  description: string;
  place: string;
  amount: number;
  type: 'debit' | 'credit' | 'transferred' | 'debt_incurred' | 'self_transferred';
  category: string;
  account: string;
}

// Balance types
export interface Balance {
  account: string;
  current_balance: number;
  total_credits: number;
  total_debits: number;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Form types
export interface FormErrors {
  [key: string]: string | undefined;
}