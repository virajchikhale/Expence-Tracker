"use client"
// import React, { useState, useEffect, Fragment, useRef } from 'react';
import React, { useState, useEffect, useRef } from 'react';
import type { User } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Home, 
  BarChart3, 
  Receipt, 
  LogOut, 
  Menu, 
  X, 
  Wallet,
  ChevronDown 
} from 'lucide-react';
import { apiService } from '@/lib/api';

const UserDropdown = ({ user, onLogout, mobile = false }: { user: User | null, onLogout: () => void, mobile?: boolean }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!user) return <div className="w-9 h-9 rounded-full bg-gray-300 animate-pulse" />;

  const initials = user.full_name ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : user.email[0].toUpperCase();

  // Mobile: always show details, no dropdown
  if (mobile) {
    return (
      <div className="flex flex-col items-start gap-2 p-2 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">{initials}</div>
          <span className="font-semibold text-gray-900 text-base">{user.full_name || user.username}</span>
        </div>
        <span className="text-xs text-gray-500">{user.email}</span>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors mt-2"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    );
  }

  // Desktop: avatar and name, dropdown on click
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center gap-2 pl-4 focus:outline-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">{initials}</div>
        <span className="font-semibold text-gray-900 dark:text-white text-sm">{user.full_name || user.username}</span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">{initials}</div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">{user.full_name || user.username}</div>
              <div className="text-xs text-gray-500 dark:text-gray-300">{user.email}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
};

const Navbar = () => {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState('light');
  console.log(theme);
  // Fetch user info on mount
  useEffect(() => {
    apiService.getCurrentUser().then((u: User) => setUser(u)).catch(() => setUser(null));
    // Theme: only check localStorage, ignore system theme
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Toggle dark/light mode (functional, persists in localStorage)
  // const toggleTheme = () => {
  //   setTheme((prev) => {
  //     const newTheme = prev === 'light' ? 'dark' : 'light';
  //     if (newTheme === 'dark') {
  //       document.documentElement.classList.add('dark');
  //       localStorage.setItem('theme', 'dark');
  //     } else {
  //       document.documentElement.classList.remove('dark');
  //       localStorage.setItem('theme', 'light');
  //     }
  //     return newTheme;
  //   });
  // };
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      current: pathname === '/dashboard'
    },
    {
      name: 'Transactions',
      href: '/transactions',
      icon: Receipt,
      current: pathname === '/transactions'
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: BarChart3,
      current: pathname === '/reports'
    }
  ];

  const handleLogout = async () => {
    try {
      localStorage.clear();
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleNavigation = (href: string) => {
    router.push(href);
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="bg-white dark:bg-black shadow-sm border-b border-gray-200 dark:border-gray-800 p-2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="flex justify-between h-16">
          {/* Logo and brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">FinanceTracker</span>
            </div>
          </div>

          {/* Desktop navigation + user + theme toggle */}
          <div className="hidden md:flex items-center space-x-4">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavigation(item.href)}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    item.current
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:text-white dark:hover:bg-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.name}
                </button>
              );
            })}

            {/* Theme toggle button */}
            {/* <button
              onClick={toggleTheme}
              className="flex items-center px-2 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
              title="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button> */}

            {/* User avatar and name with dropdown */}
            <UserDropdown user={user} onLogout={handleLogout} />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-gray-600 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => handleNavigation(item.href)}
                    className={`flex items-center w-full px-3 py-2 rounded-lg text-base font-medium transition-colors ${
                      item.current
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:text-white dark:hover:bg-gray-900'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </button>
                );
              })}
              {/* User dropdown for mobile */}
              <div className="mt-4">
                <UserDropdown user={user} onLogout={handleLogout} mobile />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;