const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Change the main wrapper to include print:hidden and <>
const mainWrapperTarget = `  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EDEDE9', fontFamily: "'Inter', system-ui, sans-serif" }}>`;
const mainWrapperReplacement = `  return (
    <>
    <div className="min-h-screen print:hidden" style={{ backgroundColor: '#EDEDE9', fontFamily: "'Inter', system-ui, sans-serif" }}>`;

code = code.replace(mainWrapperTarget, mainWrapperReplacement);

// 2. Insert the Poster and Modal at the end of the Dashboard component (before DashboardOverview)
const endTarget = `    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Dashboard Overview`;

const endReplacement = `    </div>

      {/* Global QR Modal */}
      <AnimatePresence>
        {showGlobalQR && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGlobalQR(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm print:hidden"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl z-10 max-w-sm w-full text-center print:hidden"
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
                  id="global-qr-code"
                  value={\`\${window.location.origin}/signup?ref=\${user.referralCode}\`}
                  size={220}
                  bgColor={"#ffffff"}
                  fgColor={"#132613"}
                  level={"H"}
                />
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(\`\${window.location.origin}/signup?ref=\${user.referralCode}\`);
                    toast.success('Link copied!');
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all text-sm"
                  style={{ backgroundColor: '#3B7A3B' }}
                >
                  Copy Link
                </button>
                <button 
                  onClick={() => downloadQR("global-qr-code", "NORODATA-QR.png")}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200 text-sm"
                >
                  Download PNG
                </button>
              </div>
              <div className="mt-2">
                <button 
                  onClick={() => window.print()}
                  className="w-full py-3 rounded-xl font-bold text-gray-900 bg-white border-2 border-gray-100 hover:border-gray-300 active:scale-95 transition-all flex justify-center items-center gap-2 text-sm"
                >
                  🖨️ Print A4 Flyer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* A4 Printable Flyer (Only visible when printing) */}
      <div className="hidden print:flex fixed inset-0 z-[999999] bg-white w-full h-full flex-col items-center justify-center text-center p-8">
        <div className="w-32 h-32 rounded-[2rem] flex items-center justify-center bg-[#3B7A3B] mb-6 shadow-lg border-4 border-gray-100">
          <span className="text-white font-black text-7xl">N</span>
        </div>
        <h1 className="text-6xl font-black text-gray-900 mb-4 tracking-tighter">NORODATA</h1>
        <h2 className="text-4xl font-bold text-[#3B7A3B] mb-16 tracking-tight">Buy Cheap Data Instantly!</h2>
        
        <div className="p-6 bg-white border-4 border-gray-100 rounded-[2rem] shadow-sm inline-block mb-16">
          <QRCode
            value={\`\${window.location.origin}/signup?ref=\${user.referralCode}\`}
            size={400}
            bgColor={"#ffffff"}
            fgColor={"#132613"}
            level={"H"}
          />
        </div>
        
        <p className="text-3xl font-bold text-gray-800 leading-snug">Scan to join & send money to<br/>{user.fullName}</p>
        <p className="text-2xl font-black mt-6 tracking-wide text-[#3B7A3B]">{window.location.origin}</p>
      </div>

    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Dashboard Overview`;

code = code.replace(endTarget, endReplacement);
fs.writeFileSync('src/components/Dashboard.tsx', code);
console.log("Done");
