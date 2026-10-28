// web/src/components/Layout.tsx
// Layout with bottom tab bar

import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from './Button';

const TABS = [
  { path: '/', label: 'Ride' },
  { path: '/history', label: 'History' },
  { path: '/profile', label: 'Profile' },
] as const;

export function Layout() {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 py-4 border-b border-border bg-background/80 dark:bg-dark-background/80 backdrop-blur sticky top-0 z-10">
        <h1 className="font-semibold text-text">GatePool</h1>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 dark:bg-dark-background/95 backdrop-blur pb-safe z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-3 max-w-md mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab.path}
              onClick={() => window.location.href = tab.path}
              className={`py-3 px-4 text-sm font-medium transition-colors ${
                location.pathname === tab.path
                  ? 'text-accent border-t-2 border-accent -mt-px'
                  : 'text-text-secondary hover:text-text dark:text-dark-text-secondary dark:hover:text-dark-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}