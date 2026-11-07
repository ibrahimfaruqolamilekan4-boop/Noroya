import { useState } from 'react';
import { lookupRecipient, transferFunds } from '../lib/wallet';

export default function TransferForm({ onSuccess }) {
  const [uid, setUid] = useState('');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [step, setStep] = useState('input'); // input -> confirm -> done
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLookup() {
    setError('');
    setLoading(true);
    try {
      const r = await lookupRecipient(uid.trim());
      setRecipient(r);
      setStep('confirm');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleConfirmTransfer() {
    setError('');
    setLoading(true);
    try {
      const result = await transferFunds(uid.trim(), parseFloat(amount));
      setStep('done');
      onSuccess?.(result);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  if (step === 'done') {
    return <p>Transfer successful.</p>;
  }

  return (
    <div>
      {step === 'input' && (
        <>
          <input
            placeholder="Recipient UID (e.g. NR1A2B3C)"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
          />
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button onClick={handleLookup} disabled={loading || !uid || !amount}>
            {loading ? 'Checking...' : 'Continue'}
          </button>
        </>
      )}

      {step === 'confirm' && recipient && (
        <>
          <p>
            Send ₦{amount} to <strong>{recipient.email}</strong> ({recipient.uid})?
          </p>
          <button onClick={handleConfirmTransfer} disabled={loading}>
            {loading ? 'Sending...' : 'Confirm Transfer'}
          </button>
          <button onClick={() => setStep('input')}>Cancel</button>
        </>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
