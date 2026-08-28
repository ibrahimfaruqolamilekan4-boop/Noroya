const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `  const requireAdmin = async (req: any, res: any): Promise<boolean> => {
    const token = (req.headers.authorization || "").replace(/^Bearer /i, "").trim();
    if (!token) { res.status(401).json({ error: "Unauthorized: no session token." }); return false; }
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) { res.status(401).json({ error: "Unauthorized: invalid session." }); return false; }
      if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        res.status(403).json({ error: "Forbidden: admin access only." }); return false;
      }
      return true;
    } catch (e) {
      res.status(401).json({ error: "Unauthorized." }); return false;
    }
  };`;

const replacement1 = `  const requireAdmin = async (req: any, res: any, allowSubAdmin = false): Promise<boolean> => {
    const token = (req.headers.authorization || "").replace(/^Bearer /i, "").trim();
    if (!token) { res.status(401).json({ error: "Unauthorized: no session token." }); return false; }
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) { res.status(401).json({ error: "Unauthorized: invalid session." }); return false; }
      const email = user.email?.toLowerCase() || '';
      const isMainAdmin = email === ADMIN_EMAIL.toLowerCase();
      const isSubAdmin = email === 'adewaleogunkeye200@gmail.com';
      if (!isMainAdmin && !(allowSubAdmin && isSubAdmin)) {
        res.status(403).json({ error: "Forbidden: admin access only." }); return false;
      }
      return true;
    } catch (e) {
      res.status(401).json({ error: "Unauthorized." }); return false;
    }
  };`;

code = code.replace(target1, replacement1);

// Now update the user management endpoints to allow sub admin
const endpointsToUpdate = [
  'app.get("/api/admin/users"',
  'app.get("/api/admin/users/:id"',
  'app.post("/api/admin/users/:id/adjust-balance"'
];

for (const ep of endpointsToUpdate) {
  const index = code.indexOf(ep);
  if (index !== -1) {
    const nextLineIdx = code.indexOf('if (!await requireAdmin(req, res)) return;', index);
    if (nextLineIdx !== -1) {
      code = code.substring(0, nextLineIdx) + 'if (!await requireAdmin(req, res, true)) return;' + code.substring(nextLineIdx + 'if (!await requireAdmin(req, res)) return;'.length);
    }
  }
}

fs.writeFileSync('server.ts', code);
