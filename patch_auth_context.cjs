const fs = require('fs');
let code = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');

const target = "sbUser.email?.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com'";
const replacement = "(sbUser.email?.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com' || sbUser.email?.toLowerCase() === 'adewaleogunkeye200@gmail.com')";

code = code.split(target).join(replacement);

fs.writeFileSync('src/contexts/AuthContext.tsx', code);
