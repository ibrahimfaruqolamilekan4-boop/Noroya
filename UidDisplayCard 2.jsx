import { useUserUid } from '../hooks/useUserUid';

/**
 * Shows the user's own Transfer UID on the dashboard, with a copy button.
 * Styled to match the existing "PERSONAL REFERRAL CODE" card pattern.
 * Drop this in near the balance card.
 */
export default function UidDisplayCard() {
  const uid = useUserUid();

  function handleCopy() {
    if (!uid) return;
    navigator.clipboard.writeText(uid);
  }

  return (
    <div className="uid-card">
      <span className="uid-label">🔑 YOUR TRANSFER UID</span>
      <div className="uid-row">
        <div className="uid-box">{uid || 'Loading...'}</div>
        <button className="uid-copy-btn" onClick={handleCopy} disabled={!uid}>
          COPY
        </button>
      </div>
      <p className="uid-hint">Share this UID so other users can send you money directly.</p>
    </div>
  );
}
