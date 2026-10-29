// web/src/App.tsx
// Main app component with routing and providers

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppRoutes } from './routes';
import { AuthProvider } from './hooks/useAuth';
import { useOnline } from './hooks/useOnline';
import { Banner } from './components/Banner';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ConfigError() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-text">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold">App is not configured</h1>
        <p className="text-text-secondary">
          Missing required environment variables. Please set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
        <p className="text-xs text-text-secondary">
          For local development, you can set <code>VITE_USE_MOCK=true</code> to use the mock backend.
        </p>
      </div>
    </div>
  );
}

export function App() {
  const isOnline = useOnline();
  const isMock = import.meta.env.VITE_USE_MOCK === 'true';
  const hasConfig = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  if (!isMock && !hasConfig) {
    return <ConfigError />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <div className="min-h-screen bg-background text-text dark:bg-dark-background dark:text-dark-text">
            {!isOnline && (
              <Banner type="warning" message="You are offline. Some features may not work." />
            )}
            <AppRoutes />
            <Toaster 
              position="bottom-center" 
              toastOptions={{ 
                className: 'border border-border bg-background dark:bg-dark-background',
                duration: 4000,
              }} 
            />
          </div>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}