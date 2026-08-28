const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanelSection.tsx', 'utf8');

// 1. Add useAuth import
code = code.replace(
  "import { useSupabaseError } from '../hooks/useSupabaseError';",
  "import { useSupabaseError } from '../hooks/useSupabaseError';\nimport { useAuth } from '../contexts/AuthContext';"
);

// 2. Add useAuth inside component
code = code.replace(
  "export default function AdminPanelSection() {\n  const { handleSupabaseError }",
  "export default function AdminPanelSection() {\n  const { user } = useAuth();\n  const isRestrictedAdmin = user?.email?.toLowerCase() === 'adewaleogunkeye200@gmail.com';\n  const { handleSupabaseError }"
);

// 3. Set default adminSubTab based on role
code = code.replace(
  "const [adminSubTab, setAdminSubTab] = React.useState<'service-plans' | 'opay-receipts' | 'mozosubz-plans' | 'pricing-manager' | 'dashboard' | 'transactions' | 'user-mgmt' | 'provider-status'>('dashboard');",
  "const [adminSubTab, setAdminSubTab] = React.useState<'service-plans' | 'opay-receipts' | 'mozosubz-plans' | 'pricing-manager' | 'dashboard' | 'transactions' | 'user-mgmt' | 'provider-status'>(isRestrictedAdmin ? 'user-mgmt' : 'dashboard');"
);

fs.writeFileSync('src/components/AdminPanelSection.tsx', code);
