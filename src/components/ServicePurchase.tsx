import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Zap, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import type { NetworkType, ServicePlan, UserProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import SuccessFeedback from './SuccessFeedback';

const NETWORKS: { id: NetworkType, name: string, color: string }[] = [
  { id: 'MTN', name: 'MTN Nigeria', color: 'bg-yellow-400 text-slate-900' },
  { id: 'Airtel', name: 'Airtel Africa', color: 'bg-red-650 text-white' },
  { id: 'Glo', name: 'Glo World', color: 'bg-green-600 text-white' },
  { id: '9mobile', name: '9mobile', color: 'bg-emerald-900 text-white' },
];

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
  const [selectedPlan, setSelectedPlan] = React.useState<any | null>(null);
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
  }, [phoneNumber]);

  // Load plans from Supabase (PostgreSQL) and Firestore on page mount using real-time sync / Supabase Realtime Subscriptions
  React.useEffect(() => {
    console.log("Connecting to Supabase and Firestore real-time streams for: 'data_plans'...");
    setFetchingPlans(true);
    let fallbackLoaded = false;

    // Helper helper to format standard schema models nicely
    const normalizeSupabasePlans = (rawList: any[]) => {
      const now = new Date();
      return rawList
        .filter((p: any) => {
          const expAt = p.expires_at || p.expiresAt;
          if (!expAt) return true;
          return new Date(expAt) > now;
        })
        .map((p: any) => {
          const pName = p.plan_name || p.name || p.planName || `${p.network_type || p.network || ''} Plan`;
          const pPrice = Number(p.retail_price || p.price || p.amount || 0);
          const rPrice = Number(p.reseller_price || p.resellerPrice || pPrice);
          const net = String(p.network_type || p.network || 'MTN').toUpperCase();
          const pType = p.type || 'data';
          const pVarId = p.peyflex_id || p.peyflex_variation_id || p.apiPlanId || p.id;
          const pValidity = p.validity_days || p.duration || p.validity || '30 Days';
          
          const pt = String(p.planType || p.plan_category || '').toUpperCase();
          const pNameUpper = String(pName).toUpperCase();
          let planCategory = "GIFTING";
          if (pt.includes("SME") || pNameUpper.includes("SME")) {
            planCategory = "SME";
          } else if (pt.includes("CG") || pt.includes("CORPORATE") || pNameUpper.includes("CG") || pNameUpper.includes("CORPORATE")) {
            planCategory = "CG";
          }

          return {
            id: p.id,
            ...p,
            name: pName,
            plan_name: pName,
            planName: pName,
            price: pPrice,
            retail_price: pPrice,
            resellerPrice: rPrice,
            reseller_price: rPrice,
            amount: pPrice,
            network_type: net,
            network: net,
            type: pType,
            peyflex_id: pVarId,
            peyflex_variation_id: pVarId,
            apiPlanId: pVarId,
            duration: pValidity,
            validity_days: pValidity,
            plan_category: planCategory,
            planType: planCategory
          };
        });
    };

    const fetchBackupPlans = async () => {
      try {
        const response = await fetch('/api/services/data');
        if (response.ok) {
          const resData = await response.json();
          const plansList = Array.isArray(resData) ? resData : (resData.plans || resData.services || []);
          if (plansList && plansList.length > 0) {
            console.log("Successfully loaded plans via clean API /api/services/data:", plansList);
            const mapped = normalizeSupabasePlans(plansList);
            setAllPlans(mapped);
            fallbackLoaded = true;
          }
        }
      } catch (err) {
        console.warn("Could not read backup plans from /api/services/data API:", err);
      } finally {
        setFetchingPlans(false);
      }
    };

    // 1. Initial Load and Realtime Subscription using official Supabase Client
    const initSupabaseSync = async () => {
      try {
        const response = await fetch('/api/services/data');
        if (response.ok) {
          const resData = await response.json();
          const initialPlans = Array.isArray(resData) ? resData : (resData.plans || resData.services || []);
          if (initialPlans && initialPlans.length > 0) {
            console.log("[Supabase Sync] Ingested raw services live structures:", initialPlans.length);
            setAllPlans(normalizeSupabasePlans(initialPlans));
            setFetchingPlans(false);
          } else {
            fetchBackupPlans();
          }
        } else {
          fetchBackupPlans();
        }
      } catch (err: any) {
        console.warn("[Supabase Realtime Initial Fetch] Falling back to traditional load strategy:", err.message);
        fetchBackupPlans();
      }
    };

    initSupabaseSync();

    // Subscribe to pg realtime events on services_config
    const supabaseChannel = supabase
      .channel('realtime:services_config')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'services_config' },
        async () => {
          console.log("[Supabase Realtime] Change detected in postgres services_config, reloading list...");
          try {
            const response = await fetch('/api/services/data');
            if (response.ok) {
              const resData = await response.json();
              const updatedPlans = Array.isArray(resData) ? resData : (resData.plans || resData.services || []);
              if (updatedPlans) {
                setAllPlans(normalizeSupabasePlans(updatedPlans));
              }
            }
          } catch (e) {
            console.error("Failed to update plans on real-time event:", e);
          }
        }
      )
      .subscribe();

    // 2. Fallback Firebase Realtime onSnapshot connection to preserve continuous operability
    const q = query(collection(db, "data_plans"));
    const unsubscribeFirebase = onSnapshot(q, (querySnapshot) => {
      const plansList: any[] = [];
      const now = new Date();
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        let expiresAtDate: Date | null = null;
        if (data.expiresAt) {
          if (typeof data.expiresAt.toDate === 'function') {
            expiresAtDate = data.expiresAt.toDate();
          } else {
            expiresAtDate = new Date(data.expiresAt);
          }
        } else if (data.expires_at) {
          expiresAtDate = new Date(data.expires_at);
        }
        
        if (!expiresAtDate || expiresAtDate > now) {
          const pName = data.plan_name || data.name || data.planName || `${data.network_type || data.network || ''} Plan`;
          const pPrice = Number(data.retail_price || data.price || data.amount || 0);
          const rPrice = Number(data.reseller_price || data.resellerPrice || pPrice);
          const network = String(data.network_type || data.network || 'MTN').toUpperCase();
          const pType = data.type || 'data';
          const pVarId = data.peyflex_id || data.peyflex_variation_id || data.apiPlanId || doc.id;
          const pValidity = data.validity_days || data.duration || data.validity || '30 Days';
          
          const pt = String(data.planType || data.plan_category || '').toUpperCase();
          const pNameUpper = String(pName).toUpperCase();
          let planCategory = "GIFTING";
          if (pt.includes("SME") || pNameUpper.includes("SME")) {
            planCategory = "SME";
          } else if (pt.includes("CG") || pt.includes("CORPORATE") || pNameUpper.includes("CG") || pNameUpper.includes("CORPORATE")) {
            planCategory = "CG";
          }

          plansList.push({
            id: doc.id,
            ...data,
            name: pName,
            plan_name: pName,
            planName: pName,
            price: pPrice,
            retail_price: pPrice,
            resellerPrice: rPrice,
            reseller_price: rPrice,
            amount: pPrice,
            network_type: network,
            network: network,
            type: pType,
            peyflex_id: pVarId,
            peyflex_variation_id: pVarId,
            apiPlanId: pVarId,
            duration: pValidity,
            validity_days: pValidity,
            plan_category: planCategory,
            planType: planCategory
          });
        }
      });
      
      if (plansList.length > 0) {
        console.log(`[Firebase Fallback Sync] Activated with ${plansList.length} un-expired records`);
        setAllPlans(plansList);
        setFetchingPlans(false);
      }
    }, (error) => {
      console.warn("Alternative fallback listener passive error:", error.message);
      if (!fallbackLoaded && allPlans.length === 0) {
        fetchBackupPlans();
      }
    });

    return () => {
      supabase.removeChannel(supabaseChannel);
      unsubscribeFirebase();
    };
  }, []);

  // Filter plans based on selected network with precise case-insensitive matching & 7-day lifespans
  const plans = React.useMemo(() => {
    if (!network) return [];
    return allPlans.filter(plan => {
      const isMatch = plan.network_type?.toUpperCase() === network?.toUpperCase();
      
      let isExpired = false;
      if (plan.expiresAt) {
        let expiryTime: number;
        if (plan.expiresAt && plan.expiresAt.seconds) {
          expiryTime = plan.expiresAt.seconds * 1000;
        } else {
          expiryTime = new Date(plan.expiresAt).getTime();
        }
        if (!isNaN(expiryTime) && expiryTime < Date.now()) {
          isExpired = true;
        }
      }

      return isMatch && !isExpired;
    });
  }, [allPlans, network]);

  // Helper helper to filter categories perfectly
  const checkCategoryMatch = React.useCallback((p: ServicePlan) => {
    const ptSelected = String(planType || '').toUpperCase();
    if (ptSelected === 'ALL' || ptSelected === '') return true;
    const itemCategory = String(p.plan_category || p.planType || 'GIFTING').toUpperCase();
    if (ptSelected === 'SME') return itemCategory === 'SME';
    if (ptSelected === 'CG' || ptSelected === 'CORPORATE' || ptSelected === 'CORPORATE GIFTING') return itemCategory === 'CG';
    if (ptSelected === 'GIFTING') return itemCategory === 'GIFTING';
    return itemCategory === ptSelected;
  }, [planType]);

  // Handle plan auto selection
  React.useEffect(() => {
    if (plans.length > 0) {
      const activeCategoryPlans = plans.filter(p => checkCategoryMatch(p));
      if (activeCategoryPlans.length > 0) {
        setSelectedPlan(activeCategoryPlans[0]);
      } else {
        setSelectedPlan(plans[0]);
      }
    } else {
      setSelectedPlan(null);
    }
  }, [plans, network, planType, checkCategoryMatch]);

  const handlePurchaseSubmit = async () => {
    if (!user) {
      toast.error("Please sign in to place transaction orders.");
      return;
    }

    setLoading(true);
    setPurchaseStatus('idle');

    const amount = type === 'data' 
      ? getPlanPriceForUser(selectedPlan, user) 
      : Number(airtimeAmount);

    try {
      const endpoint = type === 'data' ? '/api/v1/data/purchase' : '/api/vtu/buy-data';
      const requestBody = type === 'data' 
        ? {
            userId: user.uid,
            phone_number: phoneNumber,
            network,
            peyflex_variation_id: selectedPlan?.peyflex_variation_id || selectedPlan?.peyflex_id || selectedPlan?.apiPlanId || selectedPlan?.id || '',
            retail_price: amount,
            plan_name: selectedPlan?.plan_name || selectedPlan?.planName || selectedPlan?.name || ''
          }
        : {
            userId: user.uid,
            network,
            planName: `${network} Airtime`,
            amount,
            phoneNumber,
            planType: 'Airtime',
            apiPlanId: 'airtime_top_up'
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setPurchaseStatus('success');
        setCreatedTransaction(result.transaction);
        toast.success(result.message || "VTU transaction dispatched successfully!");
      } else {
        setPurchaseStatus('failed');
        toast.error(result.error || "Transaction declined by peer network gateway.");
      }
    } catch (err: any) {
      console.error(err);
      setPurchaseStatus('failed');
      toast.error("An outbound communication error occurred. Check connectivity.");
    } finally {
      setLoading(false);
    }
  };

  const currentNetworkObject = NETWORKS.find(n => n.id === network);

  return (
    <div className="bg-[#F8F9FA] rounded-[2rem] border border-slate-200 overflow-hidden shadow-xl max-w-xl mx-auto font-sans" id="vtu_purchase_panel">
      
      {/* Visual Header */}
      <div className="bg-[#1E293B] p-6 text-white text-center relative">
        <h3 className="font-extrabold text-xl tracking-tight uppercase">
          {type === 'data' ? 'Buy Data Plan' : 'Buy Airtime Recharge'}
        </h3>
        <p className="text-xs text-slate-300 mt-1 uppercase font-semibold">
          {type === 'data' ? 'Get Cheap High-Speed Internet Bundles' : 'Instant Automatic Airtime Delivery'}
        </p>
      </div>

      <div className="p-6 sm:p-8 bg-white">
        
        {purchaseStatus === 'idle' && (
          <form onSubmit={(e) => { e.preventDefault(); setShowConfirmModal(true); }} className="space-y-6">
            
            {/* Field 0: Codes for Data Balance Banner (Only for Data) */}
            {type === 'data' && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                  Codes for Data Balance:
                </h4>
                <div className="grid grid-cols-1 gap-2 text-xs font-bold font-mono">
                  <div className="bg-[#FEF9C3] text-yellow-800 border border-yellow-200 rounded-xl px-4 py-2.5 text-center shadow-sm">
                    MTN [SME] *461*4#
                  </div>
                  <div className="bg-[#FEF3C7] text-amber-800 border border-amber-200 rounded-xl px-4 py-2.5 text-center shadow-sm">
                    MTN [Gifting] *131*4# or *460*260#
                  </div>
                  <div className="bg-[#F3E8FF] text-purple-850 border border-purple-200 rounded-xl px-4 py-2.5 text-center shadow-sm">
                    9mobile [Gifting] *228#
                  </div>
                  <div className="bg-[#FEE2E2] text-red-800 border border-red-200 rounded-xl px-4 py-2.5 text-center shadow-sm">
                    Airtel *140#
                  </div>
                  <div className="bg-[#DCFCE7] text-green-800 border border-green-200 rounded-xl px-4 py-2.5 text-center shadow-sm">
                    Glo *127*0#
                  </div>
                </div>
              </div>
            )}

            {/* Field 1: Select Network Dropdown */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Network *
              </label>
              <select
                required
                value={network || ''}
                onChange={(e) => {
                  setNetwork(e.target.value as NetworkType);
                  toast.success(`Active Carrier: ${e.target.value}`);
                }}
                className="w-full bg-white border border-slate-350 rounded-2xl px-5 py-4 font-bold text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all shadow-sm"
              >
                <option value="">---------- Select Network ----------</option>
                {NETWORKS.map((nw) => (
                  <option key={nw.id} value={nw.id}>{nw.name}</option>
                ))}
              </select>
            </div>

            {/* Field 2: Select Data Type (Only for Data) */}
            {type === 'data' && (
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                  Data type *
                </label>
                <select
                  required
                  value={planType}
                  onChange={(e) => {
                    setPlanType(e.target.value);
                  }}
                  className="w-full bg-white border border-slate-350 rounded-2xl px-5 py-4 font-bold text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all shadow-sm"
                >
                  <option value="">---------- Choose Data Type ----------</option>
                  <option value="SME">SME1</option>
                  <option value="CG">CORPORATE GIFTING</option>
                  <option value="SME">SME</option>
                  <option value="SME">SME2</option>
                  <option value="GIFTING">AWOOF DATA</option>
                  <option value="ALL">ALL TYPES</option>
                </select>
                <p className="text-[10px] text-slate-500 font-bold tracking-tight">
                  Select Plan Type SME or GIFTING or CORPORATE GIFTING
                </p>
              </div>
            )}

            {/* Field 3: Recipient Phone Number */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Mobile number *
              </label>
              <input
                id="phone_number_input"
                required
                type="tel"
                placeholder="e.g. 08031234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').substring(0, 11))}
                className="w-full bg-white border border-slate-350 rounded-2xl px-5 py-4 font-bold text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all font-mono shadow-sm tracking-wider"
              />
            </div>

            {/* Field 4: Select Dynamic Bundle Plan Option (Only for Data) */}
            {type === 'data' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-white pr-1">
                  <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                    Plan *
                  </label>
                  {plans.length > 0 && (
                    <span className="text-[9px] text-slate-400 font-extrabold font-mono uppercase bg-slate-50 px-2 py-0.5 rounded-md">
                      {plans.filter(p => checkCategoryMatch(p)).length} available
                    </span>
                  )}
                </div>

                {fetchingPlans ? (
                  <div className="w-full bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 border border-dashed border-slate-200">
                    <Loader2 className="animate-spin text-blue-600" size={20} />
                    <span className="text-xs text-slate-500 font-bold">Querying available plans from database...</span>
                  </div>
                ) : !network ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-400 text-xs font-bold">
                    📶 Choose network operator above to load products
                  </div>
                ) : plans.filter(p => checkCategoryMatch(p)).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-red-200 bg-rose-50/20 p-6 text-center text-rose-650 text-xs font-bold">
                    ⚠️ No compatible {planType || 'matching'} products found for {network} network.
                  </div>
                ) : (
                  <select
                    required
                    value={selectedPlan ? (selectedPlan.peyflex_variation_id || selectedPlan.id) : ''}
                    onChange={(e) => {
                      const matchedPlan = plans.find(p => (p.peyflex_variation_id || p.id) === e.target.value);
                      if (matchedPlan) {
                        setSelectedPlan(matchedPlan);
                        toast.success(`Chosen Pack: ${matchedPlan.plan_name || matchedPlan.name}`);
                      }
                    }}
                    className="w-full bg-white border border-slate-350 rounded-2xl px-5 py-4 font-bold text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all shadow-sm"
                  >
                    <option value="">---------- Select Data Bundle ----------</option>
                    {plans
                      .filter(p => checkCategoryMatch(p))
                      .map((p) => {
                        const name = p.plan_name || p.planName || p.name || '';
                        const price = getPlanPriceForUser(p, user);
                        const duration = p.validity_days || p.validity || p.duration || '30 Days';
                        return (
                          <option key={p.id} value={p.peyflex_variation_id || p.id}>
                            {name} = N {price} {duration}
                          </option>
                        );
                      })}
                  </select>
                )}
              </div>
            )}

            {/* Field 5: Airtime Amount (If airtime type is chosen) */}
            {type === 'airtime' && (
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                  Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-900 text-sm">₦</span>
                  <input
                    id="airtime_amount_input"
                    required
                    type="number"
                    placeholder="Enter Airtime Amount. e.g. 500"
                    min="50"
                    max="50000"
                    value={airtimeAmount}
                    onChange={(e) => setAirtimeAmount(e.target.value)}
                    className="w-full bg-white border border-slate-350 rounded-2xl pl-10 pr-5 py-4 font-bold text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 transition-all font-mono shadow-sm"
                  />
                </div>
              </div>
            )}

            {/* Field 6: Editable preview field for amount (If data type is chosen) */}
            {type === 'data' && selectedPlan && (
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">₦</span>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={getPlanPriceForUser(selectedPlan, user)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-5 py-4 font-bold text-sm text-slate-500 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Field 7: Bypass Validator Checkbox */}
            <div className="flex items-center gap-3 py-1 bg-white select-none">
              <input
                type="checkbox"
                id="bypass_number_validator"
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="bypass_number_validator" className="text-xs font-black text-slate-500 uppercase tracking-wider cursor-pointer">
                Bypass number validator
              </label>
            </div>

            {/* Balance Forecast Overlay / Validation Panel */}
            {user && (
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="flex flex-col items-center justify-center space-y-2 py-1 text-center font-mono">
                  <div className="text-[9px] uppercase font-black text-slate-450 tracking-widest font-sans">
                    WALLET BALANCE INTEGRITY
                  </div>
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs text-black font-semibold overflow-x-auto max-w-full">
                    <span className="bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700">
                      Bal: {formatCurrency(user.balance)}
                    </span>
                    <span className="text-slate-405">➔</span>
                    <span className="bg-red-50 border border-red-200 px-2 py-0.5 rounded text-red-700">
                      Cost: -{formatCurrency(type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount || 0))}
                    </span>
                    <span className="text-slate-405">➔</span>
                    <span className={cn(
                      "px-2 py-0.5 border rounded-lg",
                      user.balance < (type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount || 0))
                        ? "bg-red-100 border-red-300 text-red-900 animate-pulse"
                        : "bg-emerald-50 border-emerald-300 text-emerald-900"
                    )}>
                      Next: {formatCurrency(user.balance - (type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount || 0)))}
                    </span>
                  </div>
                </div>
                
                {user.balance < (type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount || 0)) && (
                  <p className="text-[10px] text-center text-red-650 font-bold font-sans mt-2.5 border-t border-slate-200 pt-2 flex items-center justify-center gap-1 leading-tight">
                    ⚠️ INSUFFICIENT BALANCE. Please fund your wallet first.
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              id="buy_vtu_submit_btn"
              type="submit"
              disabled={
                !network || 
                phoneNumber.length < 10 || 
                (type === 'data' && !selectedPlan) || 
                (type === 'airtime' && (!airtimeAmount || Number(airtimeAmount) <= 0)) ||
                (user && user.balance < (type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount || 0)))
              }
              className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] disabled:bg-[#94a3b8] disabled:cursor-not-allowed text-white font-extrabold rounded-2xl py-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 font-sans text-sm uppercase tracking-widest cursor-pointer shadow-lg shadow-blue-900/10"
            >
              🚀 Buy Now
            </button>

            {/* Direct WhatsApp client support floating button */}
            <a
              href="https://wa.me/2348143889102?text=Hello%20Ridamsub%20Support,%20I%20need%20help%20with..."
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-2xl py-4 flex items-center justify-center gap-2 transition-all font-black text-xs uppercase tracking-widest cursor-pointer select-none text-center font-sans no-underline inline-flex justify-center items-center"
            >
              💬 Chat support on whatsapp
            </a>

          </form>
        )}

        {/* Dynamic Success Screens */}
        {purchaseStatus === 'success' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center space-y-6">
            <SuccessFeedback size={80} showConfetti={true} />
            <div>
              <h4 className="text-2xl font-black text-slate-900 mt-2">Purchase Successful!</h4>
              <p className="text-slate-500 text-sm mt-2">
                Your order has been filled. The value has been credited to <strong className="font-mono text-slate-800">{phoneNumber}</strong>.
              </p>
            </div>
            {createdTransaction && (
              <div className="max-w-xs mx-auto bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-2 text-left font-mono">
                <div className="flex justify-between"><span className="text-slate-400">Reference:</span> <span className="font-bold text-slate-700 select-all">{createdTransaction.reference}</span></div>
                <div className="flex justify-between"><span className="text-slate-450">Recipient:</span> <span className="font-bold text-slate-700">{createdTransaction.phoneNumber || phoneNumber}</span></div>
                <div className="flex justify-between"><span className="text-slate-455">Amount:</span> <span className="font-bold text-slate-700">₦{createdTransaction.amount || (type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount || 0))}</span></div>
              </div>
            )}
            <button
               onClick={() => { setPurchaseStatus('idle'); setPhoneNumber(''); setAirtimeAmount(''); setSelectedPlan(null); }}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-extrabold shadow-lg transition-all"
            >
              🔄 Order Another
            </button>
          </motion.div>
        )}

        {/* Dynamic Failed Screen */}
        {purchaseStatus === 'failed' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center space-y-6">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <AlertTriangle size={44} />
            </div>
            <div>
              <h4 className="text-2xl font-black text-slate-900">Transaction Failed</h4>
              <p className="text-slate-500 text-sm mt-2">
                The transaction request was returned as rejected by the operator network center or local limits.
              </p>
            </div>
            <button
              onClick={() => { setPurchaseStatus('idle'); }}
              className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
            >
              👈 Try Again
            </button>
          </motion.div>
        )}

      </div>

      {/* Confirmation Modal overlay */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(false)}
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden border border-slate-100 shadow-2xl z-10 p-6 space-y-6 text-left relative"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-100">
                  <AlertTriangle size={24} />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-slate-900 text-lg">Confirm Order</h4>
                  <p className="text-xs text-slate-400 font-bold">Please verify the details before billing.</p>
                </div>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors ml-auto"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4.5 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">TYPE:</span>
                  <span className="font-extrabold text-slate-800 capitalize">{type} order</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">CARRIER:</span>
                  <span className="font-extrabold text-slate-800 uppercase">{network}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">MOBILE:</span>
                  <span className="font-bold text-slate-800">{phoneNumber}</span>
                </div>
                {type === 'data' && selectedPlan && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase text-[9px]">BUNDLE:</span>
                    <span className="font-extrabold text-slate-800 text-right">{selectedPlan.plan_name || selectedPlan.planName || selectedPlan.name}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-slate-200/55 flex justify-between items-center text-sm font-sans">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Total Due:</span>
                  <span className="text-lg font-black text-blue-600 tracking-tight">
                    {formatCurrency(type === 'data' ? getPlanPriceForUser(selectedPlan, user) : Number(airtimeAmount))}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-xl py-3 text-xs transition-all"
                >
                  Back
                </button>
                <button
                  disabled={loading}
                  onClick={() => {
                    setShowConfirmModal(false);
                    handlePurchaseSubmit();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl py-3 text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    'Confirm & Pay'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
