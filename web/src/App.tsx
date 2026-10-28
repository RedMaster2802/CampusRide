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

export function App() {
  const isOnline = useOnline();

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