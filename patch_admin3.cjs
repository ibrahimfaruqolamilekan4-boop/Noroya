const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanelSection.tsx', 'utf8');

const target = `      {adminSubTab === 'dashboard' && <DashboardOverviewTab />}
      {adminSubTab === 'transactions' && <TransactionsTab />}
      {adminSubTab === 'user-mgmt' && <UserManagementTab />}
      {adminSubTab === 'provider-status' && <ProviderStatusTab />}`;

const replacement = `      {!isRestrictedAdmin && adminSubTab === 'dashboard' && <DashboardOverviewTab />}
      {!isRestrictedAdmin && adminSubTab === 'transactions' && <TransactionsTab />}
      {adminSubTab === 'user-mgmt' && <UserManagementTab />}
      {!isRestrictedAdmin && adminSubTab === 'provider-status' && <ProviderStatusTab />}`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/AdminPanelSection.tsx', code);
