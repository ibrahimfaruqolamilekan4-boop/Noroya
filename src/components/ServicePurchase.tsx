import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Zap, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import SuccessFeedback from './SuccessFeedback';
import { cn, formatCurrency } from '../lib/utils';
import type { NetworkType, ServicePlan, UserProfile } from '../types';

const NETWORK_SERVICES: Record<string, { id: string; label: string }[]> = {
  MTN: [
    { id: 'mtn_sme',       label: 'SME' },
    { id: 'mtn_gifting',   label: 'Gifting' },
    { id: 'mtn_datashare', label: 'Datashare' },
    { id: 'mtn_awoof',     label: 'Awoof' },
  ],
  GLO: [
    { id: 'glo_sme',  label: 'SME' },
    { id: 'glo_data', label: 'Data' },
  ],
  Airtel: [
    { id: 'airtel_sme',     label: 'SME' },
    { id: 'airtel_gifting', label: 'Gifting' },
  ],
  '9mobile': [
    { id: 'etisalat_data', label: 'Data' },
  ],
};

const BRAND_THEMES: Record<string, { bg: string; text: string; ring: string; border: string; activeText: string }> = {
  MTN: {
    bg: 'bg-yellow-400',
    text: 'text-yellow-400',
    ring: 'ring-yellow-400',
    border: 'border-yellow-400/30',
    activeText: 'text-slate-900',
  },
  GLO: {
    bg: 'bg-green-500',
    text: 'text-green-500',
    ring: 'ring-green-500',
    border: 'border-green-500/30',
    activeText: 'text-slate-900',
  },
  Airtel: {
    bg: 'bg-red-500',
    text: 'text-red-500',
    ring: 'ring-red-500',
    border: 'border-red-500/30',
    activeText: 'text-white',
  },
  '9mobile': {
    bg: 'bg-teal-500',
    text: 'text-teal-400',
    ring: 'ring-teal-500',
    border: 'border-teal-500/30',
    activeText: 'text-slate-900',
  },
};

const BALANCE_CODES: Record<string, { label: string; code: string }[]> = {
  mtn_sme: [{ label: 'SME Balance', code: '*461*4#' }],
  mtn_gifting: [{ label: 'Gifting Balance', code: '*131*4#' }, { label: 'Alternative Gifting Balance', code: '*460*260#' }],
  mtn_datashare: [{ label: 'Datashare Balance', code: '*461*4#' }],
  mtn_awoof: [{ label: 'Awoof Balance', code: '*461*4#' }],
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
    if (plan.reseller_price !== undefined && plan.reseller_price !== null && plan.reseller_price > 0) {
      return Number(plan.reseller_price);
    }
    if (plan.resellerPrice !== undefined && plan.resellerPrice !== null && plan.resellerPrice > 0) {
      return Number(plan.resellerPrice);
    }
  }
  return Number(plan.retail_price ?? plan.price ?? plan.amount ?? 0);
}

