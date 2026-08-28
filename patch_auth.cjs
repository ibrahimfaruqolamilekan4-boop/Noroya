const fs = require('fs');
let code = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');

// 1. Add optimistic load
code = code.replace(
  "        const sbUser = session.user;\n",
  `        const sbUser = session.user;

        // OPTIMISTIC LOAD: Check for cached real profile to unblock UI immediately
        const cachedRealUser = localStorage.getItem(\`vtu_user_cache_\${sbUser.id}\`);
        if (cachedRealUser) {
          try {
             const parsedCache = JSON.parse(cachedRealUser);
             setUserProfile(parsedCache);
             setLoading(false); // Unblock the UI instantly!
          } catch (e) {}
        } else {
             // If no cache, at least unblock with basic user details
             setUserProfile({
               uid: sbUser.id, 
               email: sbUser.email || '', 
               fullName: sbUser.user_metadata?.fullName || sbUser.user_metadata?.name || sbUser.email?.split('@')[0] || 'User',
               balance: 0, 
               wallet_balance: 0, 
               role: sbUser.email?.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com' ? 'admin' : 'user', 
               referralCode: '', 
               phoneNumber: '', 
               transactionPin: '', 
               createdAt: new Date().toISOString()
             });
             setLoading(false);
        }\n`
);

// 2. Set item on defaultProfile
code = code.replace(
  "        setUserProfile(defaultProfile);\n        setLoading(false);",
  "        setUserProfile(defaultProfile);\n        localStorage.setItem(`vtu_user_cache_${sbUser.id}`, JSON.stringify(defaultProfile));\n        setLoading(false);"
);

// 3. fetchLatestSupabaseProfile update
code = code.replace(
  "                return {\n                  ...base,\n                  fullName: data.name || data.username || base.fullName,\n                  balance: latestBalance,\n                  wallet_balance: latestBalance,\n                  phoneNumber: data.phone_number || base.phoneNumber,\n                  transactionPin: data.transaction_pin || base.transactionPin,\n                };",
  "                const updatedProfile = {\n                  ...base,\n                  fullName: data.name || data.username || base.fullName,\n                  balance: latestBalance,\n                  wallet_balance: latestBalance,\n                  phoneNumber: data.phone_number || base.phoneNumber,\n                  transactionPin: data.transaction_pin || base.transactionPin,\n                };\n                localStorage.setItem(`vtu_user_cache_${sbUser.id}`, JSON.stringify(updatedProfile));\n                return updatedProfile;"
);

// 4. postgres_changes update
code = code.replace(
  "                  return {\n                    ...base,\n                    fullName: updated.name || updated.username || base.fullName,\n                    balance: latestBalance,\n                    wallet_balance: latestBalance,\n                    phoneNumber: updated.phone_number || base.phoneNumber,\n                    transactionPin: updated.transaction_pin || base.transactionPin,\n                  };",
  "                  const newProfile = {\n                    ...base,\n                    fullName: updated.name || updated.username || base.fullName,\n                    balance: latestBalance,\n                    wallet_balance: latestBalance,\n                    phoneNumber: updated.phone_number || base.phoneNumber,\n                    transactionPin: updated.transaction_pin || base.transactionPin,\n                  };\n                  localStorage.setItem(`vtu_user_cache_${sbUser.id}`, JSON.stringify(newProfile));\n                  return newProfile;"
);

// 5. Sign out update
code = code.replace(
  "  const signOut = async () => {\n    localStorage.removeItem('vtu_simulated_user');",
  "  const signOut = async () => {\n    if (userProfile) {\n      localStorage.removeItem(`vtu_user_cache_${userProfile.uid}`);\n    }\n    localStorage.removeItem('vtu_simulated_user');"
);

fs.writeFileSync('src/contexts/AuthContext.tsx', code);
