// lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Define the response wrapper types from your FastAPI backend
interface SuccessResponse {
  success: boolean;
  message: string;
}

interface AccountListResponse {
  success: boolean;
  accounts: Account[];
}

interface TransactionListResponse {
  success: boolean;
  transactions: Transaction[];
}

interface UserListResponse {
    success: boolean;
    users: User[];
}

interface BalanceResponse {
    success: boolean;
    balances: { [key: string]: number };
}


class ApiService {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.loadToken();
  }

  // --- No changes needed for auth methods below ---
  private loadToken() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  private saveToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      this.token = token;
    }
  }

  private removeToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      this.token = null;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Try to parse error JSON for more detail
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorJson.detail || errorText}`);
      } catch {
         throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    } else {
      return {} as T;
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${this.baseURL}/token`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Login failed: ${errorText}`);
    }

    const data: AuthResponse = await response.json();
    this.saveToken(data.access_token);
    return data;
  }

  async register(userData: RegisterData): Promise<User> {
    return this.request<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/api/users/me');
  }

  // --- Changes Start Here ---

  async getUsers(): Promise<User[]> {
    const response = await this.request<UserListResponse>('/api/users');
    return response.users; // Extract the nested users array
  }

  async createAccount(accountData: CreateAccountData): Promise<SuccessResponse> {
    return this.request<SuccessResponse>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(accountData),
    });
  }

  async getAccounts(): Promise<Account[]> {
    const response = await this.request<AccountListResponse>('/api/accounts');
    // Map the backend's 'balance' to the frontend's 'current_balance'
    return response.accounts.map(acc => ({
        ...acc,
        current_balance: acc.balance,
        initial_balance: 0, // Not provided by this endpoint, default to 0
        created_at: new Date(), // Not provided, default to now
        updated_at: new Date() // Not provided, default to now
    }));
  }

  async deleteAccount(accountId: string): Promise<void> {
    // Backend endpoint is not implemented, but we keep the method signature
    return this.request<void>(`/api/accounts/${accountId}`, {
      method: 'DELETE',
    });
  }

  async createTransaction(transactionData: CreateTransactionData): Promise<SuccessResponse> {
    return this.request<SuccessResponse>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
  }

  async getTransactions(limit?: number): Promise<Transaction[]> {
    const params = limit ? `?limit=${limit}` : '';
    const response = await this.request<TransactionListResponse>(`/api/transactions${params}`);
    return response.transactions; // Extract the nested transactions array
  }

  /**
   * Delete a transaction by its ID.
   * @param transactionId The ID of the transaction to delete.
   */
  async deleteTransaction(transactionId: string): Promise<void> {
    return this.request<void>(`/api/transactions/${transactionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Delete the latest (most recently created) transaction.
   * Fetches the latest transaction and deletes it.
   */
  async deleteLatestTransaction(): Promise<void> {
    const transactions = await this.getTransactions(1); // get the latest transaction only
    if (transactions.length === 0) throw new Error('No transactions to delete.');
    const latest = transactions[0];
    await this.deleteTransaction(latest.id);
  }

  /**
   * Fetch filtered transactions using the /api/transactions/filter endpoint.
   * This method matches the backend API as shown in the provided curl example.
   * @param filterParams The filter object (page, limit, searchTerm, dateFrom, dateTo, type, categories, accounts, minAmount, maxAmount)
   */
  async getTransactionsFilter(filterParams: {
    page?: number;
    limit?: number;
    searchTerm?: string;
    dateFrom?: string;
    dateTo?: string;
    type?: string[];
    categories?: string[];
    accounts?: string[];
    minAmount?: number;
    maxAmount?: number;
  }): Promise<Transaction[]> {
    // Prepare the payload as per backend expectations
    const payload = {
      ...filterParams,
      minAmount: filterParams.minAmount === undefined ? null : filterParams.minAmount,
      maxAmount: filterParams.maxAmount === undefined ? null : filterParams.maxAmount,
    };
    
    console.log('Fetching transactions with filter:', payload);
    const response = await this.request<TransactionListResponse>(
      '/api/transactions/filter',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    return response.transactions;
}

  async updateTransactionStatus(transactionId: string, status: string): Promise<Transaction> {
    return this.request<Transaction>(`/api/transactions/${transactionId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async getBalances(): Promise<{ [key: string]: number }> {
    const response = await this.request<BalanceResponse>('/api/balances');
    return response.balances; // Return the dictionary of balances
  }

  logout() {
    this.removeToken();
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  getToken(): string | null {
    return this.token;
  }
  
  setToken(token: string) {
    this.saveToken(token);
  }
}

export const apiService = new ApiService(API_BASE_URL);

// Import the types (make sure to import these from your interfaces file)
import type { 
  User, 
  RegisterData, 
  AuthResponse, 
  Account, 
  CreateAccountData, 
  Transaction, 
  CreateTransactionData, 
} from '../types';