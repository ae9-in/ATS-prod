import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiGet, clearAuth, getStoredUser, hasToken } from '../lib/api';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const location = useLocation();
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let mounted = true;

    const verify = async () => {
      if (!hasToken()) {
        if (mounted) setStatus('unauthorized');
        return;
      }

      try {
        await apiGet('/auth/me');
        if (mounted) setStatus('authorized');
      } catch (_) {
        clearAuth();
        if (mounted) setStatus('unauthorized');
      }
    };

    verify();
    return () => {
      mounted = false;
    };
  }, []);

  if (status === 'checking') {
    return <div className="min-h-screen bg-[#eef3f3]" />;
  }

  if (status === 'unauthorized') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const currentUser = getStoredUser();
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
