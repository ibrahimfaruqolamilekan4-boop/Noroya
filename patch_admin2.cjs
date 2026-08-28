const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanelSection.tsx', 'utf8');

const tabsTarget = `      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-1 md:flex-nowrap bg-slate-100 p-1.5 rounded-2xl max-w-3xl select-none font-bold">`;

const tabsReplacement = `      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-1 md:flex-nowrap bg-slate-100 p-1.5 rounded-2xl max-w-3xl select-none font-bold">
        {!isRestrictedAdmin && (
          <>`;

const tabsEndTarget = `          <button
            onClick={() => setAdminSubTab('user-mgmt')}
            className={\`px-4 py-2 text-sm font-semibold rounded-xl transition \${
              adminSubTab === 'user-mgmt'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }\`}
          >
            👤 User Management
          </button>
          <button
            onClick={() => setAdminSubTab('provider-status')}
            className={\`px-4 py-2 text-sm font-semibold rounded-xl transition \${
              adminSubTab === 'provider-status'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }\`}
          >
            🛰️ Provider Status
          </button>
        {/* Monnify config option completely deleted */}`;

const tabsEndReplacement = `          </>
        )}
          <button
            onClick={() => setAdminSubTab('user-mgmt')}
            className={\`px-4 py-2 text-sm font-semibold rounded-xl transition \${
              adminSubTab === 'user-mgmt'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }\`}
          >
            👤 User Management
          </button>
        {!isRestrictedAdmin && (
          <button
            onClick={() => setAdminSubTab('provider-status')}
            className={\`px-4 py-2 text-sm font-semibold rounded-xl transition \${
              adminSubTab === 'provider-status'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }\`}
          >
            🛰️ Provider Status
          </button>
        )}
        {/* Monnify config option completely deleted */}`;

code = code.replace(tabsTarget, tabsReplacement);
code = code.replace(tabsEndTarget, tabsEndReplacement);

fs.writeFileSync('src/components/AdminPanelSection.tsx', code);
