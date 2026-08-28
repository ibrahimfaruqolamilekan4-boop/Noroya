const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanelSection.tsx', 'utf8');

code = code.replace(
  "{adminSubTab === 'service-plans' && (",
  "{!isRestrictedAdmin && adminSubTab === 'service-plans' && ("
);

code = code.replace(
  "{adminSubTab === 'mozosubz-plans' && (",
  "{!isRestrictedAdmin && adminSubTab === 'mozosubz-plans' && ("
);

code = code.replace(
  "{adminSubTab === 'opay-receipts' && (",
  "{!isRestrictedAdmin && adminSubTab === 'opay-receipts' && ("
);

code = code.replace(
  "{adminSubTab === 'pricing-manager' && (",
  "{!isRestrictedAdmin && adminSubTab === 'pricing-manager' && ("
);

fs.writeFileSync('src/components/AdminPanelSection.tsx', code);
