// web/src/routes.tsx
// Route definitions with guards

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Verify } from './pages/Verify';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { Profile } from './pages/Profile';
import { HowItWorks } from './pages/HowItWorks';
import { Dev } from './pages/Dev';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Profile completeness checked in Home/Profile pages
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function Routes() {
  const location = useLocation();

  return (
    <>
      {/* Public routes */}
      <Route path="/login" element={
        <PublicOnly><Login /></PublicOnly>
      } />
      <Route path="/verify" element={
        <PublicOnly><Verify /></PublicOnly>
      } />

      {/* Protected routes with layout */}
      <Route element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }>
        <Route path="/" element={
          <RequireProfile><Home /></RequireProfile>
        } />
        <Route path="/history" element={
          <RequireProfile><History /></RequireProfile>
        } />
        <Route path="/profile" element={
          <RequireProfile><Profile /></RequireProfile>
        } />
        <Route path="/how-it-works" element={
          <RequireProfile><HowItWorks /></RequireProfile>
        } />
      </Route>

      {/* Dev route (mock only) */}
      <Route path="/dev" element={
        <RequireAuth><Dev /></RequireAuth>
      } />

      {/* Redirect root */}
      <Route index element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  );
}

// Simple Route component for inline route definitions
function Route({ path, element }: { path: string; element: React.ReactNode }) {
  return <route path={path} element={element} />;
}

// We'll use react-router-dom's Routes in the actual component
import { Routes as RRRoutes, Route as RRRoute } from 'react-router-dom';

export function AppRoutes() {
  const location = useLocation();

  return (
    <RRRoutes>
      <RRRoute path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <RRRoute path="/verify" element={<PublicOnly><Verify /></PublicOnly>} />
      
      <RRRoute element={<RequireAuth><Layout /></RequireAuth>}>
        <RRRoute path="/" element={<RequireProfile><Home /></RequireProfile>} />
        <RRRoute path="/history" element={<RequireProfile><History /></RequireProfile>} />
        <RRRoute path="/profile" element={<RequireProfile><Profile /></RequireProfile>} />
        <RRRoute path="/how-it-works" element={<RequireProfile><HowItWorks /></RequireProfile>} />
      </RRRoute>

      <RRRoute path="/dev" element={<RequireAuth><Dev /></RequireAuth>} />
      
      <RRRoute index element={<Navigate to="/" replace />} />
      <RRRoute path="*" element={<Navigate to="/" replace />} />
    </RRRoutes>
  );
}