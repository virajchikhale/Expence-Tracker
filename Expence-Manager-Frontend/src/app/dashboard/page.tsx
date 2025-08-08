"use client"
import React, { useState, useEffect } from 'react';
import { Plus, CreditCard, TrendingUp, TrendingDown, Users, Eye, EyeOff, TrendingUpDown, Wallet2, Coins } from 'lucide-react';
import { apiService } from '@/lib/api';
import Navbar from '../../components/navbar/page'; 

// --- TYPE DEFINITIONS (Adjust in your actual types.ts file) ---
// These should reflect the new backend structure

interface Account {
  id: string;
  name: string;
  type: 'personal' | 'friend';
  balance: number; // Backend provides 'balance'
  // Making these optional as the backend doesn't return them on GET /accounts
  initial_balance?: number;
  current_balance: number; // We will map 'balance' to this for compatibility
  created_at?: Date;
  updated_at?: Date;
}

interface Transaction {
    id: string;
    date: string;
    description: string;
    place: string; // Changed from 'name' to 'place'
    amount: number;
    type: string;
    category: string;
    account: string;
    status: string;
    to_account?: string;
    paid_by?: string;
    created_at: Date;
    updated_at: Date;
}

// interface User {
//     id: string;
//     email: string;
//     username: string;
//     full_name: string | null;
// }

interface CreateTransactionData {
    date: string;
    description: string;
    place: string; // Changed from 'name' to 'place'
    amount: number;
    type: 'debit' | 'credit' | 'transferred' | 'debt_incurred' | 'self_transferred';
    category: string;
    account: string;
    to_account?: string; // Added for transfer transactions
}

interface CreateAccountData {
    name: string;
    type: 'personal' | 'friend';
    initial_balance: number;
}


