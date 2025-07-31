"use client"
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronDown, Filter} from 'lucide-react';
import { apiService } from '@/lib/api';
import { useDebounce } from 'use-debounce';
import Navbar from '../../components/navbar/page'; 

// --- TYPE DEFINITIONS (Should reflect your actual types) ---
interface Account {
    id: string;
    name: string;
    type: 'personal' | 'friend';
    balance: number;
    current_balance: number;
}

interface Transaction {
    id: string;
    date: string;
    description: string;
    place: string;
    amount: number;
    type: string;
    category: string;
    account: string;
    status: string;
    to_account?: string;
    paid_by?: string;
    created_at: Date;
    updated_at: Date;
    transaction_balance?: number;
}

// --- MAIN DASHBOARD COMPONENT ---
const Dashboard = () => {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [allAccounts, setAllAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
    const observer = useRef<IntersectionObserver | null>(null);

    // --- FILTER STATE ---
    const [filters, setFilters] = useState({
        searchTerm: '',
        dateFrom: '',
        dateTo: '',
        type: [] as string[],
        categories: [] as string[],
        accounts: [] as string[],
        to_account: [] as string[],
        minAmount: '',
        maxAmount: '',
    });
    // Local state for search input
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearchInput] = useDebounce(searchInput, 500);

    const fetchAccounts = async () => {
        try {
            const accountsData = await apiService.getAccounts();
            setAllAccounts(accountsData);
        } catch (error) {
            console.error('Error fetching accounts:', error);
        }
    };

    const fetchTransactions = useCallback(async (reset = false) => {
        setLoading(true);
        try {
            const params: Record<string, string | number | string[] | undefined> = {
                page: reset ? 1 : page,
                limit: 20,
            };
            if (filters.searchTerm) params.searchTerm = filters.searchTerm;
            if (filters.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters.dateTo) params.dateTo = filters.dateTo;
            if (filters.type && filters.type.length > 0) params.type = filters.type;
            if (filters.categories && filters.categories.length > 0) params.categories = filters.categories;
            // If only 'debt_incurred' is selected, use to_account, else use accounts
            if (
                filters.type.length === 1 && filters.type[0] === 'transferred'
            ) {
                if (filters.to_account && filters.to_account.length > 0) params.to_account = filters.to_account;
            } else {
                if (filters.accounts && filters.accounts.length > 0) params.accounts = filters.accounts;
            }
            if (filters.minAmount) params.minAmount = Number(filters.minAmount);
            if (filters.maxAmount) params.maxAmount = Number(filters.maxAmount);

            const newTransactions = await apiService.getTransactionsFilter(params);

            setTransactions(prev => reset ? newTransactions : [...prev, ...newTransactions]);
            setHasMore(newTransactions.length > 0);
            if (reset) setPage(2);
            else setPage(prev => prev + 1);

        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setLoading(false);
        }
    }, [page, filters]);

    useEffect(() => {
        fetchAccounts();
    }, []);

    useEffect(() => {
        fetchTransactions(true);
    }, [fetchTransactions, filters.searchTerm, filters.dateFrom, filters.dateTo, filters.type, filters.categories, filters.accounts, filters.minAmount, filters.maxAmount]);

    // Update filters.searchTerm only after debounce
    useEffect(() => {
        setFilters(prev => ({ ...prev, searchTerm: debouncedSearchInput }));
    }, [debouncedSearchInput]);

    const lastTransactionElementRef = useCallback((node: HTMLTableRowElement | null) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                fetchTransactions();
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, hasMore, fetchTransactions]);

    const handleFilterChange = React.useCallback((filterName: string, value: string | string[]) => {
        if (filterName === 'searchTerm') {
            setSearchInput(value as string);
        } else {
            setFilters(prev => {
                const newFilters = { ...prev, [filterName]: value };
                // Clear selected accounts/to_account when type changes
                if (filterName === 'type') {
                    newFilters.accounts = [];
                    newFilters.to_account = [];
                }
                return newFilters;
            });
        }
    }, []);

    const resetFilters = () => {
        setFilters({
            searchTerm: '',
            dateFrom: '',
            dateTo: '',
            type: [],
            categories: [],
            accounts: [],
            to_account: [],
            minAmount: '',
            maxAmount: '',
        });
        setSearchInput('');
    };

    // Memoized filtered accounts based on selected transaction type
    const getFilteredAccounts = React.useCallback(() => {
        if (!filters.type || filters.type.length === 0) {
            // If no type selected, show all accounts
            return allAccounts;
        }
        const hasPersonalTypes = filters.type.some(type =>
            ['debit', 'credit', 'self_transferred'].includes(type)
        );
        const hasFriendTypes = filters.type.some(type =>
            ['transferred', 'debt_incurred'].includes(type)
        );
        if (hasPersonalTypes && hasFriendTypes) {
            // If both personal and friend type are selected, show all accounts
            return allAccounts;
        } else if (hasPersonalTypes) {
            // Only personal type selected - show only personal accounts
            return allAccounts.filter(account => account.type === 'personal');
        } else if (hasFriendTypes) {
            // Only friend type selected - show only friend accounts
            return allAccounts.filter(account => account.type === 'friend');
        }
        return allAccounts;
    }, [filters.type, allAccounts]);

    // Memoized categories
    const allCategories = React.useMemo(() => [
        "Food", "Transport", "Entertainment", "Shopping", "Bills", "Income", "Other", "Lend", "Borrow"
    ], []);

    // Check if any filters are active
    const hasActiveFilters = filters.searchTerm || filters.dateFrom || filters.dateTo || filters.type.length > 0 || 
                           filters.categories.length > 0 || filters.accounts.length > 0 || 
                           filters.minAmount || filters.maxAmount;

    const FilterSidebar = React.useMemo(() => {
        // Show 'To Account' filter if only 'debt_incurred' is selected, else show 'Accounts' filter
        const showToAccount = filters.type.length === 1 && filters.type[0] === 'transferred';
        return (
            <div className="space-y-6">
                {/* Search Filter */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Description, place..."
                            value={searchInput}
                            onChange={e => handleFilterChange('searchTerm', e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Date Range Filter */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                    <div className="space-y-2">
                        <input 
                            type="date" 
                            value={filters.dateFrom} 
                            onChange={e => handleFilterChange('dateFrom', e.target.value)} 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                        <input 
                            type="date" 
                            value={filters.dateTo} 
                            onChange={e => handleFilterChange('dateTo', e.target.value)} 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                    </div>
                </div>

                {/* Type Filter (Multi-select) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <MultiSelectDropdown
                        options={['debit', 'credit', 'self_transferred', 'transferred', 'debt_incurred']}
                        selected={filters.type}
                        onChange={selected => handleFilterChange('type', selected)}
                        placeholder="Select Types"
                    />
                </div>

                {/* To Account or Account Filter */}
                {showToAccount ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
                        <SearchableMultiSelectDropdown
                            options={allAccounts.filter(a => a.type === 'friend').map(a => a.name)}
                            selected={filters.to_account}
                            onChange={selected => handleFilterChange('to_account', selected)}
                            placeholder="Select To Account"
                        />
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Accounts</label>
                        <SearchableMultiSelectDropdown
                            options={getFilteredAccounts().map(a => a.name)}
                            selected={filters.accounts}
                            onChange={selected => handleFilterChange('accounts', selected)}
                            placeholder="Select Accounts"
                        />
                    </div>
                )}

                {/* Category Filter (Multi-select) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categories</label>
                    <MultiSelectDropdown
                        options={allCategories}
                        selected={filters.categories}
                        onChange={selected => handleFilterChange('categories', selected)}
                        placeholder="Select Categories"
                    />
                </div>
                
                {/* Amount Range Filter */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount Range</label>
                    <div className="flex gap-2">
                        <input 
                            type="number" 
                            placeholder="Min" 
                            value={filters.minAmount} 
                            onChange={e => handleFilterChange('minAmount', e.target.value)} 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                        <input 
                            type="number" 
                            placeholder="Max" 
                            value={filters.maxAmount} 
                            onChange={e => handleFilterChange('maxAmount', e.target.value)} 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                    </div>
                </div>
                
                <button 
                    onClick={resetFilters} 
                    className="w-full py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    Reset Filters
                </button>
            </div>
        );
    }, [searchInput, filters, handleFilterChange, getFilteredAccounts, allCategories, allAccounts]);

    // Handler for deleting the latest transaction
    const handleDeleteLatest = async () => {
    if (!window.confirm('Are you sure you want to delete the latest transaction?')) return;

    try {
        await apiService.deleteLatestTransaction();
        fetchTransactions(true);               // refresh the list
    } catch (error: unknown) {               // ① don’t use any
        const message =
        error instanceof Error               // ② narrow to Error
            ? error.message
            : 'Failed to delete transaction';
        alert(message);
    }
    };


    return (
      <div>
          <Navbar />
        <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
            {/* --- DESKTOP FILTERS SIDEBAR --- */}
            <aside className="hidden lg:block w-72 bg-white p-6 border-r border-gray-200">
                <h2 className="text-xl font-semibold mb-6">Filters</h2>
                {FilterSidebar}
            </aside>

            {/* --- MOBILE FILTERS OVERLAY --- */}
            {isMobileFiltersOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden">
                    <div className="fixed left-0 top-0 bottom-0 w-80 bg-white p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold">Filters</h2>
                            <button 
                                onClick={() => setIsMobileFiltersOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        {FilterSidebar}
                    </div>
                </div>
            )}

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 p-4 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    {/* --- DELETE LATEST TRANSACTION BUTTON --- */}
                    <div className="flex justify-end mb-4">
                        <button
                            onClick={handleDeleteLatest}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow"
                        >
                            Delete Latest Transaction
                        </button>
                    </div>
                    {/* --- MOBILE HEADER WITH FILTER BUTTON --- */}
                    <div className="flex items-center justify-between mb-6 lg:hidden">
                        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
                        <button 
                            onClick={() => setIsMobileFiltersOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Filter size={18} />
                            Filters
                            {hasActiveFilters && (
                                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                                    !
                                </span>
                            )}
                        </button>
                    </div>

                    {/* --- TRANSACTIONS TABLE --- */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-gray-200">
                                    <tr>
                                        <th className="p-4 font-semibold whitespace-nowrap">Date</th>
                                        <th className="p-4 font-semibold">Place/Description</th>
                                        <th className="p-4 font-semibold whitespace-nowrap">Category</th>
                                        <th className="p-4 font-semibold whitespace-nowrap">Account</th>
                                        <th className="p-4 font-semibold text-right whitespace-nowrap">Amount</th>
                                        {/* No separate balance column */}
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((transaction, index) => {
                                        const isLastElement = transactions.length === index + 1;
                                        return (
                                            <tr key={transaction.id} ref={isLastElement ? lastTransactionElementRef : null} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{new Date(transaction.date).toLocaleDateString()}</td>
                                                <td className="p-4 min-w-0">
                                                    <div className="font-medium text-gray-800 truncate">{transaction.place}</div>
                                                    <div className="text-sm text-gray-500 truncate">{transaction.description}</div>
                                                </td>
                                                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{transaction.category}</td>
                                                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">{transaction.account}</td>
                                                <td className={`p-4 font-semibold text-right whitespace-nowrap ${
                                                    transaction.type === 'transferred' ? 'text-orange-600' :
                                                    transaction.type === 'debt_incurred' ? 'text-purple-600' :
                                                    transaction.type === 'self_transferred' ? 'text-blue-600' :
                                                    transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                                                  }`}>
                                                    <div>
                                                        {transaction.type === 'credit' ? '+ ' : 
                                                          transaction.type === 'transferred' ? '↗ ' : 
                                                          transaction.type === 'self_transferred' ? '↔ ' : 
                                                          transaction.type === 'debt_incurred' ? '↙ ' : '- '}₹{transaction.amount.toLocaleString()}
                                                    </div>
                                                    <div className="text-xs text-gray-500 font-normal mt-1">
                                                        Bal: ₹{transaction.transaction_balance !== undefined ? transaction.transaction_balance.toLocaleString() : '--'}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card Layout */}
                        <div className="md:hidden">
                            {transactions.map((transaction, index) => {
                                const isLastElement = transactions.length === index + 1;
                                return (
                                    <div 
                                        key={transaction.id} 
                                        ref={isLastElement ? lastTransactionElementRef : null}
                                        className="border-b border-gray-100 p-4 space-y-3"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-gray-800 truncate">{transaction.place}</div>
                                                <div className="text-sm text-gray-500 truncate">{transaction.description}</div>
                                            </div>
                                            <div className={`font-semibold text-right ml-4 ${transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                                <div>
                                                    {transaction.type === 'credit' ? '+' : '-'}₹{transaction.amount.toLocaleString()}
                                                </div>
                                                <div className="text-xs text-gray-500 font-normal mt-1">Bal: ₹{transaction.transaction_balance !== undefined ? transaction.transaction_balance.toLocaleString() : '--'}</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                                            <span className="bg-gray-100 px-2 py-1 rounded">{new Date(transaction.date).toLocaleDateString()}</span>
                                            <span className="bg-gray-100 px-2 py-1 rounded">{transaction.category}</span>
                                            <span className="bg-gray-100 px-2 py-1 rounded">{transaction.account}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {loading && <div className="text-center p-4">Loading more...</div>}
                        {!loading && transactions.length === 0 && (
                            <div className="text-center p-10 text-gray-500">
                                <div className="text-lg mb-2">No transactions found</div>
                                <div className="text-sm">Try adjusting your filters</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
        </div>
    );
};

// --- HELPER COMPONENT: MultiSelectDropdown ---
const MultiSelectDropdown = ({ options, selected, onChange, placeholder }: { options: string[], selected: string[], onChange: (selected: string[]) => void, placeholder: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref]);

    const toggleOption = (option: string) => {
        const newSelected = selected.includes(option)
            ? selected.filter(item => item !== option)
            : [...selected, option];
        onChange(newSelected);
    };

    return (
        <div className="relative" ref={ref}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="w-full flex justify-between items-center px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
            >
                <span className="text-gray-700 truncate">{selected.length > 0 ? `${selected.length} selected` : placeholder}</span>
                <ChevronDown size={18} className={`text-gray-500 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {options.map(option => (
                        <div key={option} className="flex items-center p-2 hover:bg-gray-100 cursor-pointer" onClick={() => toggleOption(option)}>
                            <input 
                                type="checkbox" 
                                readOnly 
                                checked={selected.includes(option)} 
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0" 
                            />
                            <label className="ml-3 text-sm text-gray-700 truncate">{option}</label>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- NEW HELPER COMPONENT: SearchableMultiSelectDropdown ---
const SearchableMultiSelectDropdown = ({ options, selected, onChange, placeholder }: { options: string[], selected: string[], onChange: (selected: string[]) => void, placeholder: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref]);

    const toggleOption = (option: string) => {
        const newSelected = selected.includes(option)
            ? selected.filter(item => item !== option)
            : [...selected, option];
        onChange(newSelected);
    };

    // Filter options based on search term
    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="relative" ref={ref}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="w-full flex justify-between items-center px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
            >
                <span className="text-gray-700 truncate">{selected.length > 0 ? `${selected.length} selected` : placeholder}</span>
                <ChevronDown size={18} className={`text-gray-500 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
                    {/* Search Input */}
                    <div className="p-2 border-b border-gray-200">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search accounts..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    
                    {/* Options List */}
                    <div className="max-h-48 overflow-y-auto">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(option => (
                                <div key={option} className="flex items-center p-2 hover:bg-gray-100 cursor-pointer" onClick={() => toggleOption(option)}>
                                    <input 
                                        type="checkbox" 
                                        readOnly 
                                        checked={selected.includes(option)} 
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0" 
                                    />
                                    <label className="ml-3 text-sm text-gray-700 truncate">{option}</label>
                                </div>
                            ))
                        ) : (
                            <div className="p-3 text-sm text-gray-500 text-center">
                                No accounts found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;