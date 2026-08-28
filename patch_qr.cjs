const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const target = `  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);`;

const replacement = `  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [showQR, setShowQR] = React.useState(false);`;

code = code.replace(target, replacement);

const target2 = `          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: '#8FB88F' }}>Share via:</span>
            <a href={\`https://api.whatsapp.com/send?text=\${encodeURIComponent(shareText)}\`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">W</a>
            <a href={\`https://t.me/share/url?url=\${encodeURIComponent(referralLink)}\`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">T</a>
            <a href={\`https://twitter.com/intent/tweet?text=\${encodeURIComponent(shareText)}\`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs hover:scale-110 transition-all border border-white/10">X</a>
          </div>`;

const replacement2 = `          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: '#8FB88F' }}>Share via:</span>
              <a href={\`https://api.whatsapp.com/send?text=\${encodeURIComponent(shareText)}\`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">W</a>
              <a href={\`https://t.me/share/url?url=\${encodeURIComponent(referralLink)}\`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">T</a>
              <a href={\`https://twitter.com/intent/tweet?text=\${encodeURIComponent(shareText)}\`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs hover:scale-110 transition-all border border-white/10">X</a>
            </div>
            <button onClick={() => setShowQR(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:bg-white hover:text-black" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}>
              <Scan size={12} /> Show QR
            </button>
          </div>

          <AnimatePresence>
            {showQR && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setShowQR(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="relative bg-white rounded-3xl p-6 shadow-2xl z-10 max-w-sm w-full text-center"
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-gray-900 font-black text-lg">Scan to join</h3>
                    <button onClick={() => setShowQR(false)} className="p-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="bg-white p-4 rounded-2xl inline-block border border-gray-100 shadow-sm mx-auto mb-4">
                    <QRCode
                      value={referralLink}
                      size={200}
                      bgColor={"#ffffff"}
                      fgColor={"#132613"}
                      level={"H"}
                    />
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Have your friends scan this QR code with their camera to join NORODATA directly.</p>
                </motion.div>
              </div>
            )}
          </AnimatePresence>`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/Dashboard.tsx', code);
