import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Zap, CheckCircle2, AlertTriangle, X, Loader2, ChevronDown, Lock, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import SuccessFeedback from './SuccessFeedback';
import { cn, formatCurrency } from '../lib/utils';
import type { NetworkType, ServicePlan, UserProfile, SavedRecipient } from '../types';
import { normalizeCanonicalServiceCode } from '../lib/planPricing';
import { withFreshSession, SESSION_EXPIRED_MESSAGE } from '../lib/authSession';
import { hasTransactionPin } from '../lib/pinService';
import { getSavedRecipients, addSavedRecipient, normalizeRecipientPhone } from '../lib/recipientService';

const NETWORK_SERVICES: Record<string, { id: string; label: string }[]> = {
  MTN: [
    { id: 'mtn_sme', label: 'SME' },
    { id: 'mtn_cg', label: 'Corporate (CG)' },
    { id: 'mtn_gifting', label: 'Gifting' },
    { id: 'mtn_datashare', label: 'Datashare' },
    { id: 'mtn_awoof', label: 'Awoof' },
    { id: 'mtn_awoof2', label: 'SME 2 / Awoof 2' },
    { id: 'mtn_coupon', label: 'Coupon' },
  ],
  GLO: [
    { id: 'glo_sme', label: 'SME' },
    { id: 'glo_sme2', label: 'SME 2' },
    { id: 'glo_cg', label: 'Corporate (CG)' },
    { id: 'glo_gifting', label: 'Gifting' },
    { id: 'glo_data', label: 'Data' },
  ],
  Airtel: [
    { id: 'airtel_sme', label: 'SME' },
    { id: 'airtel_sme2', label: 'SME 2' },
    { id: 'airtel_cg', label: 'Corporate (CG)' },
    { id: 'airtel_gifting', label: 'Gifting' },
  ],
  '9mobile': [
    { id: 'etisalat_sme', label: 'SME' },
    { id: 'etisalat_data', label: 'Data' },
  ],
};

const BALANCE_CODES: Record<string, { label: string; code: string }[]> = {
  mtn_sme: [{ label: 'SME Balance', code: '*461*4#' }],
  mtn_cg: [{ label: 'CG Balance', code: '*460*260#' }, { label: 'Data Balance', code: '*131*4#' }],
  mtn_gifting: [{ label: 'Gifting Balance', code: '*131*4#' }],
  mtn_datashare: [{ label: 'Datashare Balance', code: '*461*4#' }],
  mtn_awoof: [{ label: 'Awoof Balance', code: '*461*4#' }],
  mtn_awoof2: [{ label: 'Awoof 2 Balance', code: '*461*4#' }],
  mtn_coupon: [{ label: 'Coupon Balance', code: '*461*4#' }],
  glo_sme: [{ label: 'SME Balance', code: '*127*0#' }],
  glo_sme2: [{ label: 'SME Balance', code: '*127*0#' }],
  glo_cg: [{ label: 'CG Balance', code: '*127*0#' }],
  glo_gifting: [{ label: 'Data Balance', code: '*127*0#' }],
  glo_data: [{ label: 'Data Balance', code: '*127*0#' }],
  airtel_sme: [{ label: 'SME Balance', code: '*140#' }],
  airtel_sme2: [{ label: 'SME Balance', code: '*140#' }],
  airtel_cg: [{ label: 'CG Balance', code: '*140#' }],
  airtel_gifting: [{ label: 'Gifting Balance', code: '*140#' }],
  etisalat_sme: [{ label: 'SME Balance', code: '*228#' }],
  etisalat_data: [{ label: 'Data Balance', code: '*228#' }],
};

export function getPlanPriceForUser(plan: ServicePlan | null | undefined, user: UserProfile | null | undefined): number {
  if (!plan) return 0;
  const isReseller = user ? (user.is_reseller || user.user_role === 'reseller' || user.role === 'reseller') : false;
  if (isReseller) {
    if (plan.reseller_price !== undefined && plan.reseller_price !== null && plan.reseller_price > 0) return Number(plan.reseller_price);
    if (plan.resellerPrice !== undefined && plan.resellerPrice !== null && plan.resellerPrice > 0) return Number(plan.resellerPrice);
  }
  return Number(plan.retail_price ?? plan.price ?? plan.amount ?? 0);
}

