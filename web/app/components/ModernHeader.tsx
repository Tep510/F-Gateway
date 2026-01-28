'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

interface ModernHeaderProps {
  scope: string; // "DAQ" or "Admin"
  userEmail: string;
  role?: string;
}

export default function ModernHeader({ scope, userEmail, role }: ModernHeaderProps) {
  const pathname = usePathname();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  // クライアント側のナビゲーション
  const clientNav = [
    { name: 'ダッシュボード', path: '/client' },
    { name: '出庫', path: '/client/shipping' },
    { name: '入庫', path: '/client/receiving' },
    { name: '商品マスタ', path: '/client/items' },
  ];

  // 管理者側のナビゲーション
  const adminNav = [
    { name: 'ダッシュボード', path: '/admin' },
    { name: 'クライアント', path: '/admin/clients' },
    { name: 'ユーザー', path: '/admin/users' },
    { name: 'ログ', path: '/admin/logs' },
    { name: '設定', path: '/admin/settings' },
  ];

  const navigation = scope === 'Admin' ? adminNav : clientNav;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      {/* Top section */}
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Left - Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-gray-900 hover:text-gray-600 font-medium">
            F-Gateway
          </Link>
          <span className="text-gray-400">/</span>
          <button className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 rounded text-gray-900 font-medium">
            {scope}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Right - User menu */}
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 hover:bg-gray-100 rounded px-2 py-1.5"
            >
              <span className="text-sm text-gray-700">{userEmail}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  {role === 'admin' && (
                    <Link href="/client" className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      → クライアント画面へ
                    </Link>
                  )}
                  {role === 'client' && (
                    <Link href="/admin" className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      → 管理者画面へ
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    サインアウト
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-6 border-t border-gray-100">
        <div className="flex gap-6 overflow-x-auto">
          {navigation.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`
                py-3 text-sm whitespace-nowrap border-b-2 transition-colors
                ${
                  isActive(item.path)
                    ? 'border-blue-600 text-gray-900 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }
              `}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
