/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import LandingPage from './components/LandingPage';

const AuthPage = lazy(() => import('./components/AuthPage'));
const Dashboard = lazy(() => import('./components/Dashboard'));
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PWAInstallBanner } from './components/PWAInstallBanner';

function AppContent() {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = React.useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EDEDE9' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ backgroundColor: '#3B7A3B' }}
          >
            <span className="text-white font-black text-xl">N</span>
          </div>
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#3B7A3B', borderTopColor: 'transparent' }} />
          <p className="text-sm font-medium" style={{ color: '#3B7A3B' }}>Loading NORODATA…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans antialiased text-slate-900">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: '12px',
            fontWeight: '600',
            fontSize: '14px',
          },
        }}
      />

      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EDEDE9' }}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: '#3B7A3B' }}>
              <span className="text-white font-black text-xl">N</span>
            </div>
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#3B7A3B', borderTopColor: 'transparent' }} />
          </div>
        </div>
      }>
        {!user && !showAuth && (
          <LandingPage onAuth={() => setShowAuth(true)} />
        )}

        {!user && showAuth && (
          <AuthPage onBack={() => setShowAuth(false)} />
        )}

        {user && (
          <Dashboard user={user} onLogout={() => {}} />
        )}
      </Suspense>

      {/* PWA install banner only — AIChatSupport removed */}
      <PWAInstallBanner />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