interface ServicePurchaseProps {
  type: 'data' | 'airtime';
  onNavigateToSettings?: () => void;
}

export default function ServicePurchase({ type, onNavigateToSettings }: ServicePurchaseProps) {
  const { user } = useAuth();

  const [network, setNetwork] = React.useState<NetworkType | ''>('');
  const [planType, setPlanType] = React.useState<string>('');
  const [selectedPlan, setSelectedPlan] = React.useState<ServicePlan | null>(null);
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [airtimeAmount, setAirtimeAmount] = React.useState('');

  const [allPlans, setAllPlans] = React.useState<ServicePlan[]>([]);
  const [fetchingPlans, setFetchingPlans] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [showNoPinModal, setShowNoPinModal] = React.useState(false);
  const [showPinModal, setShowPinModal] = React.useState(false);
  const [transactionPinInput, setTransactionPinInput] = React.useState('');
  const [pinError, setPinError] = React.useState<string | null>(null);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = React.useState(false);
  const isPurchasingRef = React.useRef(false);
  const purchaseAbortRef = React.useRef<AbortController | null>(null);
  const [purchaseStatus, setPurchaseStatus] = React.useState<'idle' | 'success' | 'failed'>('idle');
  const [createdTransaction, setCreatedTransaction] = React.useState<any>(null);
  const [autoDetected, setAutoDetected] = React.useState(false);
  const [recentBeneficiaries, setRecentBeneficiaries] = React.useState<string[]>([]);
  const [savedRecipients, setSavedRecipients] = React.useState<SavedRecipient[]>([]);

  // Load saved recipients from database
  React.useEffect(() => {
    if (user?.uid) {
      getSavedRecipients()
        .then((list) => setSavedRecipients(list))
        .catch((err) => console.warn('[ServicePurchase] Could not load saved recipients:', err));
    }
  }, [user?.uid]);

  // Load recent beneficiaries from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('norodata_recent_beneficiaries');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setRecentBeneficiaries(parsed.slice(0, 4));
      }
    } catch (_) {}
  }, []);

  const saveBeneficiary = React.useCallback((num: string) => {
    try {
      let cleaned = num.replace(/\D/g, '');
      if (cleaned.startsWith('234') && cleaned.length >= 6) {
        cleaned = '0' + cleaned.substring(3);
      } else if (cleaned.length >= 3 && !cleaned.startsWith('0')) {
        cleaned = '0' + cleaned;
      }
      if (cleaned.length >= 10) {
        const stored = localStorage.getItem('norodata_recent_beneficiaries');
        const list = stored ? JSON.parse(stored) : [];
        const updated = [cleaned, ...list.filter((x: string) => x !== cleaned)].slice(0, 5);
        localStorage.setItem('norodata_recent_beneficiaries', JSON.stringify(updated));
        setRecentBeneficiaries(updated.slice(0, 4));
      }
    } catch (_) {}
  }, []);

  // Dropdown open states
  const [networkOpen, setNetworkOpen] = React.useState(false);
  const [planTypeOpen, setPlanTypeOpen] = React.useState(false);

  // Auto-detect network from phone prefix (handles 080..., +234..., 234..., 80...)
  React.useEffect(() => {
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('234') && cleaned.length >= 6) {
      cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.length >= 3 && !cleaned.startsWith('0')) {
      cleaned = '0' + cleaned;
    }

    if (cleaned.length >= 4) {
      const prefix = cleaned.substring(0, 4);
      const mtnPrefixes = ['0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0703', '0706', '0704', '0702'];
      const airtelPrefixes = ['0802', '0808', '0812', '0902', '0907', '0901', '0904', '0701', '0708', '0912', '0911'];
      const gloPrefixes = ['0805', '0807', '0811', '0815', '0905', '0915', '0705'];
      const ninePrefixes = ['0809', '0817', '0818', '0909', '0908'];

      let detected: NetworkType | null = null;
      if (mtnPrefixes.includes(prefix)) detected = 'MTN';
      else if (airtelPrefixes.includes(prefix)) detected = 'Airtel';
      else if (gloPrefixes.includes(prefix)) detected = 'Glo';
      else if (ninePrefixes.includes(prefix)) detected = '9mobile';

      if (detected && network !== detected) {
        setNetwork(detected);
        setAutoDetected(true);
      }
    }
  }, [phoneNumber, network]);

  // Load plans
  React.useEffect(() => {
    const loadPlans = async () => {
      setFetchingPlans(true);
      const defaultFallback: ServicePlan[] = [];

      try {
        const response = await fetch('/api/services/data');
        if (response.ok) {
          const resData = await response.json();
          const plansList: ServicePlan[] = Array.isArray(resData) ? resData : (resData.plans || resData.services || []);
          if (plansList.length > 0) {
            const normalized = plansList.map((p: any) => {
              const pName = p.plan_name || p.name || p.planName || `${p.network_type || p.network || ''} Plan`;
              const pPrice = Number(p.retail_price || p.price || p.amount || 0);
              const rPrice = Number(p.reseller_price || p.resellerPrice || pPrice);
              const net = String(p.network_type || p.network || 'MTN');
              let finalNet = 'MTN';
              if (net.toLowerCase().includes('airtel')) finalNet = 'Airtel';
              else if (net.toLowerCase().includes('glo')) finalNet = 'Glo';
              else if (net.toLowerCase().includes('9mobile') || net.toLowerCase().includes('etisalat')) finalNet = '9mobile';

              const mozosubz_service = normalizeCanonicalServiceCode(p.mozosubz_service || p.service, finalNet, pName);

              return {
                ...p, id: p.id, name: pName, plan_name: pName,
                price: pPrice, retail_price: pPrice, reseller_price: rPrice,
                network: finalNet, type: p.type || 'data',
                peyflex_variation_id: p.provider_plan_id || p.peyflex_variation_id || p.peyflex_id || p.apiPlanId || p.id,
                provider_plan_id: p.provider_plan_id || p.id,
                validity_days: p.validity_days || p.duration || p.validity || '30 days',
                mozosubz_service,
                service: mozosubz_service,
              };
            });
            setAllPlans(normalized.length > 0 ? normalized : defaultFallback);
          } else setAllPlans(defaultFallback);
        } else setAllPlans(defaultFallback);
      } catch (err) { setAllPlans(defaultFallback); }
      finally { setFetchingPlans(false); }
    };
    loadPlans();
    window.addEventListener('plans-updated', loadPlans);
    return () => {
      window.removeEventListener('plans-updated', loadPlans);
    };
  }, []);

  const availableTabs = React.useMemo(() => {
    if (!network) return [];
    const netKey = network === 'Glo' ? 'GLO' : network;
    const predefined = NETWORK_SERVICES[netKey] || [];
    const matched = predefined.filter((t) => allPlans.some((p) => p.network === network && p.mozosubz_service === t.id));
    const unhandled = Array.from(new Set(
      allPlans
        .filter((p) => p.network === network && !predefined.some((t) => t.id === p.mozosubz_service))
        .map((p) => p.mozosubz_service)
    )).filter(Boolean).map((s) => ({
      id: s,
      label: s.replace(/^[a-z0-9]+_/i, '').replace(/_/g, ' ').toUpperCase() || 'DATA'
    }));

    if (matched.length > 0) return [...matched, ...unhandled];
    if (unhandled.length > 0) return unhandled;
    return predefined;
  }, [network, allPlans]);

  React.useEffect(() => {
    if (!network) { setPlanType(''); setSelectedPlan(null); return; }
    if (availableTabs.length > 0) {
      if (!availableTabs.some(t => t.id === planType)) {
        setPlanType(availableTabs[0].id);
      }
    } else {
      setPlanType('');
    }
    setSelectedPlan(null);
  }, [network, availableTabs, planType]);

  const availablePlans = React.useMemo(() => {
    if (!network) return [];
    return allPlans.filter((p) => p.network === network && p.mozosubz_service === planType);
  }, [allPlans, network, planType]);

  const currentPlanTypeLabel = availableTabs.find((t) => t.id === planType)?.label || 'Select type';

  const handlePurchase = async () => {
    if (!network) { toast.error('Please select a network'); return; }
    if (!phoneNumber || phoneNumber.length < 11) { toast.error('Enter a valid 11-digit phone number'); return; }
    if (type === 'data' && !selectedPlan) { toast.error('Please select a data plan'); return; }
    if (type === 'airtime' && (!airtimeAmount || Number(airtimeAmount) < 50)) { toast.error('Minimum airtime is ₦50'); return; }

    setLoading(true);
    try {
      const pinConfigured = await hasTransactionPin();
      if (!pinConfigured) {
        setShowNoPinModal(true);
        return;
      }
      setTransactionPinInput('');
      setPinError(null);
      setShowConfirmModal(true);
    } catch (err: any) {
      toast.error(err.message || 'Error checking security settings');
    } finally {
      setLoading(false);
    }
  };

  const executePurchase = async (pin: string) => {
    if (!pin || pin.length !== 4) {
      setPinError('Transaction PIN must be 4 digits.');
      return;
    }
    if (isPurchasingRef.current) return;
    isPurchasingRef.current = true;
    setIsSubmittingPurchase(true);
    setPinError(null);

    // Cancel any previous in-flight purchase request
    if (purchaseAbortRef.current) {
      try { purchaseAbortRef.current.abort(); } catch (_) {}
    }
    const abortCtrl = new AbortController();
    purchaseAbortRef.current = abortCtrl;

    const idempotencyKey = `buy_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      await withFreshSession(async (session) => {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        };

        if (type === 'data') {
          const finalPrice = getPlanPriceForUser(selectedPlan, user);
          const planId = String(selectedPlan?.provider_plan_id || selectedPlan?.peyflex_variation_id || selectedPlan?.id || '').trim();
          const payload = {
            userId: user?.uid || session.user.id,
            phone_number: phoneNumber,
            network: network.toUpperCase(),
            planId: planId,
            provider_plan_id: planId,
            peyflex_variation_id: planId,
            mozosubz_service: (selectedPlan as any)?.mozosubz_service || (selectedPlan as any)?.service || planType,
            service: (selectedPlan as any)?.mozosubz_service || (selectedPlan as any)?.service || planType,
            retail_price: finalPrice,
            plan_name: selectedPlan?.name,
            pin: pin,
            idempotencyKey: idempotencyKey,
          };
          const response = await fetch('/api/v1/data/purchase', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: abortCtrl.signal,
          });
          const resData = await response.json();
          if (response.ok && resData.status === 'success') {
            saveBeneficiary(phoneNumber);
            addSavedRecipient(phoneNumber).catch((err) => console.warn('[ServicePurchase saveRecipient error]:', err));
            setCreatedTransaction(resData.transaction || { amount: finalPrice, reference: resData.reference || 'N/A' });
            setShowPinModal(false);
            setPurchaseStatus('success');
            toast.success('Data purchase successful!');
          } else {
            if (resData.locked) {
              setShowPinModal(false);
              toast.error(resData.error || 'Account locked for 15 minutes.', { duration: 8000 });
            } else if (resData.error && resData.error.toLowerCase().includes('pin')) {
              setPinError(resData.error);
            } else {
              setShowPinModal(false);
              setPurchaseStatus('failed');
              toast.error(resData.error || resData.provider_message || 'Data purchase failed.', { duration: 6000 });
            }
          }
        } else {
          const payload = {
            network: network.toUpperCase(),
            phone_number: phoneNumber,
            amount: Number(airtimeAmount),
            pin: pin,
            idempotencyKey: idempotencyKey,
          };
          const response = await fetch('/api/buy-airtime', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: abortCtrl.signal,
          });
          const resData = await response.json();
          if (response.ok && (resData.status === 'success' || resData.success === true)) {
            saveBeneficiary(phoneNumber);
            addSavedRecipient(phoneNumber).catch((err) => console.warn('[ServicePurchase saveRecipient error]:', err));
            setCreatedTransaction(resData.transaction || { amount: Number(airtimeAmount), reference: resData.reference || 'N/A' });
            setShowPinModal(false);
            setPurchaseStatus('success');
            toast.success(`₦${airtimeAmount} airtime sent!`);
          } else {
            if (resData.locked) {
              setShowPinModal(false);
              toast.error(resData.error || 'Account locked for 15 minutes.', { duration: 8000 });
            } else if (resData.error && resData.error.toLowerCase().includes('pin')) {
              setPinError(resData.error);
            } else {
              setShowPinModal(false);
              setPurchaseStatus('failed');
              toast.error(resData.error || resData.provider_message || 'Airtime purchase failed.', { duration: 6000 });
            }
          }
        }
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      toast.error(err.message || 'Network error occurred.');
    } finally {
      isPurchasingRef.current = false;
      setIsSubmittingPurchase(false);
    }
  };

  const resetForm = () => {
    setPhoneNumber(''); setAirtimeAmount(''); setSelectedPlan(null);
    setPurchaseStatus('idle'); setCreatedTransaction(null);
  };

  if (purchaseStatus === 'success') {
    return (
      <div className="max-w-lg mx-auto">
        <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#132613' }}>
          <SuccessFeedback size={80} showConfetti={true} />
          <h2 className="text-2xl font-bold text-white mt-5 mb-2">Purchase successful!</h2>
          <p className="text-sm mb-7" style={{ color: '#8FB88F' }}>
            Your transaction is processing. The recipient will be credited shortly.
          </p>

          <div className="rounded-2xl p-5 text-left space-y-3 mb-6" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
            {[
              { label: 'Recipient', val: phoneNumber },
              { label: 'Network', val: network },
              ...(type === 'data' && selectedPlan ? [{ label: 'Plan', val: selectedPlan.name }] : []),
              { label: 'Amount charged', val: formatCurrency(type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount)) },
              ...(createdTransaction?.reference ? [{ label: 'Reference', val: createdTransaction.reference }] : []),
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: '#8FB88F' }}>{label}</span>
                <span className="text-white font-semibold">{val}</span>
              </div>
            ))}
          </div>

          <button
            onClick={resetForm}
            className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all hover:brightness-110"
            style={{ backgroundColor: '#B5D430', color: '#132613' }}
          >
            Buy again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* ── Main dark card (matches screenshot exactly) ── */}
      <div className="rounded-3xl p-6 space-y-5" style={{ backgroundColor: '#132613' }}>
        {/* Card header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3B7A3B' }} />
            <span className="text-xs font-bold " style={{ color: '#8FB88F' }}>
              DATA PLANS
            </span>
          </div>
          <h2 className="text-xl font-bold text-white">{type === 'data' ? 'Buy data' : 'Buy airtime'}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8FB88F' }}>
            {type === 'data'
              ? 'Fast bundles across every network. Uses the same wallet-and-ledger behavior as the real checkout.'
              : 'Top up any number instantly across all networks.'}
          </p>
        </div>

        {/* ── Network Selection Bar with Official Brand Badges ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold " style={{ color: '#8FB88F' }}>
              SELECT NETWORK
            </label>
            {autoDetected && network && (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#B5D430] text-[#132613] animate-pulse shadow-sm flex items-center gap-1">
 <span></span>
                <span>Auto-detected: {network}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'MTN', name: 'MTN', color: '#FFCC00', dot: '#FFCC00', textColor: '#000000' },
              { id: 'Airtel', name: 'Airtel', color: '#FF0000', dot: '#FF0000', textColor: '#FFFFFF' },
              { id: 'Glo', name: 'Glo', color: '#228B22', dot: '#228B22', textColor: '#FFFFFF' },
              { id: '9mobile', name: '9mobile', color: '#005C29', dot: '#005C29', textColor: '#FFFFFF' },
            ].map((net) => {
              const isSelected = network === net.id;
              return (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => {
                    setNetwork(net.id as NetworkType);
                    setAutoDetected(false);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200 cursor-pointer relative',
                    isSelected
                      ? 'border-[#B5D430] bg-[#1E3A1E] shadow-lg shadow-emerald-950/50'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 opacity-75 hover:opacity-100'
                  )}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full mb-1.5 shadow-sm border border-white/20"
                    style={{ backgroundColor: net.color }}
                  />
                  <span className={cn('text-xs font-semibold', isSelected ? 'text-white' : 'text-white/80')}>
                    {net.name}
                  </span>
                  {isSelected && (
                    <motion.div
                      layoutId="service-network-active"
                      className="absolute -bottom-1 w-6 h-0.5 rounded-full bg-[#B5D430]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Plan type dropdown — data only */}
        {type === 'data' && (
          <div className="relative">
            <label className="text-xs font-bold block mb-2" style={{ color: '#8FB88F' }}>
              PLAN TYPE
            </label>
            <button
              type="button"
              onClick={() => { if (network && availableTabs.length > 0) { setPlanTypeOpen(!planTypeOpen); setNetworkOpen(false); } }}
              disabled={!network || availableTabs.length === 0}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40 cursor-pointer"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <span>{currentPlanTypeLabel}</span>
              <ChevronDown size={16} className={cn('transition-transform', planTypeOpen && 'rotate-180')} style={{ color: '#8FB88F' }} />
            </button>

            <AnimatePresence>
              {planTypeOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-20 shadow-2xl"
                  style={{ backgroundColor: '#1E3A1E' }}
                >
                  {availableTabs.map((tab, idx, arr) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { setPlanType(tab.id); setSelectedPlan(null); setPlanTypeOpen(false); }}
                      className="w-full flex items-center justify-between px-5 py-4 text-white font-semibold text-base text-left transition-all hover:bg-white/5 cursor-pointer"
                      style={{ borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
                    >
                      <span>{tab.label}</span>
                      {planType === tab.id ? (
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: '#3B7A3B' }}>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3B7A3B' }} />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: 'rgba(255,255,255,0.3)' }} />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Recipient Number & Quick Beneficiary Pills ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold " style={{ color: '#8FB88F' }}>
              RECIPIENT NUMBER
            </label>
            {user?.phone_number && (
              <button
                type="button"
                onClick={() => setPhoneNumber(user.phone_number)}
                className="text-[11px] font-bold text-[#B5D430] hover:underline flex items-center gap-1 cursor-pointer"
              >
 <span> Use My Number</span>
              </button>
            )}
          </div>

          {/* Quick saved recipient and beneficiary pill shortcuts */}
          {savedRecipients.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] text-white/50 font-bold shrink-0">Saved:</span>
              {savedRecipients.map((rec) => {
                let localNum = rec.phone;
                if (localNum.startsWith('234')) localNum = '0' + localNum.slice(3);
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setPhoneNumber(localNum)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1',
                      phoneNumber === localNum || phoneNumber === rec.phone
                        ? 'bg-[#B5D430] text-[#132613]'
                        : 'bg-white/10 hover:bg-white/20 text-white/90'
                    )}
                  >
                    <span>{rec.display_name}</span>
                    <span className="text-[10px] opacity-70">({localNum.slice(-4)})</span>
                  </button>
                );
              })}
            </div>
          )}

          {recentBeneficiaries.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] text-white/50 font-bold shrink-0">Recent:</span>
              {recentBeneficiaries.map((beneficiary) => (
                <button
                  key={beneficiary}
                  type="button"
                  onClick={() => setPhoneNumber(beneficiary)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 cursor-pointer',
                    phoneNumber === beneficiary
                      ? 'bg-[#B5D430] text-[#132613] font-semibold'
                      : 'bg-white/10 hover:bg-white/20 text-white/80'
                  )}
                >
                  {beneficiary}
                </button>
              ))}
            </div>
          )}

          <input
            type="tel"
            maxLength={14}
            placeholder="0803 123 4567"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
            className="w-full px-4 py-3.5 rounded-xl text-white placeholder-white/30 font-semibold text-base focus:outline-none transition-all"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          />
        </div>

        {/* Bundle grid (data) OR amount input (airtime) */}
        {type === 'data' && network ? (
          <div>
            <label className="text-xs font-bold block mb-3" style={{ color: '#8FB88F' }}>CHOOSE A BUNDLE</label>
            {fetchingPlans ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#3B7A3B', borderTopColor: 'transparent' }} />
              </div>
            ) : availablePlans.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: '#8FB88F' }}>No plans available for this selection.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {availablePlans.map((plan) => {
                  const finalPrice = getPlanPriceForUser(plan, user);
                  const isSelected = selectedPlan?.id === plan.id;
                  // Parse size from name for display
                  const sizeMatch = plan.name.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
                  const sizeDisplay = sizeMatch ? `${sizeMatch[1]}${sizeMatch[2].toUpperCase()}` : plan.name;

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className="flex flex-col justify-between p-4 rounded-2xl text-left transition-all"
                      style={{
                        backgroundColor: isSelected ? 'rgba(59,122,59,0.3)' : 'rgba(255,255,255,0.06)',
                        border: isSelected ? '1.5px solid #3B7A3B' : '1.5px solid rgba(255,255,255,0.10)',
                      }}
                    >
                      <div>
                        <p className="text-base font-bold text-white">{sizeDisplay}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#8FB88F' }}>{plan.validity_days || '30 days'}</p>
                      </div>
                      <p className="text-base font-bold mt-3" style={{ color: '#B5D430' }}>
                        ₦{finalPrice.toLocaleString()}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : type === 'airtime' ? (
          <div>
            <label className="text-xs font-bold block mb-3" style={{ color: '#8FB88F' }}>AMOUNT (₦)</label>
            {/* Quick amounts */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[100, 200, 500, 1000, 2000, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAirtimeAmount(String(amt))}
                  className="py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{
                    backgroundColor: airtimeAmount === String(amt) ? 'rgba(59,122,59,0.3)' : 'rgba(255,255,255,0.06)',
                    border: airtimeAmount === String(amt) ? '1.5px solid #3B7A3B' : '1.5px solid rgba(255,255,255,0.10)',
                    color: airtimeAmount === String(amt) ? '#B5D430' : '#fff',
                  }}
                >
                  ₦{amt.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="number" placeholder="Custom amount" value={airtimeAmount}
              onChange={(e) => setAirtimeAmount(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl text-white placeholder-white/30 font-semibold text-base focus:outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            />
          </div>
        ) : null}

        {/* CTA button */}
        <button
          type="button"
          disabled={loading || (type === 'data' && !selectedPlan) || (type === 'airtime' && !airtimeAmount) || !network || !phoneNumber}
          onClick={handlePurchase}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 flex items-center justify-center gap-2"
          style={{ backgroundColor: '#B5D430', color: '#132613' }}
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : `Buy ${type === 'data' ? 'data bundle' : 'airtime'} →`}
        </button>

        {/* Before you continue notice */}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: '#8FB88F' }}>Before you continue</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>01 · Check the recipient number carefully before confirming.</p>
          {type === 'data' && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>02 · If a purchase fails at the provider, your wallet is automatically refunded.</p>
          )}
        </div>
      </div>

      {/* ── Confirmation Modal ── */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md rounded-3xl p-6 shadow-2xl z-10"
              style={{ backgroundColor: '#132613' }}
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-white">Confirm purchase</h3>
                <button onClick={() => setShowConfirmModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <X size={16} />
                </button>
              </div>

              <div className="rounded-2xl p-5 text-center mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-xs font-bold block mb-1" style={{ color: '#8FB88F' }}>Total due</span>
                <span className="text-3xl font-bold text-white">
                  {formatCurrency(type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount))}
                </span>
              </div>

              <div className="space-y-3 mb-5">
                {[
                  { label: 'Service', val: `${type === 'data' ? 'Data' : 'Airtime'} purchase` },
                  { label: 'Network', val: network as string },
                  { label: 'Recipient', val: phoneNumber },
                  ...(type === 'data' && selectedPlan ? [{ label: 'Plan', val: selectedPlan.name }] : []),
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span style={{ color: '#8FB88F' }}>{label}</span>
                    <span className="text-white font-semibold">{val}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 rounded-xl p-3.5 mb-5 text-xs" style={{ backgroundColor: 'rgba(181,212,48,0.1)', color: '#B5D430' }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>Verify the recipient's number carefully. Failed purchases at the provider are automatically refunded.</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-white transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setTransactionPinInput('');
                    setPinError(null);
                    setShowPinModal(true);
                  }}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all hover:brightness-110 cursor-pointer"
                  style={{ backgroundColor: '#B5D430', color: '#132613' }}
                >
                  Enter PIN to pay →
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── No PIN Configured Modal (Step 5 Requirement 4) ── */}
      <AnimatePresence>
        {showNoPinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNoPinModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4"
              style={{ backgroundColor: '#132613' }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: 'rgba(181,212,48,0.15)' }}>
                <Lock size={26} style={{ color: '#B5D430' }} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1.5">Add your transaction PIN to continue.</h3>
                <p className="text-xs text-white/60 max-w-xs mx-auto">
                  Protect your wallet. You must set a 4-digit security PIN in Settings before completing purchases.
                </p>
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNoPinModal(false)}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-white transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('norodata_return_to_purchase', 'true');
                    setShowNoPinModal(false);
                    if (onNavigateToSettings) onNavigateToSettings();
                    else window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'settings' }));
                  }}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all hover:brightness-110 cursor-pointer"
                  style={{ backgroundColor: '#B5D430', color: '#132613' }}
                >
                  Add PIN now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Transaction PIN Entry Modal (Step 5 Requirement 4 & 5) ── */}
      <AnimatePresence>
        {showPinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (!isSubmittingPurchase) setShowPinModal(false); }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm rounded-3xl p-6 shadow-2xl z-10 space-y-4"
              style={{ backgroundColor: '#132613' }}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(181,212,48,0.15)' }}>
                    <Lock size={16} style={{ color: '#B5D430' }} />
                  </div>
                  <h3 className="text-base font-bold text-white">Enter Transaction PIN</h3>
                </div>
                <button
                  type="button"
                  disabled={isSubmittingPurchase}
                  onClick={() => setShowPinModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-white/60">
                Enter your 4-digit PIN to authorize payment of <span className="text-white font-bold">{formatCurrency(type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount))}</span>.
              </p>

              <div>
                <input
                  type="password"
                  maxLength={4}
                  autoFocus
                  inputMode="numeric"
                  value={transactionPinInput}
                  onChange={(e) => {
                    setPinError(null);
                    setTransactionPinInput(e.target.value.replace(/\D/g, ''));
                  }}
                  placeholder="••••"
                  className="w-full text-center tracking-[1em] text-2xl font-bold py-3.5 rounded-2xl text-white placeholder-white/20 focus:outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: pinError ? '1.5px solid #EF4444' : '1px solid rgba(255,255,255,0.15)' }}
                />
                {pinError && (
                  <p className="text-xs text-red-400 mt-2 text-center font-semibold">
                    {pinError}
                  </p>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingPurchase}
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingPurchase || transactionPinInput.length !== 4}
                  onClick={() => executePurchase(transactionPinInput)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: '#B5D430', color: '#132613' }}
                >
                  {isSubmittingPurchase ? <Loader2 className="animate-spin" size={16} /> : 'Authorize'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
