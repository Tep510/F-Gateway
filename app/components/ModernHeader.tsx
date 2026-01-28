'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';

interface ModernHeaderProps {
  scope: string; // Client code (e.g., "MNG") or "Admin"
  clientName?: string | null; // Client name (e.g., "もりのがっこう")
  userEmail: string;
  role?: string;
}

export default function ModernHeader({ scope, clientName, userEmail, role }: ModernHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showPermissionError, setShowPermissionError] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Determine if we're in admin mode based on the path
  const isAdminMode = pathname?.startsWith('/admin');
  const displayScope = isAdminMode ? 'Admin' : scope;

  const isActive = (path: string) => pathname === path;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  const handleScopeChange = (newScope: 'Client' | 'Admin') => {
    setIsUserMenuOpen(false);

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

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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

  const navigation = isAdminMode ? adminNav : clientNav;

  const themeOptions = [
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
    { key: 'system', label: 'System' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800">
      {/* Permission Error Toast */}
      {showPermissionError && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg shadow-lg z-50">
          権限がありません
        </div>
      )}

      {/* Top section */}
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Left - Breadcrumb with client info */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-gray-900 dark:text-white hover:text-gray-600 dark:hover:text-gray-300 font-medium">
            F-Gateway
          </Link>
          {isAdminMode ? (
            <>
              <span className="text-gray-400 dark:text-gray-600">/</span>
              <span className="text-gray-900 dark:text-white font-medium">Admin</span>
            </>
          ) : (
            <>
              {scope && scope !== 'Client' && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">/</span>
                  <span className="text-gray-900 dark:text-white font-medium">{scope}</span>
                </>
              )}
              {clientName && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">/</span>
                  <span className="text-gray-600 dark:text-gray-400">{clientName}</span>
                </>
              )}
            </>
          )}
        </div>

        {/* Right - User menu */}
        <div className="flex items-center gap-2">
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-2 py-1.5"
            >
              {/* Current scope badge */}
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400 font-medium">
                {displayScope}
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">{userEmail}</span>
              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  {/* Scope section */}
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Scope</span>
                  </div>
                  <button
                    onClick={() => handleScopeChange('Client')}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between ${
                      !isAdminMode ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {scope !== 'Admin' ? scope : 'Client'}
                    </span>
                    {!isAdminMode && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleScopeChange('Admin')}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between ${
                      isAdminMode ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                    } ${role !== 'admin' ? 'opacity-50' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Admin
                      {role !== 'admin' && <span className="text-xs text-gray-400 ml-1">(権限なし)</span>}
                    </span>
                    {isAdminMode && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {/* Divider */}
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                  {/* Theme section */}
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Theme</span>
                  </div>
                  {mounted && themeOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => handleThemeChange(option.key)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between ${
                        theme === option.key ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {option.label}
                      {theme === option.key && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}

                  {/* Divider */}
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                  {/* Sign out */}
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
      <nav className="px-6 border-t border-gray-100 dark:border-gray-800">
        <div className="flex gap-6 overflow-x-auto">
          {navigation.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`
                py-3 text-sm whitespace-nowrap border-b-2 transition-colors
                ${
                  isActive(item.path)
                    ? 'border-white dark:border-white text-black dark:text-white font-medium'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
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
