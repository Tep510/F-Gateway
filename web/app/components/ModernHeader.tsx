'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

interface ModernHeaderProps {
  scope: string; // "Client" or "Admin"
  userEmail: string;
  role?: string;
}

export default function ModernHeader({ scope, userEmail, role }: ModernHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false);
  const [showPermissionError, setShowPermissionError] = useState(false);
  const scopeMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => pathname === path;

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  const handleScopeChange = (newScope: 'Client' | 'Admin') => {
    setIsScopeMenuOpen(false);

    if (newScope === 'Admin') {
      if (role === 'admin') {
        router.push('/admin');
      } else {
        setShowPermissionError(true);
        setTimeout(() => setShowPermissionError(false), 3000);
      }
    } else {
      router.push('/client');
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(event.target as Node)) {
        setIsScopeMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    { name: 'インポート', path: '/admin/import' },
    { name: 'ユーザー', path: '/admin/users' },
    { name: 'ログ', path: '/admin/logs' },
    { name: '設定', path: '/admin/settings' },
  ];

  const navigation = scope === 'Admin' ? adminNav : clientNav;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      {/* Permission Error Toast */}
      {showPermissionError && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg shadow-lg z-50">
          権限がありません
        </div>
      )}

      {/* Top section */}
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Left - Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-gray-900 hover:text-gray-600 font-medium">
            F-Gateway
          </Link>
          <span className="text-gray-400">/</span>
          <div className="relative" ref={scopeMenuRef}>
            <button
              onClick={() => setIsScopeMenuOpen(!isScopeMenuOpen)}
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 rounded text-gray-900 font-medium border border-gray-200"
            >
              {scope}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isScopeMenuOpen && (
              <div className="absolute left-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={() => handleScopeChange('Client')}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                      scope === 'Client' ? 'text-blue-600 font-medium' : 'text-gray-700'
                    }`}
                  >
                    Client
                    {scope === 'Client' && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleScopeChange('Admin')}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                      scope === 'Admin' ? 'text-blue-600 font-medium' : 'text-gray-700'
                    }`}
                  >
                    Admin
                    {scope === 'Admin' && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right - User menu */}
        <div className="flex items-center gap-4">
          <div className="relative" ref={userMenuRef}>
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