const Dashboard = () => {
  const [personalAccounts, setPersonalAccounts] = useState<Account[]>([]);
  const [friendAccounts, setFriendAccounts] = useState<Account[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [hideBalances, setHideBalances] = useState(true);
  const [accountSearchTerm, setAccountSearchTerm] = useState('');
  const [toAccountSearchTerm, setToAccountSearchTerm] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showToAccountDropdown, setShowToAccountDropdown] = useState(false);

  // New transaction form state - updated 'name' to 'place'
  const [newTransaction, setNewTransaction] = useState<CreateTransactionData>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    place: '',
    amount: 0,
    type: 'debit',
    category: '',
    account: '',
    to_account: ''
  });

  // New account form state
  const [newAccount, setNewAccount] = useState<CreateAccountData>({
    name: '',
    type: 'personal',
    initial_balance: 0
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all data from the API in parallel. No need for getBalances anymore.
      const [accountsData, transactionsData] = await Promise.all([
        apiService.getAccounts(),
        apiService.getTransactions(10), // Fetch latest 10 transactions
        // apiService.getUsers(),
      ]);

      // Filter accounts into personal and friend types
      const personalAccs = accountsData.filter(acc => acc.type === 'personal');
      const friendAccs = accountsData.filter(acc => acc.type === 'friend');

      setPersonalAccounts(personalAccs);
      setFriendAccounts(friendAccs);
      setAllAccounts(accountsData);
      setTransactions(transactionsData);
      // setUsers(usersData);
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setShowAddTransaction(false);
      // Only include to_account if it has a value
      const tx = { ...newTransaction };
      if (!tx.to_account) {
        delete tx.to_account;
      }
      await apiService.createTransaction(tx);
      await fetchData(); // Refresh data

      setNewTransaction({
          date: new Date().toISOString().split('T')[0],
          description: '',
          place: '',
          amount: 0,
          type: 'debit',
          category: '',
          account: '',
          to_account: ''
      });
      console.log('Transaction added:', newTransaction);
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };

  const getFilteredAccounts = () => {
  let accountsToShow = [];
  
  if (newTransaction.type === 'credit' || newTransaction.type === 'debit') {
    // Show only personal accounts for credit/debit
    accountsToShow = allAccounts.filter(account => account.type === 'personal');
  } else if (newTransaction.type === 'transferred') {
    // Show only personal accounts for the "from" account in transfers
    accountsToShow = allAccounts.filter(account => account.type === 'personal');
  } else if (newTransaction.type === 'self_transferred') {
    // Show only personal accounts for the "from" account in transfers
    accountsToShow = allAccounts.filter(account => account.type === 'personal');
  } else {
    // For debt_incurred, show friends accounts
    accountsToShow = allAccounts.filter(account => account.type === 'friend');
  }
  
  // Filter by search term
  return accountsToShow.filter(account =>
    account.name.toLowerCase().includes(accountSearchTerm.toLowerCase())
  );
};

const getFilteredToAccounts = () => {
  let toaccountsToShow = [];

  if (newTransaction.type === 'self_transferred') {
    // Show only personal accounts for the "from" account in transfers
    toaccountsToShow = allAccounts.filter(account => account.type === 'personal');
  }else if (newTransaction.type === 'transferred') {
    // Show only personal accounts for the "from" account in transfers
    toaccountsToShow = allAccounts.filter(account => account.type === 'friend');
  } else {
    // For debt_incurred, show friends accounts
    toaccountsToShow = allAccounts;
  }
  // For "To Account" in transfers, show all accounts
  return toaccountsToShow.filter(account =>
    account.name.toLowerCase().includes(toAccountSearchTerm.toLowerCase())
  );
};

// Add click outside handler to close dropdowns
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (!(event.target as HTMLElement).closest('.relative')) {
      setShowAccountDropdown(false);
      setShowToAccountDropdown(false);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, []);

// Reset form when transaction type changes
useEffect(() => {
  setNewTransaction(prev => ({
    ...prev,
    account: '',
    to_account: ''
  }));
  setAccountSearchTerm('');
  setToAccountSearchTerm('');
}, [newTransaction.type]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createAccount(newAccount);

      setNewAccount({
        name: '',
        type: 'personal',
        initial_balance: 0
      });
      setShowAddAccount(false);
      await fetchData(); // Refresh data
    } catch (error) {
      console.error('Error adding account:', error);
    }
  };

  // Calculations updated to use account.balance
  const personalBalance = personalAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  console.log('Personal Balance:', personalBalance);
  const totalLent = friendAccounts.filter(acc => acc.balance > 0).reduce((sum, acc) => sum + acc.balance, 0);
  console.log('totalLent:', totalLent);
  const totalOwed = friendAccounts.filter(acc => acc.balance < 0).reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
  console.log('totalOwed:', totalOwed);
  
  // Note: These income/expense totals are still client-side estimates based on recent transactions.
  // For accuracy, this logic might move to the backend in the future.
  const totalIncome = transactions.filter(t => t.type === 'credit' && !['Lend', 'Borrow'].includes(t.category)).reduce((sum, t) => sum + t.amount, 0);
  console.log('totalIncome:', totalIncome);
  const totalExpenses = transactions.filter(t => t.type === 'debit' && !['Lend', 'Borrow'].includes(t.category)).reduce((sum, t) => sum + t.amount, 0);
  console.log('totalExpenses:', totalExpenses);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-white mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
    <div className="min-h-screen bg-gray-50 dark:bg-black p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header and Stats Overview (No changes needed here, they use the calculated totals) */}
        {/* <div className="mb-8">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <button
              onClick={() => setHideBalances(!hideBalances)}
              className="text-gray-400 hover:text-gray-600"
            >
              {hideBalances ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <p className="text-gray-600">Welcome back! Here&apos;s your financial overview.</p>
        </div> */}
        
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-black p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Personal Balance</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {hideBalances ? '****' : `₹${personalBalance.toLocaleString()}`}
                  </p>
                </div>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-gray-900 rounded-full h-12">
                {/* <Wallet className="text-blue-600" size={24} /> */}
                <button
                  onClick={() => setHideBalances(!hideBalances)}
                  className="text-blue-400 hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-400"
                >
                  {hideBalances ? <EyeOff size={24} /> : <Eye size={24} />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-black p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Money Lent</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {hideBalances ? '****' : `₹${totalLent.toLocaleString()}`}
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-gray-900 rounded-full">
                <TrendingUp className="text-green-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-black p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Money Owed</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {hideBalances ? '****' : `₹${totalOwed.toLocaleString()}`}
                </p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-gray-900 rounded-full">
                <TrendingDown className="text-red-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-black p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Net Worth</p>
                <p className={`text-2xl font-bold ${(personalBalance + totalLent - totalOwed) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {hideBalances ? '****' : `₹${(personalBalance + totalLent - totalOwed).toLocaleString()}`}
                </p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-gray-900 rounded-full">
                <Users className="text-purple-600" size={24} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Transactions - Changed 'name' to 'place' */}
          <div className="bg-white dark:bg-black rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Transactions</h2>
                <button
                  onClick={() => setShowAddTransaction(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {transactions.slice(0, 10).map(transaction => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    {/* ... icon logic ... */}
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        transaction.type === 'transferred' ? 'bg-orange-100 dark:bg-orange-900' :
                        transaction.type === 'debt_incurred' ? 'bg-purple-100 dark:bg-purple-900' :
                        transaction.type === 'self_transferred' ? 'bg-blue-100 dark:bg-blue-900' :
                        transaction.type === 'credit' ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'
                      }`}>
                        {transaction.type === 'transferred' ? 
                          <TrendingDown className="text-orange-600" size={20} /> :
                          transaction.type === 'debt_incurred' ? 
                          <TrendingUp className="text-purple-600" size={20} /> :
                          transaction.type === 'credit' ? 
                          <TrendingUp className="text-green-600" size={20} /> : 
                          transaction.type === 'self_transferred' ? 
                          <TrendingUpDown className="text-blue-600" size={20} /> : 
                          <TrendingDown className="text-red-600" size={20} />
                        }
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{transaction.place}</h3> {/* CHANGED */}
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {transaction.category} • {transaction.account}
                          {transaction.to_account && transaction.to_account !== "None" && ` → ${transaction.to_account}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(transaction.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        transaction.type === 'transferred' ? 'text-orange-600 dark:text-orange-400' :
                        transaction.type === 'debt_incurred' ? 'text-purple-600 dark:text-purple-400' :
                        transaction.type === 'self_transferred' ? 'text-blue-600 dark:text-blue-400' :
                        transaction.type === 'credit' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {transaction.type === 'credit' ? '+ ' : 
                         transaction.type === 'transferred' ? '↗ ' : 
                         transaction.type === 'self_transferred' ? '↔ ' : 
                         transaction.type === 'debt_incurred' ? '↙ ' : '- '}₹{transaction.amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                
                {/* ... empty state ... */}
                {transactions.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Wallet2 size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                    <p>No transactions yet</p>
                    <p className="text-sm">Add transactions to track Your Fainance</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Friends & Balances Section - Changed to use 'balance' */}
          <div className="bg-white dark:bg-black rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Friends & Balances</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {friendAccounts.map(friend => (
                  <div key={friend.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          {friend.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">{friend.name}</h3>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${friend.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {hideBalances ? '****' : 
                         friend.balance >= 0 ? 
                         `+₹${friend.balance.toLocaleString()}` : 
                         `-₹${Math.abs(friend.balance).toLocaleString()}`
                        }
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {friend.balance >= 0 ? 'Owes you' : 'You owe'}
                      </p>
                    </div>
                  </div>
                ))}
                {/* ... empty state ... */}
                {friendAccounts.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Users size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                    <p>No friend accounts yet</p>
                    <p className="text-sm">Add friends to track lending/borrowing</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Personal Accounts Section */}
          <div className="bg-white dark:bg-black rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Personal Accounts</h2>
                <button
                  onClick={() => setShowAddAccount(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {personalAccounts.map(account => (
                <div key={account.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-gray-800 rounded-lg">
                      <CreditCard className="text-blue-600 dark:text-blue-400" size={20} />
                    </div>
                    <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{account.name}</h3>
                      {/* <p className="text-sm text-gray-600 capitalize">{account.type}</p> */}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${account.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {hideBalances ? '****' : `₹${account.balance.toLocaleString()}`}
                    </p>
                  </div>
                </div>
              ))}
                {/* ... empty state ... */}
                {personalAccounts.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Coins size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                    <p>No Accounts Created yet</p>
                    <p className="text-sm">Add Accounts to start Tracking</p>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Transaction</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newTransaction.type}
                  onChange={(e) => setNewTransaction({...newTransaction, type: e.target.value as 'debit' | 'credit'})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                  <option value="self_transferred">Self Transferred</option>
                  <option value="transferred">Transferred</option>
                  <option value="debt_incurred">Debt Incurred</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                <div className="relative">
                  <input
                    type="text"
                    value={accountSearchTerm}
                    onChange={(e) => {
                      setAccountSearchTerm(e.target.value);
                      setShowAccountDropdown(true);
                    }}
                    onFocus={() => setShowAccountDropdown(true)}
                    placeholder="Search and select account..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {showAccountDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {getFilteredAccounts().map(account => (
                        <div
                          key={account.id}
                          onClick={() => {
                            setNewTransaction({...newTransaction, account: account.name});
                            setAccountSearchTerm(account.name);
                            setShowAccountDropdown(false);
                          }}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                        >
                          {account.name}
                        </div>
                      ))}
                      {getFilteredAccounts().length === 0 && (
                        <div className="px-3 py-2 text-gray-500">No accounts found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* To Account - only shown for transferred type */}
              {(newTransaction.type === 'transferred' || newTransaction.type === 'self_transferred') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={toAccountSearchTerm}
                      onChange={(e) => {
                        setToAccountSearchTerm(e.target.value);
                        setShowToAccountDropdown(true);
                      }}
                      onFocus={() => setShowToAccountDropdown(true)}
                      placeholder="Search and select destination account..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    {showToAccountDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {getFilteredToAccounts().map(account => (
                          <div
                            key={account.id}
                            onClick={() => {
                              setNewTransaction({...newTransaction, to_account: account.name});
                              setToAccountSearchTerm(account.name);
                              setShowToAccountDropdown(false);
                            }}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                          >
                            {account.name}
                          </div>
                        ))}
                        {getFilteredToAccounts().length === 0 && (
                          <div className="px-3 py-2 text-gray-500">No accounts found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Place / Name</label>
                <input
                  type="text"
                  value={newTransaction.place}
                  onChange={(e) => setNewTransaction({...newTransaction, place: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newTransaction.description}
                  onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction({...newTransaction, amount: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={newTransaction.category}
                  onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Category</option>
                  <option value="Food">Food</option>
                  <option value="Transport">Transport</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Bills">Bills</option>
                  <option value="Income">Income</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddTransaction(false)}
                  className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleAddTransaction(e);
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Add Transaction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Account</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                <select
                  value={newAccount.type}
                  onChange={(e) => setNewAccount({...newAccount, type: e.target.value as 'personal' | 'friend'})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="personal">Personal</option>
                  <option value="friend">Friend</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Balance</label>
                <input
                  type="number"
                  value={newAccount.initial_balance}
                  onChange={(e) => setNewAccount({...newAccount, initial_balance: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddAccount(false)}
                  className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleAddAccount(e);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default Dashboard;