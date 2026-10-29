// web/src/routes.tsx
// Route definitions with guards

import { Navigate, useLocation } from 'react-router-dom';
import { Routes as RRRoutes, Route as RRRoute } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuth } from './hooks/useAuth';
import { useProfile } from './hooks/useProfile';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Verify } from './pages/Verify';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { Profile } from './pages/Profile';
import { HowItWorks } from './pages/HowItWorks';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.full_name) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Dev page - only available in mock mode, lazy-loaded to exclude from production bundle
const DevPage = lazy(() => 
  import.meta.env.VITE_USE_MOCK === 'true' 
    ? import('./pages/Dev').then(m => ({ default: m.Dev }))
    : Promise.resolve({ default: () => <Navigate to="/" replace /> })
);

export function AppRoutes() {
  return (
    <RRRoutes>
      {/* Public routes */}
      <RRRoute path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <RRRoute path="/verify" element={<PublicOnly><Verify /></PublicOnly>} />
      <RRRoute path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

      {/* Protected routes with layout */}
      <RRRoute element={<RequireAuth><Layout /></RequireAuth>}>
        <RRRoute path="/" element={<RequireProfile><Home /></RequireProfile>} />
        <RRRoute path="/history" element={<RequireProfile><History /></RequireProfile>} />
        <RRRoute path="/profile" element={<RequireProfile><Profile /></RequireProfile>} />
        <RRRoute path="/how-it-works" element={<RequireProfile><HowItWorks /></RequireProfile>} />
        <RRRoute 
          path="/dev" 
          element={
            <RequireAuth>
              <Suspense fallback={null}>
                <DevPage />
              </Suspense>
            </RequireAuth>
          } 
        />
      </RRRoute>

      {/* Redirect root */}
      <RRRoute index element={<Navigate to="/" replace />} />
      <RRRoute path="*" element={<Navigate to="/" replace />} />
    </RRRoutes>
  );
}