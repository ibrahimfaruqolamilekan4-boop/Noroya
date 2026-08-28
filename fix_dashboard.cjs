const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Add showGlobalQR state
code = code.replace(
  "  const [activeTab, setActiveTab] = React.useState('dashboard');",
  "  const [activeTab, setActiveTab] = React.useState('dashboard');\n  const [showGlobalQR, setShowGlobalQR] = React.useState(false);"
);

// 2. Insert download helper inside Dashboard component, right before useEffect
const helperCode = `
  const downloadQR = (id, filename) => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 40; // padding
      canvas.height = img.height + 40;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = filename;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  React.useEffect(() => {`;
code = code.replace("  React.useEffect(() => {", helperCode);

// 3. Add the modal at the bottom of the component
const bottomTarget = `      {/* PWA / global events / bottom bar */}`;
const globalModal = `      {/* Global QR Modal */}
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
                  className="flex-1 py-3 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all"
                  style={{ backgroundColor: '#3B7A3B' }}
                >
                  Copy Link
                </button>
                <button 
                  onClick={() => downloadQR("global-qr-code", "NORODATA-QR.png")}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200"
                >
                  Download
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PWA / global events / bottom bar */}`;
code = code.replace(bottomTarget, globalModal);

// 4. Update the referral QR modal to include download
const refQRTarget = `                    <QRCode
                      value={referralLink}
                      size={200}
                      bgColor={"#ffffff"}
                      fgColor={"#132613"}
                      level={"H"}
                    />
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Have your friends scan this QR code with their camera to join NORODATA directly.</p>`;
const refQRReplacement = `                    <QRCode
                      id="referral-qr-code"
                      value={referralLink}
                      size={200}
                      bgColor={"#ffffff"}
                      fgColor={"#132613"}
                      level={"H"}
                    />
                  </div>
                  <div className="flex gap-2 w-full mt-2">
                    <button 
                      onClick={() => downloadQR("referral-qr-code", "NORODATA-Referral-QR.png")}
                      className="w-full py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200 text-sm"
                    >
                      Download PNG
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs font-medium mt-3">Have your friends scan this QR code with their camera to join NORODATA directly.</p>`;
code = code.replace(refQRTarget, refQRReplacement);

fs.writeFileSync('src/components/Dashboard.tsx', code);
console.log("Done");