export default function ServicePurchase({ type }: { type: 'data' | 'airtime' }) {
  const { user } = useAuth();
  
  // Form states
  const [network, setNetwork] = React.useState<NetworkType | ''>('');
  const [planType, setPlanType] = React.useState<string>('');
  const [selectedPlan, setSelectedPlan] = React.useState<ServicePlan | null>(null);
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [airtimeAmount, setAirtimeAmount] = React.useState('');
  
  // UI states
  const [allPlans, setAllPlans] = React.useState<ServicePlan[]>([]);
  const [fetchingPlans, setFetchingPlans] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [purchaseStatus, setPurchaseStatus] = React.useState<'idle' | 'success' | 'failed'>('idle');
  const [createdTransaction, setCreatedTransaction] = React.useState<any>(null);

  // Auto detect network prefix
  React.useEffect(() => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length >= 4) {
      const prefix = cleaned.substring(0, 4);
      const mtnPrefixes = ['0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0703', '0706'];
      const airtelPrefixes = ['0802', '0808', '0812', '0902', '0907', '0901', '0904', '0701', '0708'];
      const gloPrefixes = ['0805', '0807', '0811', '0815', '0905', '0915', '0705'];
      const ninePrefixes = ['0809', '0817', '0818', '0909', '0908'];

      if (mtnPrefixes.includes(prefix)) {
        if (network !== 'MTN') setNetwork('MTN');
      } else if (airtelPrefixes.includes(prefix)) {
        if (network !== 'Airtel') setNetwork('Airtel');
      } else if (gloPrefixes.includes(prefix)) {
        if (network !== 'Glo') setNetwork('Glo');
      } else if (ninePrefixes.includes(prefix)) {
        if (network !== '9mobile') setNetwork('9mobile');
      }
    }
  }, [phoneNumber, network]);

  // Load plans from Supabase API endpoint only
  React.useEffect(() => {
    const loadPlans = async () => {
      setFetchingPlans(true);
      try {
        const response = await fetch('/api/services/data');
        if (response.ok) {
          const resData = await response.json();
          const plansList: ServicePlan[] = Array.isArray(resData) ? resData : (resData.plans || resData.services || []);
          
          // Helper to normalize plans
          const normalized = plansList.map((p: any) => {
            const pName = p.plan_name || p.name || p.planName || `${p.network_type || p.network || ''} Plan`;
            const pPrice = Number(p.retail_price || p.price || p.amount || 0);
            const rPrice = Number(p.reseller_price || p.resellerPrice || pPrice);
            const net = String(p.network_type || p.network || 'MTN');
            
            // Normalize network name casing for compatibility
            let finalNet = 'MTN';
            if (net.toLowerCase().includes('airtel')) finalNet = 'Airtel';
            else if (net.toLowerCase().includes('glo')) finalNet = 'Glo';
            else if (net.toLowerCase().includes('9mobile') || net.toLowerCase().includes('etisalat')) finalNet = '9mobile';

            const pType = p.type || 'data';
            const pVarId = p.peyflex_variation_id || p.peyflex_id || p.apiPlanId || p.id;
            const pValidity = p.validity_days || p.duration || p.validity || '30 days';

            // Determine mozosubz_service group
            let mozosubz_service = p.mozosubz_service;
            if (!mozosubz_service) {
              const category = String(p.plan_category || '').toLowerCase();
              const nameLower = String(pName).toLowerCase();
              if (finalNet === 'MTN') {
                if (category.includes('sme') || nameLower.includes('sme')) mozosubz_service = 'mtn_sme';
                else if (category.includes('gifting') || nameLower.includes('gifting')) mozosubz_service = 'mtn_gifting';
                else if (category.includes('share') || nameLower.includes('share') || category.includes('cg')) mozosubz_service = 'mtn_datashare';
                else if (category.includes('awoof') || nameLower.includes('awoof')) mozosubz_service = 'mtn_awoof';
                else mozosubz_service = 'mtn_sme';
              } else if (finalNet === 'Glo') {
                if (category.includes('sme') || nameLower.includes('sme')) mozosubz_service = 'glo_sme';
                else mozosubz_service = 'glo_data';
              } else if (finalNet === 'Airtel') {
                if (category.includes('sme') || nameLower.includes('sme')) mozosubz_service = 'airtel_sme';
                else mozosubz_service = 'airtel_gifting';
              } else if (finalNet === '9mobile') {
                mozosubz_service = 'etisalat_data';
              }
            }

            return {
              ...p,
              id: p.id,
              name: pName,
              plan_name: pName,
              price: pPrice,
              retail_price: pPrice,
              reseller_price: rPrice,
              network: finalNet,
              type: pType,
              peyflex_variation_id: pVarId,
              validity_days: pValidity,
              mozosubz_service
            };
          });

          setAllPlans(normalized);
        } else {
          toast.error("Failed to fetch available plans");
        }
      } catch (err) {
        console.error("Error loading plans:", err);
        toast.error("Could not load data plans. Please try again later.");
      } finally {
        setFetchingPlans(false);
      }
    };

    loadPlans();
  }, []);

  // Filter plans based on selection
  const availablePlans = React.useMemo(() => {
    if (!network) return [];
    return allPlans.filter(p => p.network === network && p.mozosubz_service === planType);
  }, [allPlans, network, planType]);

  // Set default plan type tab when network changes
  React.useEffect(() => {
    if (!network) {
      setPlanType('');
      setSelectedPlan(null);
      return;
    }

    const netKey = network === 'Glo' ? 'GLO' : network;
    const types = NETWORK_SERVICES[netKey] || [];
    
    // Find the first plan type that has available plans
    const firstAvailable = types.find(t => 
      allPlans.some(p => p.network === network && p.mozosubz_service === t.id)
    );

    if (firstAvailable) {
      setPlanType(firstAvailable.id);
    } else if (types.length > 0) {
      setPlanType(types[0].id);
    } else {
      setPlanType('');
    }
    setSelectedPlan(null);
  }, [network, allPlans]);

  // Get service count for each network card
  const getNetworkPlanCount = (netName: NetworkType) => {
    return allPlans.filter(p => p.network === netName).length;
  };

  const activeTheme = network ? BRAND_THEMES[network === 'Glo' ? 'GLO' : network] : null;

  const handlePurchase = async () => {
    if (!network) {
      toast.error('Please select a network provider');
      return;
    }
    if (!phoneNumber || phoneNumber.length < 11) {
      toast.error('Please enter a valid 11-digit phone number');
      return;
    }
    if (type === 'data' && !selectedPlan) {
      toast.error('Please select a data plan');
      return;
    }
    if (type === 'airtime' && (!airtimeAmount || Number(airtimeAmount) < 50)) {
      toast.error('Please enter a valid amount (minimum ₦50)');
      return;
    }

    setShowConfirmModal(true);
  };

  const executePurchase = async () => {
    setLoading(true);
    setShowConfirmModal(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again.');
        setLoading(false);
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      };

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

        const response = await fetch('/api/v1/data/purchase', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        const resData = await response.json();
        if (response.ok && resData.status === 'success') {
          setCreatedTransaction(resData.transaction || { amount: finalPrice, reference: resData.reference || 'N/A' });
          setPurchaseStatus('success');
          toast.success('Data purchase initiated successfully!');
        } else {
          setPurchaseStatus('failed');
          toast.error(resData.message || 'Data purchase failed. Please check your balance.');
        }
      } else {
        const payload = {
          network:      network.toUpperCase(),
          phone_number: phoneNumber,
          amount:       Number(airtimeAmount),
        };

        const response = await fetch('/api/buy-airtime', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        const resData = await response.json();
        if (response.ok && (resData.status === 'success' || resData.success === true)) {
          setCreatedTransaction(resData.transaction || {
            amount:    Number(airtimeAmount),
            reference: resData.reference || 'N/A',
          });
          setPurchaseStatus('success');
          toast.success(`₦${airtimeAmount} airtime sent successfully!`);
        } else {
          setPurchaseStatus('failed');
          toast.error(resData.error || resData.message || 'Airtime purchase failed. Please try again.');
        }
      }
    } catch (err: any) {
      console.error('Purchase error:', err);
      setPurchaseStatus('failed');
      toast.error(err.message || 'An unexpected network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPhoneNumber('');
    setAirtimeAmount('');
    setSelectedPlan(null);
    setPurchaseStatus('idle');
    setCreatedTransaction(null);
  };

  if (purchaseStatus === 'success') {
    return (
      <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
        <SuccessFeedback size={100} showConfetti={true} />
        <h2 className="text-2xl font-bold text-white mt-6 mb-2">Purchase Successful!</h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto mb-8">
          Your transaction has been queued and is processing. The recipient's number will be credited shortly.
        </p>
        
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 max-w-md mx-auto text-left space-y-3 mb-8">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400 font-medium">Recipient Number</span>
            <span className="text-white font-semibold">{phoneNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400 font-medium">Network</span>
            <span className="text-white font-semibold">{network}</span>
          </div>
          {type === 'data' && selectedPlan && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400 font-medium">Plan</span>
              <span className="text-white font-semibold">{selectedPlan.name}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-400 font-medium">Amount Charged</span>
            <span className="text-emerald-400 font-bold">
              {formatCurrency(type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount))}
            </span>
          </div>
          {createdTransaction?.reference && (
            <div className="flex justify-between text-sm pt-2 border-t border-slate-700/50">
              <span className="text-slate-400 font-medium">Reference</span>
              <span className="text-slate-300 font-mono text-xs">{createdTransaction.reference}</span>
            </div>
          )}
        </div>

        <button
          onClick={resetForm}
          className="w-full max-w-md bg-slate-800 hover:bg-slate-700 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200"
        >
          Buy Again
        </button>
      </div>
    );
  }

  const selectedNetworkKey = network === 'Glo' ? 'GLO' : network;
  const availableTabs = selectedNetworkKey ? (NETWORK_SERVICES[selectedNetworkKey] || []).filter(tab => 
    allPlans.some(p => p.network === network && p.mozosubz_service === tab.id)
  ) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Network Selector Cards */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-slate-300 block">Select Network Provider</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['MTN', 'Glo', 'Airtel', '9mobile'] as NetworkType[]).map((net) => {
            const theme = BRAND_THEMES[net === 'Glo' ? 'GLO' : net];
            const isSelected = network === net;
            const count = getNetworkPlanCount(net);

            return (
              <button
                key={net}
                type="button"
                onClick={() => setNetwork(net)}
                className={cn(
                  "relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 text-center overflow-hidden h-28 group bg-slate-800/50",
                  isSelected 
                    ? `ring-2 ${theme.ring} ${theme.border} bg-slate-800/80` 
                    : "border-slate-800 hover:border-slate-700/50 hover:bg-slate-800/30"
                )}
              >
                {isSelected && (
                  <span className={cn("absolute top-3 right-3 rounded-full p-0.5", theme.bg, theme.activeText)}>
                    <CheckCircle2 size={12} className="stroke-[3]" />
                  </span>
                )}
                <span className={cn("text-lg font-black tracking-wider transition-colors duration-200", isSelected ? theme.text : "text-slate-400 group-hover:text-slate-300")}>
                  {net}
                </span>
                {type === 'data' && (
                  <span className="text-[10px] text-slate-500 font-medium mt-1">
                    {fetchingPlans ? 'loading...' : `${count} plans`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Plan Type Pills/Tabs for Data */}
      {type === 'data' && network && availableTabs.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-300 block">Select Plan Category</label>
          <div className="flex flex-wrap gap-2">
            {availableTabs.map((tab) => {
              const isActive = planType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPlanType(tab.id);
                    setSelectedPlan(null);
                  }}
                  className={cn(
                    "px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200",
                    isActive
                      ? `${activeTheme?.bg} ${activeTheme?.activeText} shadow-lg shadow-black/20 scale-102`
                      : "bg-slate-800 text-slate-400 hover:bg-slate-800/70 hover:text-slate-300 border border-slate-800/80"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Plans List Grid for Data / Amount Input for Airtime */}
      {type === 'data' ? (
        network && (
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-300 block">Select Data Bundle</label>
            {fetchingPlans ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
                <Loader2 className="animate-spin text-slate-500" size={32} />
                <span className="text-sm text-slate-500 font-medium">Fetching best-priced plans...</span>
              </div>
            ) : availablePlans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 border border-slate-800/80 bg-slate-900/40 rounded-2xl text-center space-y-2">
                <AlertTriangle className="text-slate-600" size={36} />
                <h3 className="text-sm font-semibold text-slate-400">No active plans found</h3>
                <p className="text-xs text-slate-500 max-w-xs">We currently do not have active plans under this category. Please check other options.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availablePlans.map((plan) => {
                  const finalPrice = getPlanPriceForUser(plan, user);
                  const isSelected = selectedPlan?.id === plan.id;
                  
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={cn(
                        "relative flex flex-col justify-between p-4 rounded-2xl border text-left transition-all duration-200 min-h-[110px] bg-slate-800/40 hover:bg-slate-800/60",
                        isSelected 
                          ? `ring-2 ${activeTheme?.ring} ${activeTheme?.border} bg-slate-800/80` 
                          : "border-slate-800 hover:border-slate-700/50"
                      )}
                    >
                      {isSelected && (
                        <span className={cn("absolute top-3 right-3 rounded-full p-0.5", activeTheme?.bg, activeTheme?.activeText)}>
                          <CheckCircle2 size={10} className="stroke-[3]" />
                        </span>
                      )}
                      
                      <div className="space-y-1 pr-4">
                        <span className="text-sm font-bold text-white line-clamp-2 block leading-snug">
                          {plan.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium block">
                          {plan.validity_days || '30 days'} validity
                        </span>
                      </div>

                      <div className="mt-3">
                        <span className={cn("text-base font-extrabold block", isSelected ? activeTheme?.text : "text-emerald-400")}>
                          {formatCurrency(finalPrice)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )
      ) : (
        network && (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300 block">Enter Amount (₦)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">₦</span>
              <input
                type="number"
                placeholder="0.00"
                value={airtimeAmount}
                onChange={(e) => setAirtimeAmount(e.target.value)}
                className="w-full bg-slate-800 border border-slate-800 focus:border-slate-700 rounded-2xl py-4 pl-10 pr-4 text-white placeholder-slate-500 font-bold text-lg focus:outline-none focus:ring-1 focus:ring-slate-700 transition-all duration-150"
              />
            </div>
            <span className="text-[10px] text-slate-500 font-medium block px-1">
              Minimum airtime value of ₦50 allowed per transaction.
            </span>
          </div>
        )
      )}

      {/* Phone Number Input */}
      {network && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-300 block">Recipient Phone Number</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              <Smartphone size={20} />
            </span>
            <input
              type="tel"
              maxLength={11}
              placeholder="08012345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-slate-800 border border-slate-800 focus:border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-500 font-bold tracking-wider text-base focus:outline-none focus:ring-1 focus:ring-slate-700 transition-all duration-150"
            />
          </div>
        </div>
      )}

      {/* USSD Codes Display Panel */}
      {network && (
        <div className="bg-slate-800/30 border border-slate-800/80 rounded-2xl p-4 space-y-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Useful USSD Balance Codes</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {type === 'data' ? (
              (BALANCE_CODES[planType] || []).map((b, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs bg-slate-900/40 border border-slate-800/40 rounded-xl p-3">
                  <span className="text-slate-400 font-medium">{b.label}</span>
                  <span className={cn("font-bold font-mono px-2 py-0.5 rounded", activeTheme?.bg, activeTheme?.activeText)}>
                    {b.code}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex justify-between items-center text-xs bg-slate-900/40 border border-slate-800/40 rounded-xl p-3">
                <span className="text-slate-400 font-medium">Airtime Balance</span>
                <span className={cn("font-bold font-mono px-2 py-0.5 rounded", activeTheme?.bg, activeTheme?.activeText)}>
                  {network === 'MTN' ? '*310#' : network === 'Airtel' ? '*310#' : network === '9mobile' ? '*310#' : '*124#'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proceed Purchase Button */}
      {network && (
        <button
          type="button"
          disabled={loading || (type === 'data' && !selectedPlan) || (type === 'airtime' && !airtimeAmount)}
          onClick={handlePurchase}
          className={cn(
            "w-full flex items-center justify-center space-x-2 py-4.5 px-6 rounded-2xl font-bold text-white tracking-wide transition-all duration-200 mt-6 shadow-xl",
            loading 
              ? "bg-slate-800 text-slate-400 cursor-not-allowed" 
              : activeTheme 
                ? `${activeTheme.bg} ${activeTheme.activeText} hover:brightness-110 active:scale-[0.99]`
                : "bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99]"
          )}
        >
          {loading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <Zap size={18} className="fill-current" />
              <span>Proceed to Purchase</span>
            </>
          )}
        </button>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(false)}
              className="absolute inset-0 bg-black/75 backdrop-blur-xs"
            />

            {/* Content Container */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-extrabold text-white">Confirm Purchase</h3>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-lg transition-colors duration-150"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-4 text-center">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">Total Due</span>
                  <span className="text-3xl font-black text-white">
                    {formatCurrency(type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount))}
                  </span>
                </div>

                <div className="space-y-3 bg-slate-800/30 rounded-2xl p-4 border border-slate-800/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium">Service Type</span>
                    <span className="text-white font-bold capitalize">{type} Purchase</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium">Network Provider</span>
                    <span className={cn("font-bold px-2 py-0.5 rounded text-xs", activeTheme?.bg, activeTheme?.activeText)}>
                      {network}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium">Recipient Phone</span>
                    <span className="text-white font-mono font-bold">{phoneNumber}</span>
                  </div>
                  {type === 'data' && selectedPlan && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400 font-medium">Selected Package</span>
                      <span className="text-white font-bold text-right max-w-[200px] truncate">{selectedPlan.name}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl p-3.5 text-xs">
                  <AlertTriangle size={16} className="shrink-0" />
                  <p className="font-medium leading-relaxed">
                    Verify the recipient's phone number carefully. Airtime and data purchases are final and cannot be refunded.
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 px-4 rounded-xl transition-colors duration-150 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executePurchase}
                  className={cn(
                    "flex-1 font-bold py-3.5 px-4 rounded-xl transition-all duration-150 text-sm",
                    activeTheme ? `${activeTheme.bg} ${activeTheme.activeText} hover:brightness-110` : "bg-emerald-500 hover:bg-emerald-600 text-white"
                  )}
                >
                  Pay Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
