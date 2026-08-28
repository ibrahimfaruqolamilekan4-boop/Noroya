const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `      {!user && !showAuth && (
        <LandingPage onAuth={() => setShowAuth(true)} />
      )}
      {!user && showAuth && (
        <AuthPage onBack={() => setShowAuth(false)} />
      )}
      {user && (
        <Dashboard user={user} onLogout={() => {}} />
      )}`;

const replacement = `      <Suspense fallback={
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
      </Suspense>`;

code = code.replace(target.replace(/\r\n/g, '\n'), replacement.replace(/\r\n/g, '\n'));
fs.writeFileSync('src/App.tsx', code);
