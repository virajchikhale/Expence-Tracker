import Link from 'next/link'
import { DollarSign, TrendingUp, Shield, BarChart3 } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-indigo-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">Finance Manager</span>
            </div>
            <div className="flex space-x-4">
              <Link href="/auth/login">
                <button className="text-gray-700 hover:text-indigo-600 px-4 py-2 rounded-md font-medium">
                  Login
                </button>
              </Link>
              <Link href="/auth/register">
                <button className="bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700">
                  Get Started
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Take Control of Your
            <span className="text-indigo-600"> Finances</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Track expenses, manage budgets, and achieve your financial goals with our comprehensive finance management platform.
          </p>
          <Link href="/auth/register">
            <button className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-medium text-lg hover:bg-indigo-700 transition-colors">
              Start Managing Your Money
            </button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="text-center p-6 bg-white rounded-lg shadow-md">
            <TrendingUp className="h-12 w-12 text-indigo-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Expense Tracking</h3>
            <p className="text-gray-600">Monitor your spending patterns and categorize expenses automatically.</p>
          </div>
          <div className="text-center p-6 bg-white rounded-lg shadow-md">
            <BarChart3 className="h-12 w-12 text-indigo-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Budget Planning</h3>
            <p className="text-gray-600">Set budgets and get alerts when you&apos;re approaching limits.</p>
          </div>
          <div className="text-center p-6 bg-white rounded-lg shadow-md">
            <Shield className="h-12 w-12 text-indigo-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Secure & Private</h3>
            <p className="text-gray-600">Your financial data is encrypted and stored securely.</p>
          </div>
        </div>
      </main>
    </div>
  )
}