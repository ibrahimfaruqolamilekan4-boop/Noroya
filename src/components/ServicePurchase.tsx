import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Zap, CheckCircle2, AlertTriangle, X, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import SuccessFeedback from './SuccessFeedback';
import { cn, formatCurrency } from '../lib/utils';
import type { NetworkType, ServicePlan, UserProfile } from '../types';

const NETWORK_SERVICES: Record<string, { id: string; label: string }[]> = {
  MTN: [
    { id: 'mtn_sme', label: 'SME' },
    { id: 'mtn_gifting', label: 'Gifting' },
    { id: 'mtn_datashare', label: 'Datashare' },
    { id: 'mtn_awoof', label: 'Awoof' },
    { id: 'mtn_awoof2', label: 'Awoof 2' },
  ],
  GLO: [
    { id: 'glo_sme', label: 'SME' },
    { id: 'glo_data', label: 'Data' },
  ],
  Airtel: [
    { id: 'airtel_sme', label: 'SME' },
    { id: 'airtel_gifting', label: 'Gifting' },
  ],
  '9mobile': [
    { id: 'etisalat_data', label: 'Data' },
  ],
};

const BALANCE_CODES: Record<string, { label: string; code: string }[]> = {
  mtn_sme: [{ label: 'SME Balance', code: '*461*4#' }],
  mtn_gifting: [{ label: 'Gifting Balance', code: '*131*4#' }],
  mtn_datashare: [{ label: 'Datashare Balance', code: '*461*4#' }],
  mtn_awoof: [{ label: 'Awoof Balance', code: '*461*4#' }],
  mtn_awoof2: [{ label: 'Awoof 2 Balance', code: '*461*4#' }],
  glo_sme: [{ label: 'SME Balance', code: '*127*0#' }],
  glo_data: [{ label: 'Data Balance', code: '*127*0#' }],
  airtel_sme: [{ label: 'SME Balance', code: '*140#' }],
  airtel_gifting: [{ label: 'Gifting Balance', code: '*140#' }],
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

export default function ServicePurchase({ type }: { type: 'data' | 'airtime' }) {
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
  const [purchaseStatus, setPurchaseStatus] = React.useState<'idle' | 'success' | 'failed'>('idle');
  const [createdTransaction, setCreatedTransaction] = React.useState<any>(null);

  // Dropdown open states
  const [networkOpen, setNetworkOpen] = React.useState(false);
  const [planTypeOpen, setPlanTypeOpen] = React.useState(false);

  // Auto-detect network from phone prefix
  React.useEffect(() => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length >= 4) {
      const prefix = cleaned.substring(0, 4);
      const mtnPrefixes = ['0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0703', '0706'];
      const airtelPrefixes = ['0802', '0808', '0812', '0902', '0907', '0901', '0904', '0701', '0708'];
      const gloPrefixes = ['0805', '0807', '0811', '0815', '0905', '0915', '0705'];
      const ninePrefixes = ['0809', '0817', '0818', '0909', '0908'];
      if (mtnPrefixes.includes(prefix) && network !== 'MTN') setNetwork('MTN');
      else if (airtelPrefixes.includes(prefix) && network !== 'Airtel') setNetwork('Airtel');
      else if (gloPrefixes.includes(prefix) && network !== 'Glo') setNetwork('Glo');
      else if (ninePrefixes.includes(prefix) && network !== '9mobile') setNetwork('9mobile');
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
              let mozosubz_service = p.mozosubz_service;
              if (!mozosubz_service) {
                const category = String(p.plan_category || '').toLowerCase();
                const nameLower = String(pName).toLowerCase();
                if (finalNet === 'MTN') {
                  if (category.includes('sme') || nameLower.includes('sme')) mozosubz_service = 'mtn_sme';
                  else if (category.includes('gifting') || nameLower.includes('gifting')) mozosubz_service = 'mtn_gifting';
                  else if (category.includes('share') || nameLower.includes('share') || category.includes('cg')) mozosubz_service = 'mtn_datashare';
                  else if (category.includes('awoof 2') || nameLower.includes('awoof 2')) mozosubz_service = 'mtn_awoof2';
                  else if (category.includes('awoof') || nameLower.includes('awoof')) mozosubz_service = 'mtn_awoof';
                  else mozosubz_service = 'mtn_sme';
                } else if (finalNet === 'Glo') {
                  mozosubz_service = category.includes('sme') ? 'glo_sme' : 'glo_data';
                } else if (finalNet === 'Airtel') {
                  mozosubz_service = category.includes('sme') ? 'airtel_sme' : 'airtel_gifting';
                } else if (finalNet === '9mobile') {
                  mozosubz_service = 'etisalat_data';
                }
              }
              return {
                ...p, id: p.id, name: pName, plan_name: pName,
                price: pPrice, retail_price: pPrice, reseller_price: rPrice,
                network: finalNet, type: p.type || 'data',
                peyflex_variation_id: p.peyflex_variation_id || p.peyflex_id || p.apiPlanId || p.id,
                validity_days: p.validity_days || p.duration || p.validity || '30 days',
                mozosubz_service,
              };
            });
            setAllPlans(normalized.length > 0 ? normalized : defaultFallback);
          } else setAllPlans(defaultFallback);
        } else setAllPlans(defaultFallback);
      } catch (err) { setAllPlans(defaultFallback); }
      finally { setFetchingPlans(false); }
    };
    loadPlans();
  }, []);

  const availablePlans = React.useMemo(() => {
    if (!network) return [];
    return allPlans.filter((p) => p.network === network && p.mozosubz_service === planType);
  }, [allPlans, network, planType]);

  React.useEffect(() => {
    if (!network) { setPlanType(''); setSelectedPlan(null); return; }
    const netKey = network === 'Glo' ? 'GLO' : network;
    const types = NETWORK_SERVICES[netKey] || [];
    const firstAvailable = types.find((t) => allPlans.some((p) => p.network === network && p.mozosubz_service === t.id));
    if (firstAvailable) setPlanType(firstAvailable.id);
    else if (types.length > 0) setPlanType(types[0].id);
    else setPlanType('');
    setSelectedPlan(null);
  }, [network, allPlans]);

  const availableTabs = React.useMemo(() => {
    const netKey = network === 'Glo' ? 'GLO' : network;
    return network ? (NETWORK_SERVICES[netKey] || []).filter((t) => allPlans.some((p) => p.network === network && p.mozosubz_service === t.id)) : [];
  }, [network, allPlans]);

  const currentPlanTypeLabel = availableTabs.find((t) => t.id === planType)?.label || 'Select type';

  const handlePurchase = async () => {
    if (!network) { toast.error('Please select a network'); return; }
    if (!phoneNumber || phoneNumber.length < 11) { toast.error('Enter a valid 11-digit phone number'); return; }
    if (type === 'data' && !selectedPlan) { toast.error('Please select a data plan'); return; }
    if (type === 'airtime' && (!airtimeAmount || Number(airtimeAmount) < 50)) { toast.error('Minimum airtime is ₦50'); return; }
    setShowConfirmModal(true);
  };

  const executePurchase = async () => {
    setLoading(true);
    setShowConfirmModal(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Session expired. Please sign in again.'); setLoading(false); return; }
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` };

      if (type === 'data') {
        const finalPrice = getPlanPriceForUser(selectedPlan, user);
        const payload = {
          userId: user?.uid,
          phone_number: phoneNumber,
          network: network.toUpperCase(),
          peyflex_variation_id: selectedPlan?.peyflex_variation_id || selectedPlan?.mozosubs_plan_id,
          mozosubz_service: (selectedPlan as any)?.mozosubz_service || planType,
          service: (selectedPlan as any)?.mozosubz_service || planType,
          retail_price: finalPrice,
          plan_name: selectedPlan?.name,
        };
        const response = await fetch('/api/v1/data/purchase', { method: 'POST', headers, body: JSON.stringify(payload) });
        const resData = await response.json();
        if (response.ok && resData.status === 'success') {
          setCreatedTransaction(resData.transaction || { amount: finalPrice, reference: resData.reference || 'N/A' });
          setPurchaseStatus('success');
          toast.success('Data purchase successful!');
        } else {
          setPurchaseStatus('failed');
          toast.error(resData.error || resData.provider_message || 'Data purchase failed.', { duration: 6000 });
        }
      } else {
        const payload = { network: network.toUpperCase(), phone_number: phoneNumber, amount: Number(airtimeAmount) };
        const response = await fetch('/api/buy-airtime', { method: 'POST', headers, body: JSON.stringify(payload) });
        const resData = await response.json();
        if (response.ok && (resData.status === 'success' || resData.success === true)) {
          setCreatedTransaction(resData.transaction || { amount: Number(airtimeAmount), reference: resData.reference || 'N/A' });
          setPurchaseStatus('success');
          toast.success(`₦${airtimeAmount} airtime sent!`);
        } else {
          setPurchaseStatus('failed');
          toast.error(resData.error || resData.provider_message || 'Airtime purchase failed.', { duration: 6000 });
        }
      }
    } catch (err: any) {
      setPurchaseStatus('failed');
      toast.error(err.message || 'Network error occurred.');
    } finally { setLoading(false); }
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
          <h2 className="text-2xl font-black text-white mt-5 mb-2">Purchase successful!</h2>
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
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8FB88F' }}>
              MOZOSUBZ PLANS
            </span>
          </div>
          <h2 className="text-xl font-black text-white">{type === 'data' ? 'Buy data' : 'Buy airtime'}</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8FB88F' }}>
            {type === 'data'
              ? 'Fast bundles across every network. Uses the same wallet-and-ledger behavior as the real checkout.'
              : 'Top up any number instantly across all networks.'}
          </p>
        </div>

        {/* Network + Plan Type row (dropdown style) */}
        <div className={cn('grid gap-4', type === 'data' ? 'grid-cols-2' : 'grid-cols-1')}>
          {/* Network dropdown */}
          <div className="relative">
            <label className="text-xs font-bold uppercase tracking-widest block mb-2" style={{ color: '#8FB88F' }}>NETWORK</label>
            <button
              type="button"
              onClick={() => { setNetworkOpen(!networkOpen); setPlanTypeOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <span>{network || 'Select network'}</span>
              <ChevronDown size={16} className={cn('transition-transform', networkOpen && 'rotate-180')} style={{ color: '#8FB88F' }} />
            </button>

            <AnimatePresence>
              {networkOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-20 shadow-2xl"
                  style={{ backgroundColor: '#1E3A1E' }}
                >
                  {(['MTN', 'Glo', 'Airtel', '9mobile'] as NetworkType[]).map((net, idx, arr) => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => { setNetwork(net); setNetworkOpen(false); }}
                      className="w-full flex items-center justify-between px-5 py-4 text-white font-semibold text-base text-left transition-all hover:bg-white/5"
                      style={{ borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
                    >
                      <span>{net}</span>
                      {network === net && (
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: '#3B7A3B' }}>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3B7A3B' }} />
                        </div>
                      )}
                      {network !== net && <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: 'rgba(255,255,255,0.3)' }} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Plan type dropdown — data only */}
          {type === 'data' && (
            <div className="relative">
              <label className="text-xs font-bold uppercase tracking-widest block mb-2" style={{ color: '#8FB88F' }}>PLAN TYPE</label>
              <button
                type="button"
                onClick={() => { if (network && availableTabs.length > 0) { setPlanTypeOpen(!planTypeOpen); setNetworkOpen(false); } }}
                disabled={!network || availableTabs.length === 0}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40"
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
                        className="w-full flex items-center justify-between px-5 py-4 text-white font-semibold text-base text-left transition-all hover:bg-white/5"
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
        </div>

        {/* Recipient number */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest block mb-2" style={{ color: '#8FB88F' }}>RECIPIENT NUMBER</label>
          <input
            type="tel"
            maxLength={11}
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
            <label className="text-xs font-bold uppercase tracking-widest block mb-3" style={{ color: '#8FB88F' }}>CHOOSE A BUNDLE</label>
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
                        <p className="text-base font-black text-white">{sizeDisplay}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#8FB88F' }}>{plan.validity_days || '30 days'}</p>
                      </div>
                      <p className="text-base font-black mt-3" style={{ color: '#B5D430' }}>
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
            <label className="text-xs font-bold uppercase tracking-widest block mb-3" style={{ color: '#8FB88F' }}>AMOUNT (₦)</label>
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
          className="w-full py-4 rounded-2xl font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-99 flex items-center justify-center gap-2"
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
                <h3 className="text-lg font-black text-white">Confirm purchase</h3>
                <button onClick={() => setShowConfirmModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <X size={16} />
                </button>
              </div>

              <div className="rounded-2xl p-5 text-center mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-xs font-bold block mb-1" style={{ color: '#8FB88F' }}>Total due</span>
                <span className="text-3xl font-black text-white">
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
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-white transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={executePurchase}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all hover:brightness-110"
                  style={{ backgroundColor: '#B5D430', color: '#132613' }}
                >
                  Pay now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
