import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Zap, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import type { NetworkType, ServicePlan } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

const NETWORKS: { id: NetworkType, name: string, color: string }[] = [
  { id: 'MTN', name: 'MTN Nigeria', color: 'bg-yellow-400 text-slate-900' },
  { id: 'Airtel', name: 'Airtel Africa', color: 'bg-red-650 text-white' },
  { id: 'Glo', name: 'Glo World', color: 'bg-green-600 text-white' },
  { id: '9mobile', name: '9mobile', color: 'bg-emerald-900 text-white' },
];

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

  // Load plans from 'data_plans' collection on page mount using real-time onSnapshot sync
  React.useEffect(() => {
    console.log("Attempting to connect to Firestore collection: 'data_plans'...");
    setFetchingPlans(true);
    let fallbackLoaded = false;

    const fetchBackupPlans = async () => {
      try {
        const response = await fetch('/api/plans');
        if (response.ok) {
          const plansList = await response.json();
          if (Array.isArray(plansList) && plansList.length > 0) {
            console.log("Successfully loaded plans via fallback API /api/plans:", plansList);
            const mapped = plansList.map((p: any) => {
              const pName = p.plan_name || p.name || p.planName || `${p.network_type || p.network || ''} Plan`;
              const pPrice = Number(p.retail_price || p.price || p.amount || 0);
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
            setAllPlans(mapped);
            fallbackLoaded = true;
          }
        }
      } catch (err) {
        console.warn("Could not read backup plans from /api/plans API:", err);
      } finally {
        setFetchingPlans(false);
      }
    };

    fetchBackupPlans();

    const q = query(collection(db, "data_plans"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log(`Firestore metadata: metadata.fromCache = ${querySnapshot.metadata.fromCache}`);
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
        }
        
        if (!expiresAtDate || expiresAtDate > now) {
          const pName = data.plan_name || data.name || data.planName || `${data.network_type || data.network || ''} Plan`;
          const pPrice = Number(data.retail_price || data.price || data.amount || 0);
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
      
      console.log(`Successfully loaded ${plansList.length} un-expired plans from Firestore:`, plansList);
      setAllPlans(plansList);
      setFetchingPlans(false);
    }, (error) => {
      console.error("CRITICAL FIRESTORE ERROR UNABLE TO READ DATA:", error.code, error.message);
      if (!fallbackLoaded) {
        fetchBackupPlans();
      }
    });

    return () => unsubscribe();
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
      ? Number(selectedPlan?.retail_price ?? selectedPlan?.amount ?? selectedPlan?.price ?? 0) 
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
    <div className="bg-[#F4F4F9] rounded-xl border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] font-sans" id="vtu_purchase_panel">
      
      {/* Header with beautiful Purple Accent and solid bottom border */}
      <div className="bg-[#5B21B6] border-b-2 border-black p-6 text-white text-left relative overflow-hidden">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center border-2 border-white">
            {type === 'data' ? <Smartphone size={20} className="text-white" /> : <Zap size={20} className="text-white" />}
          </div>
          <div>
            <h3 className="font-black text-lg uppercase tracking-tight">Buy {type === 'data' ? 'Data Bundle' : 'Airtime'}</h3>
            <p className="text-xs text-purple-100 font-black">CONNECTED TO PEYFLEX DIRECT VTU NODES</p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-8 bg-white">
        
        {purchaseStatus === 'idle' && (
          <form onSubmit={(e) => { e.preventDefault(); setShowConfirmModal(true); }} className="space-y-6">
            
            {/* Field 1: Network Selection Header (Neo-Brutalist Premium Graphic Tickets) */}
            <div className="space-y-3">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                Select Network Operator
              </label>
              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none snap-x -mx-1 px-1">
                {NETWORKS.map((nw) => {
                  const isSelected = String(network).toLowerCase() === String(nw.id).toLowerCase();
                  return (
                    <motion.button
                      key={nw.id}
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => {
                        setNetwork(nw.id as NetworkType);
                        toast.success(`Active Carrier: ${nw.name}`);
                      }}
                      className={cn(
                        "flex-shrink-0 snap-start flex items-center gap-3 px-5 py-4 rounded-xl border-2 border-black text-sm font-extrabold transition-all cursor-pointer min-w-[150px] select-none",
                        isSelected 
                          ? nw.id === 'MTN'
                            ? 'bg-[#FFCC00] text-black shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                            : nw.id === 'Airtel'
                            ? 'bg-[#E60000] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                            : nw.id === 'Glo'
                            ? 'bg-[#22B14C] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                            : 'bg-[#005A36] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                          : "bg-white text-black shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]"
                      )}
                    >
                      <span className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black uppercase text-center shrink-0 border border-black/20",
                        nw.color
                      )}>
                        {nw.id[0]}
                      </span>
                      <div className="text-left">
                        <p className="text-xs font-mono font-black uppercase tracking-tight leading-none">{nw.id}</p>
                        <p className={cn("text-[9px] font-black uppercase tracking-tight mt-0.5", isSelected ? "text-current opacity-80" : "text-slate-500")}>
                          {isSelected ? "Active" : "Select"}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              {/* Field 2: Phone Number Input */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                  Recipient Phone Number
                </label>
                <div className="relative">
                  <input
                    id="phone_number_input"
                    required
                    type="tel"
                    placeholder="e.g. 08031234567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').substring(0, 11))}
                    className="w-full bg-white border-2 border-black rounded-xl px-5 py-4 font-black text-sm text-black focus:outline-none focus:bg-purple-55 placeholder-black/40 transition-all tracking-wider font-mono shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] focus:-translate-y-0.5"
                  />
                  {currentNetworkObject && (
                    <span className={cn(
                      "absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-tight border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]",
                      network === 'MTN' && 'bg-[#FFCC00] text-black',
                      network === 'Airtel' && 'bg-[#E60000] text-white',
                      network === 'Glo' && 'bg-[#22B14C] text-white',
                      network === '9mobile' && 'bg-[#005A36] text-white'
                    )}>
                      {network}
                    </span>
                  )}
                </div>
              </div>

              {/* Field 3: Airtime Top-Up (Only shown if type is airtime) */}
              {type === 'airtime' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                    Enter Airtime Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-black text-sm">₦</span>
                    <input
                      id="airtime_amount_input"
                      required
                      type="number"
                      placeholder="e.g. 500"
                      min="50"
                      max="50000"
                      value={airtimeAmount}
                      onChange={(e) => setAirtimeAmount(e.target.value)}
                      className="w-full bg-white border-2 border-black rounded-xl pl-10 pr-5 py-4 font-black text-sm text-black focus:outline-none focus:bg-purple-55 placeholder-black/40 transition-all font-mono shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] focus:-translate-y-0.5"
                    />
                  </div>
                </div>
              ) : (
                /* Static category helper for data bundles */
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                    Plan Category Filters
                  </label>
                  <div className="flex gap-2">
                    {['ALL', 'SME', 'GIFTING', 'CG'].map((cat) => {
                      const isSelected = cat === 'ALL' ? planType === '' : planType.toUpperCase() === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            const newType = cat === 'ALL' ? '' : cat;
                            setPlanType(newType);
                          }}
                          className={cn(
                            "flex-1 py-3 text-[10px] uppercase font-black rounded-lg border-2 border-black tracking-tight transition-all text-center",
                            isSelected
                              ? 'bg-[#5B21B6] text-white shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-x-[1px] translate-y-[1px]'
                              : "bg-white text-black hover:bg-slate-50 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Field 4: Custom Premium Plan Grid (Only for Data) */}
            {type === 'data' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center pr-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Select Data Bundle Pack
                  </label>
                  {plans.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-extrabold font-mono uppercase bg-slate-50 px-2 py-1 rounded-md">
                      {plans.filter(p => checkCategoryMatch(p)).length} Packs listed
                    </span>
                  )}
                </div>

                {fetchingPlans ? (
                  <div className="w-full bg-slate-50/80 border border-slate-150 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 border-dashed">
                    <Loader2 className="animate-spin text-purple-655" size={24} />
                    <span className="text-xs text-slate-550 font-bold">Querying available plans from direct Firestore DB...</span>
                  </div>
                ) : !network ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center text-slate-455 text-xs font-bold leading-normal">
                    📶 Choose network operator above to load dynamic products
                  </div>
                ) : plans.filter(p => checkCategoryMatch(p)).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-rose-150 bg-rose-50/20 p-10 text-center text-rose-550 text-xs font-semibold leading-normal">
                    ⚠️ No compatible {planType || 'matching'} products found on Firestore for {network} network.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4.5 max-h-[300px] overflow-y-auto pr-1">
                    {plans
                      .filter(p => checkCategoryMatch(p))
                      .map((p) => {
                        const isSelected = (selectedPlan?.peyflex_variation_id || selectedPlan?.id) === (p.peyflex_variation_id || p.id);
                        const name = p.plan_name || p.planName || p.name || '';
                        const price = p.retail_price || p.amount || p.price || 0;
                        const duration = p.validity_days || p.validity || p.duration || '30 Days';
                        
                        // Tag Integration: Parse the plan titles on load
                        const isAwuf = name.toLowerCase().includes('awuf') || name.toLowerCase().includes('binge');
                        const tagLabel = isAwuf ? (name.toLowerCase().includes('awuf') ? 'POPULAR AWUF' : 'SHORT-TERM') : null;

                        // Size parsing display
                        let sizeDisplay = name;
                        const sizeMatch = name.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
                        if (sizeMatch && sizeMatch[1]) {
                          sizeDisplay = sizeMatch[1].toUpperCase();
                        }

                        return (
                          <motion.div
                            key={p.id}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => {
                              setSelectedPlan(p);
                              toast.success(`Chosen Pack: ${name}`);
                            }}
                            className={cn(
                              "relative cursor-pointer rounded-xl p-4 text-left border-2 border-black transition-all flex flex-col justify-between h-[115px] select-none",
                              isSelected 
                                ? "bg-purple-50 text-black shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] translate-x-[1px] translate-y-[1px]"
                                : "bg-white text-black hover:-translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                            )}
                          >
                            {tagLabel && (
                              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 text-[7px] font-black uppercase text-white bg-black border border-white rounded-full tracking-wider shadow-sm">
                                {tagLabel}
                              </span>
                            )}

                            <div className="space-y-0.5 text-left">
                              <span className="text-[9px] font-black text-[#5B21B6] font-sans tracking-wide uppercase leading-none">
                                {p.planType || 'Data Pack'}
                              </span>
                              <h2 className="text-sm font-black text-black tracking-tight leading-snug line-clamp-1">
                                {sizeDisplay}
                              </h2>
                              <p className="text-[9px] text-slate-500 font-bold leading-none">
                                validity: {duration}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-black/10 flex items-center justify-between text-left">
                              <span className="text-xs font-black text-black font-mono">
                                ₦{Number(price).toLocaleString()}
                              </span>
                              {isSelected && (
                                <span className="w-5 h-5 bg-[#22B14C] text-white border border-black rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm">
                                  ✓
                                </span>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Field 5: Projected Balance Indicator Line */}
            {user && (
              <div className="p-4 bg-[#F4F4F9] border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] overflow-hidden">
                <div className="flex flex-col items-center justify-center space-y-2 py-1 text-center select-none font-mono">
                  <div className="text-[9px] uppercase font-black text-slate-600 tracking-widest font-sans mb-1">
                    PROJECTED BALANCE METRICS
                  </div>
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs text-black font-black overflow-x-auto max-w-full">
                    <span className="bg-white border border-black px-2 py-0.5 rounded text-black">
                      Bal: {formatCurrency(user.balance)}
                    </span>
                    <span className="text-black font-black">➔</span>
                    <span className="bg-red-100 border border-black px-2 py-0.5 rounded text-red-700">
                      Cost: -{formatCurrency(type === 'data' ? (selectedPlan?.retail_price ?? selectedPlan?.amount ?? selectedPlan?.price ?? 0) : Number(airtimeAmount || 0))}
                    </span>
                    <span className="text-black font-black">➔</span>
                    <span className={cn(
                      "px-2 py-0.5 border border-black rounded text-black",
                      user.balance < (type === 'data' ? (selectedPlan?.retail_price ?? selectedPlan?.amount ?? selectedPlan?.price ?? 0) : Number(airtimeAmount || 0))
                        ? "bg-red-200 animate-pulse text-red-900"
                        : "bg-emerald-100 text-emerald-900"
                    )}>
                      Next: {formatCurrency(user.balance - (type === 'data' ? (selectedPlan?.retail_price ?? selectedPlan?.amount ?? selectedPlan?.price ?? 0) : Number(airtimeAmount || 0)))}
                    </span>
                  </div>
                </div>
                
                {user.balance < (type === 'data' ? (selectedPlan?.retail_price ?? selectedPlan?.amount ?? selectedPlan?.price ?? 0) : Number(airtimeAmount || 0)) && (
                  <p className="text-[10px] text-center text-red-650 font-black font-sans mt-2.5 border-t border-black/10 pt-2 flex items-center justify-center gap-1 leading-tight">
                    ⚠️ INSUFFICIENT BALANCE VALUES. PLEASE TOP-UP WALLET BALANCE FIRST.
                  </p>
                )}
              </div>
            )}

            {/* Field 6: Dynamic Buy Button */}
            <button
              id="buy_vtu_submit_btn"
              type="submit"
              disabled={
                !network || 
                phoneNumber.length < 10 || 
                (type === 'data' && !selectedPlan) || 
                (type === 'airtime' && (!airtimeAmount || Number(airtimeAmount) <= 0))
              }
              className="w-full bg-[#5B21B6] hover:bg-purple-700 text-white border-2 border-black rounded-xl py-4 flex items-center justify-center gap-2 hover:-translate-y-0.5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none font-black text-xs uppercase tracking-widest cursor-pointer select-none"
            >
              🚀 Process Secure {type === 'data' ? 'Data Order' : 'Airtime Order'}
            </button>

            {/* Direct WhatsApp client support triggering button */}
            <a
              href="https://wa.me/2348143889102?text=Hello%20Nooraya%20Support,%20I%20need%20help%20with..."
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-black border-2 border-black rounded-xl py-4 flex items-center justify-center gap-2 hover:-translate-y-0.5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all font-black text-xs uppercase tracking-widest cursor-pointer select-none text-center font-sans no-underline inline-flex justify-center items-center"
            >
              💬 CHAT WITH SUPPORT ON WHATSAPP
            </a>

          </form>
        )}

        {/* Dynamic Success Screens */}
        {purchaseStatus === 'success' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center space-y-6">
            <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto border border-green-150">
              <CheckCircle2 size={44} />
            </div>
            <div>
              <h4 className="text-2xl font-black text-slate-900">Purchase Successful!</h4>
              <p className="text-slate-500 text-sm mt-2">
                Your order has been filled. The value has been credited to <strong className="font-mono text-slate-800">{phoneNumber}</strong>.
              </p>
            </div>
            {createdTransaction && (
              <div className="max-w-xs mx-auto bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-2 text-left font-mono">
                <div className="flex justify-between"><span className="text-slate-400">Reference:</span> <span className="font-bold text-slate-700 select-all">{createdTransaction.reference}</span></div>
                <div className="flex justify-between"><span className="text-slate-450">Recipient:</span> <span className="font-bold text-slate-700">{createdTransaction.phoneNumber || phoneNumber}</span></div>
                <div className="flex justify-between"><span className="text-slate-455">Amount:</span> <span className="font-bold text-slate-700">₦{createdTransaction.amount || (type === 'data' ? (selectedPlan?.retail_price ?? selectedPlan?.amount ?? selectedPlan?.price ?? 0) : Number(airtimeAmount || 0))}</span></div>
              </div>
            )}
            <button
              onClick={() => { setPurchaseStatus('idle'); setPhoneNumber(''); setAirtimeAmount(''); setSelectedPlan(null); }}
              className="px-8 py-3.5 bg-purple-650 hover:bg-purple-700 text-white rounded-2xl text-xs font-extrabold shadow-lg shadow-purple-100 transition-all"
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
                <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0 border border-purple-100">
                  <AlertTriangle size={24} />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-900 text-lg">Confirm Order</h4>
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
                  <span className="text-lg font-black text-purple-600 tracking-tight">
                    {formatCurrency(type === 'data' ? (selectedPlan?.retail_price ?? selectedPlan?.amount ?? selectedPlan?.price ?? 0) : Number(airtimeAmount))}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="bg-slate-50 hover:bg-slate-105 border border-slate-250 text-slate-600 font-bold rounded-xl py-3 text-xs transition-all"
                >
                  Back
                </button>
                <button
                  disabled={loading}
                  onClick={() => {
                    setShowConfirmModal(false);
                    handlePurchaseSubmit();
                  }}
                  className="bg-purple-650 hover:bg-purple-700 text-white font-extrabold rounded-xl py-3 text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-purple-100"
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
