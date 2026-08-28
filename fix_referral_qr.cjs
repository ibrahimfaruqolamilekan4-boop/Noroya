const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const refQRTarget = `                    <button 
                      onClick={() => downloadQR("referral-qr-code", "NORODATA-Referral-QR.png")}
                      className="w-full py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200 text-sm"
                    >
                      Download PNG
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs font-medium mt-3">Have your friends scan this QR code with their camera to join NORODATA directly.</p>`;

const refQRReplacement = `                    <button 
                      onClick={() => downloadQR("referral-qr-code", "NORODATA-Referral-QR.png")}
                      className="w-full py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200 text-sm"
                    >
                      Download PNG
                    </button>
                  </div>
                  <div className="w-full mt-2">
                    <button 
                      onClick={() => window.print()}
                      className="w-full py-2.5 rounded-xl font-bold text-gray-900 bg-white hover:border-gray-300 active:scale-95 transition-all border-2 border-gray-100 text-sm flex justify-center items-center gap-2"
                    >
                      🖨️ Print A4 Flyer
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs font-medium mt-3">Have your friends scan this QR code with their camera to join NORODATA directly.</p>`;

code = code.replace(refQRTarget, refQRReplacement);
fs.writeFileSync('src/components/Dashboard.tsx', code);
console.log("Done");
