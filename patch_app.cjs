const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "import React from 'react';\nimport LandingPage from './components/LandingPage';\nimport AuthPage from './components/AuthPage';\nimport Dashboard from './components/Dashboard';",
  "import React, { Suspense, lazy } from 'react';\nimport LandingPage from './components/LandingPage';\n\nconst AuthPage = lazy(() => import('./components/AuthPage'));\nconst Dashboard = lazy(() => import('./components/Dashboard'));"
);

code = code.replace(
  "      {!user && !showAuth && (\n        <LandingPage onAuth={() => setShowAuth(true)} />\n      )}\n      {!user && showAuth && (\n        <AuthPage onBack={() => setShowAuth(false)} />\n      )}\n      {user && (\n        <Dashboard user={user} onLogout={() => {}} />\n      )}",
  "      <Suspense fallback={\n        <div className=\"min-h-screen flex items-center justify-center\" style={{ backgroundColor: '#EDEDE9' }}>\n          <div className=\"flex flex-col items-center gap-4\">\n            <div className=\"w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg\" style={{ backgroundColor: '#3B7A3B' }}>\n              <span className=\"text-white font-black text-xl\">N</span>\n            </div>\n            <div className=\"w-6 h-6 border-2 border-t-transparent rounded-full animate-spin\" style={{ borderColor: '#3B7A3B', borderTopColor: 'transparent' }} />\n          </div>\n        </div>\n      }>\n        {!user && !showAuth && (\n          <LandingPage onAuth={() => setShowAuth(true)} />\n        )}\n        {!user && showAuth && (\n          <AuthPage onBack={() => setShowAuth(false)} />\n        )}\n        {user && (\n          <Dashboard user={user} onLogout={() => {}} />\n        )}\n      </Suspense>"
);

fs.writeFileSync('src/App.tsx', code);
