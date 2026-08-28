const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

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
fs.writeFileSync('src/components/Dashboard.tsx', code);
