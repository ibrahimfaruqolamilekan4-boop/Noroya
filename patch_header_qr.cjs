const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const stateTarget = `  const [activeTab, setActiveTab] = React.useState<TabType>('dashboard');`;
const stateReplacement = `  const [activeTab, setActiveTab] = React.useState<TabType>('dashboard');
  const [showGlobalQR, setShowGlobalQR] = React.useState(false);`;
code = code.replace(stateTarget, stateReplacement);


const headerTarget = `            {/* Deposit funds button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-fund-modal'))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ backgroundColor: '#3B7A3B' }}
            >
              <span className="text-base leading-none">+</span>
              <span>Deposit funds</span>
            </button>`;
const headerReplacement = `            <button
              onClick={() => setShowGlobalQR(true)}
              className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all border border-gray-200"
              title="Show my QR Code"
            >
              <Scan size={18} />
            </button>
            {/* Deposit funds button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-fund-modal'))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ backgroundColor: '#3B7A3B' }}
            >
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">Deposit funds</span>
              <span className="sm:hidden">Deposit</span>
            </button>
            <button
              onClick={() => setShowGlobalQR(true)}
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 text-gray-700 active:scale-95 border border-gray-200"
            >
              <Scan size={16} />
            </button>`;
code = code.replace(headerTarget, headerReplacement);

const modalTarget = `      {/* PWA / global events / bottom bar */}
      {/* Mobile bottom nav */}`;
const modalReplacement = `      {/* Global QR Modal */}
      <AnimatePresence>
        {showGlobalQR && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGlobalQR(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl z-10 max-w-sm w-full text-center"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-gray-900 font-black text-lg">My Profile QR</h3>
                <button onClick={() => setShowGlobalQR(false)} className="p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                  <X size={16} />
                </button>
              </div>
              
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3 shadow-sm" style={{ backgroundColor: '#3B7A3B' }}>
                {(user.fullName?.[0] || 'U').toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{user.fullName}</h2>
              <p className="text-sm text-gray-500 mb-5 font-medium">Scan to send money or refer</p>

              <div className="bg-white p-4 rounded-2xl inline-block border-2 border-gray-100 shadow-sm mx-auto mb-5">
                <QRCode
                  value={\`\${window.location.origin}/signup?ref=\${user.referralCode}\`}
                  size={220}
                  bgColor={"#ffffff"}
                  fgColor={"#132613"}
                  level={"H"}
                />
              </div>
              
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(\`\${window.location.origin}/signup?ref=\${user.referralCode}\`);
                  toast.success('Link copied!');
                }}
                className="w-full py-3 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all"
                style={{ backgroundColor: '#3B7A3B' }}
              >
                Copy Link
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PWA / global events / bottom bar */}
      {/* Mobile bottom nav */}`;
code = code.replace(modalTarget, modalReplacement);

fs.writeFileSync('src/components/Dashboard.tsx', code);
