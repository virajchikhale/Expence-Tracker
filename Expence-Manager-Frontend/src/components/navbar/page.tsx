"use client"
import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Home, 
  BarChart3, 
  Receipt, 
  LogOut, 
  Menu, 
  X, 
  Wallet 
} from 'lucide-react';

const Navbar = () => {
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
    <nav className="bg-white shadow-sm border-b border-gray-200 p-2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <span className="ml-2 text-xl font-bold text-gray-900">FinanceTracker</span>
            </div>
          </div>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavigation(item.href)}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    item.current
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.name}
                </button>
              );
            })}
            
            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
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
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-gray-200">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => handleNavigation(item.href)}
                    className={`flex items-center w-full px-3 py-2 rounded-lg text-base font-medium transition-colors ${
                      item.current
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </button>
                );
              })}
              
              {/* Mobile logout button */}
              <button
                onClick={handleLogout}
                className="flex items-center w-full px-3 py-2 rounded-lg text-base font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-5 w-5 mr-3" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;