import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasRestoredSession = useAuthStore((state) => state.hasRestoredSession);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const tryRestore = async () => {
      if (!hasRestoredSession && !isAuthenticated) {
        setChecking(true);
        try {
          await restoreSession();
        } finally {
          setChecking(false);
        }
      }
    };
    tryRestore();
  }, [hasRestoredSession, isAuthenticated, restoreSession]);

  if (checking || !hasRestoredSession) {
    return (
      <div className="main-content">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
