import { useState } from 'react';
import TransferForm from './TransferForm';

/**
 * Dashboard balance card with FUND WALLET and TRANSFER buttons.
 * TRANSFER opens a modal containing the TransferForm (UID lookup + confirm + send).
 *
 * Usage:
 *   <DashboardBalanceCard balance={balance} onFundWallet={...} onBalanceChange={refetchBalance} />
 */
export default function DashboardBalanceCard({ balance, onFundWallet, onBalanceChange }) {
  const [showTransfer, setShowTransfer] = useState(false);

  return (
    <div className="balance-card">
      <span className="balance-tag">💰 ACCOUNT LIQUID ASSETS</span>

      <p className="balance-label">AVAILABLE BALANCE</p>
      <h2 className="balance-amount">₦{Number(balance ?? 0).toLocaleString()}</h2>

      <div className="balance-actions">
        <button className="fund-btn" onClick={onFundWallet}>
          ↙ FUND WALLET
        </button>
        <button className="transfer-btn" onClick={() => setShowTransfer(true)}>
          TRANSFER
        </button>
      </div>

      {showTransfer && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setShowTransfer(false)}
              aria-label="Close"
            >
              ×
            </button>
            <TransferForm
              onSuccess={() => {
                setShowTransfer(false);
                onBalanceChange?.();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
