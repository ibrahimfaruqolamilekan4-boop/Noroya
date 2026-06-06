import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  TrendingUp, 
  Plus, 
  Search, 
  DollarSign, 
  Database, 
  Send,  
  Bell, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Smartphone, 
  ShieldCheck, 
  Loader2,
  Trash2,
  ListFilter,
  Edit,
  Package,
  SlidersHorizontal,
  AlertTriangle
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp,
  increment,
  limit,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import type { UserProfile, Transaction, ServicePlan, NetworkType } from '../types';

export default function AdminPanelSection() {
  const [loading, setLoading] = React.useState(true);
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [allTransactions, setAllTransactions] = React.useState<Transaction[]>([]);
  const [dataPlansList, setDataPlansList] = React.useState<any[]>([]);
  const [utilityPlansList, setUtilityPlansList] = React.useState<any[]>([]);
  const [examPlansList, setExamPlansList] = React.useState<any[]>([]);

  const servicePlansList = React.useMemo(() => {
    return [
      ...dataPlansList.map(p => ({ ...p, collectionName: 'data_plans', type: p.type || 'data' })),
      ...utilityPlansList.map(p => ({ ...p, collectionName: 'utility_plans', type: p.type || 'utility' })),
      ...examPlansList.map(p => ({ ...p, collectionName: 'exam_plans', type: p.type || 'exam' }))
    ];
  }, [dataPlansList, utilityPlansList, examPlansList]);
  
  // Search state
  const [userSearchText, setUserSearchText] = React.useState('');
  
  // Credit/Debit Modals
  const [adjustingUser, setAdjustingUser] = React.useState<UserProfile | null>(null);
  const [adjustMode, setAdjustMode] = React.useState<'credit' | 'debit' | null>(null);
  const [adjustAmount, setAdjustAmount] = React.useState('');
  const [adjustReason, setAdjustReason] = React.useState('');
  const [isUpdatingBalance, setIsUpdatingBalance] = React.useState(false);

  // Add Plan state
  const [planNetwork, setPlanNetwork] = React.useState<NetworkType>('MTN');
  const [planType, setPlanType] = React.useState<'data' | 'airtime'>('data');
  const [planName, setPlanName] = React.useState('');
  const [planPrice, setPlanPrice] = React.useState('');
  const [planResellerPrice, setPlanResellerPrice] = React.useState('');
  const [planAgentPrice, setPlanAgentPrice] = React.useState('');
  const [planDuration, setPlanDuration] = React.useState('30 Days');
  const [planPeyflexId, setPlanPeyflexId] = React.useState('');
  const [isAddingPlan, setIsAddingPlan] = React.useState(false);

  // Edit Plan state
  const [editingPlan, setEditingPlan] = React.useState<ServicePlan | null>(null);
  const [editPlanNetwork, setEditPlanNetwork] = React.useState<NetworkType>('MTN');
  const [editPlanType, setEditPlanType] = React.useState<'data' | 'airtime'>('data');
  const [editPlanName, setEditPlanName] = React.useState('');
  const [editPlanPrice, setEditPlanPrice] = React.useState('');
  const [editPlanResellerPrice, setEditPlanResellerPrice] = React.useState('');
  const [editPlanAgentPrice, setEditPlanAgentPrice] = React.useState('');
  const [editPlanDuration, setEditPlanDuration] = React.useState('');
  const [editPlanPeyflexId, setEditPlanPeyflexId] = React.useState('');
  const [isUpdatingPlan, setIsUpdatingPlan] = React.useState(false);

  // Plans list filtering state
  const [adminSubTab, setAdminSubTab] = React.useState<'overview' | 'service-plans' | 'opay-receipts'>('overview');
  const [opayRevenueStats, setOpayRevenueStats] = React.useState<any>(null);
  const [loadingOpayStats, setLoadingOpayStats] = React.useState(false);
  const [planSearchQuery, setPlanSearchQuery] = React.useState('');
  const [planFilterNetwork, setPlanFilterNetwork] = React.useState<string>('All');
  const [planFilterType, setPlanFilterType] = React.useState<string>('All');

  // Broadcast state
  const [broadcastText, setBroadcastText] = React.useState('');
  const [isPublishingBroadcast, setIsPublishingBroadcast] = React.useState(false);

  // Peyflex Sync States
  const [peyflexProducts, setPeyflexProducts] = React.useState<any[]>([]);
  const [isFetchingPeyflex, setIsFetchingPeyflex] = React.useState(false);
  const [isPublishingPeyflex, setIsPublishingPeyflex] = React.useState(false);
  const [peyflexFilterCategory, setPeyflexFilterCategory] = React.useState<'all' | 'data' | 'electricity' | 'cable'>('all');
  const [peyflexSearchQuery, setPeyflexSearchQuery] = React.useState('');
  const [inventoryCategoryTab, setInventoryCategoryTab] = React.useState<'all' | 'data' | 'cable' | 'electricity'>('all');

  const fetchPeyflexRates = async () => {
    setIsFetchingPeyflex(true);
    try {
      const response = await fetch('/api/admin/fetch-peyflex-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'ibrahimfaruqolamilekan4@gmail.com' })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setPeyflexProducts(data.products || []);
        toast.success(`Successfully fetched ${data.products?.length || 0} product variations from Peyflex!`);
      } else {
        throw new Error(data.error || 'Failed to fetch items');
      }
    } catch (err: any) {
      toast.error(`Peyflex Sync Error: ${err.message}`);
    } finally {
      setIsFetchingPeyflex(false);
    }
  };

  const handleUpdateDraftPrice = (variationId: string, newPrice: number) => {
    setPeyflexProducts(prev => prev.map(p => {
      if (p.peyflex_variation_id === variationId) {
        return {
          ...p,
          retail_price: newPrice,
          price: newPrice
        };
      }
      return p;
    }));
  };

  const handlePublishPeyflexPlans = async () => {
    if (peyflexProducts.length === 0) {
      toast.error("Please fetch plans first before publishing.");
      return;
    }
    setIsPublishingPeyflex(true);
    try {
      // 1. Direct secure Firestore batch write
      const batch = writeBatch(db);
      
      peyflexProducts.forEach((plan) => {
        const colName = plan.type === "data" ? "data_plans" : (plan.type === "exam" || plan.type === "education" ? "exam_plans" : "utility_plans");
        const uniqueId = plan.peyflex_variation_id || plan.peyflex_id || plan.id || `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const docRef = doc(db, colName, uniqueId);
        
        const retailVal = Number(plan.retail_price || plan.price || 0);

        // Derive plan_category correctly with clean fallback rules
        const pt = String(plan.planType || plan.plan_category || '').toUpperCase();
        const pNameUpper = String(plan.name || plan.plan_name || '').toUpperCase();
        let planCategory = "GIFTING"; // default fallback for data plans
        if (pt.includes("SME") || pNameUpper.includes("SME")) {
          planCategory = "SME";
        } else if (pt.includes("CG") || pt.includes("CORPORATE") || pNameUpper.includes("CG") || pNameUpper.includes("CORPORATE")) {
          planCategory = "CG";
        } else if (pt.includes("GIFTING") || pt.includes("AWOOF") || pt.includes("DIRECT") || pt.includes("GIFT") || pNameUpper.includes("GIFTING") || pNameUpper.includes("AWOOF") || pNameUpper.includes("DIRECT") || pNameUpper.includes("GIFT")) {
          planCategory = "GIFTING";
        } else {
          planCategory = plan.planType || plan.plan_category || "GIFTING";
        }

        const rawNet = String(plan.network || plan.network_type || 'MTN').trim().toUpperCase();
        let finalNet = "MTN";
        if (rawNet.includes("AIRTEL")) {
          finalNet = "AIRTEL";
        } else if (rawNet.includes("GLO")) {
          finalNet = "GLO";
        } else if (rawNet.includes("9MOBILE") || rawNet.includes("9MOB")) {
          finalNet = "9MOBILE";
        } else {
          finalNet = rawNet; // Keep original (like GOTV, EKEDC, WAEC) if not a major telco
        }

        const docData = {
          id: uniqueId,
          network_type: finalNet.toUpperCase(),
          plan_category: planCategory.toUpperCase(),
          plan_name: String(plan.name || plan.plan_name || '').trim(),
          retail_price: Number(retailVal),
          validity_days: plan.duration || plan.validity_days || '30 Days',
          peyflex_id: plan.peyflex_variation_id || plan.peyflex_id || uniqueId,

          // legacy & compatibility fields to ensure zero regression
          network: finalNet.toUpperCase(),
          type: plan.type || 'data',
          name: String(plan.name || plan.plan_name || '').trim(),
          price: Number(retailVal),
          resellerPrice: plan.resellerPrice ? Number(plan.resellerPrice) : Math.round(retailVal * 0.98),
          agentPrice: plan.agentPrice ? Number(plan.agentPrice) : Math.round(retailVal * 0.99),
          duration: plan.duration || plan.validity_days || '30 Days',
          peyflex_variation_id: plan.peyflex_variation_id || plan.peyflex_id || uniqueId,
          apiPlanId: plan.peyflex_variation_id || plan.peyflex_id || uniqueId,
          planType: planCategory.toUpperCase(),
          wholesaleCost: Number(plan.wholesaleCost || 0),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          updatedAt: new Date().toISOString()
        };
        
        batch.set(docRef, docData, { merge: true });
      });

      await batch.commit();

      // Trigger the backend end-point secondary backup mirror log sync
      try {
        await fetch('/api/admin/publish-peyflex-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            triggeredBy: 'ibrahimfaruqolamilekan4@gmail.com',
            plans: peyflexProducts
          })
        });
      } catch (beErr) {
        console.warn("Backend backup log sync issue (already direct published to firestore): ", beErr);
      }

      toast.success("Successfully synchronized and published all plans to Firestore with 7-day lifespans!");
    } catch (err: any) {
      toast.error(`Publish Error: ${err.message}`);
    } finally {
      setIsPublishingPeyflex(false);
    }
  };

  // API config state
  const [providerUrl, setProviderUrl] = React.useState('https://vtu-provider-a.com/api/v1');
  const [providerKey, setProviderKey] = React.useState('******************_vtu_p_a');

  React.useEffect(() => {
    // 1. Fetch Users
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      const userList: UserProfile[] = [];
      snapshot.forEach(doc => {
        userList.push({ uid: doc.id, ...doc.data() } as any);
      });
      setUsers(userList);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    // 2. Fetch System Transactions
    const unsubTx = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(150)), (snapshot) => {
      const txList: Transaction[] = [];
      snapshot.forEach(doc => {
        txList.push({ id: doc.id, ...doc.data() } as any);
      });
      setAllTransactions(txList);
    });

    // 3. Fetch Service Plans: real-time streams for data_plans, utility_plans, and exam_plans
    console.log("Attempting to connect to Firestore collections: data_plans, utility_plans, exam_plans...");
    let fallbackPlansLoaded = false;

    const fetchBackupPlans = async () => {
      try {
        const response = await fetch('/api/plans');
        if (response.ok) {
          const plansList = await response.json();
          if (Array.isArray(plansList) && plansList.length > 0) {
            console.log("Admin: Successfully loaded offline plans via fallback API /api/plans:", plansList);
            const mapped = plansList.map((p: any) => {
              const pName = p.plan_name || p.name || p.planName || `${p.network_type || p.network || 'MTN'} Dynamic Plan`;
              const pPrice = Number(p.retail_price || p.price || p.amount || 0);
              const pNetwork = p.network_type || p.network || 'MTN';
              const pType = p.type || 'data';
              const pVarId = p.peyflex_variation_id || p.peyflex_id || p.apiPlanId || p.id;

              return {
                id: p.id,
                ...p,
                name: pName,
                plan_name: pName,
                planName: pName,
                price: pPrice,
                retail_price: pPrice,
                amount: pPrice,
                network: pNetwork,
                network_type: pNetwork,
                type: pType,
                peyflex_variation_id: pVarId,
                peyflex_id: pVarId,
                apiPlanId: pVarId
              };
            });
            setDataPlansList(mapped);
            fallbackPlansLoaded = true;
          }
        }
      } catch (err) {
        console.warn("Admin: Could not load fallback plans from API:", err);
      }
    };

    fetchBackupPlans();

    // Listener A: Internet Data Plans
    const unsubPlans = onSnapshot(collection(db, 'data_plans'), (snapshot) => {
      if (snapshot.empty) {
        if (!fallbackPlansLoaded) setDataPlansList([]);
      } else {
        const list: any[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          const pName = data.plan_name || data.name || data.planName || `${data.network_type || data.network || 'MTN'} Plan`;
          const pPrice = Number(data.retail_price || data.price || 0);
          const pNetwork = data.network_type || data.network || 'MTN';
          list.push({
            id: doc.id,
            ...data,
            name: pName,
            plan_name: pName,
            price: pPrice,
            retail_price: pPrice,
            network: pNetwork,
            network_type: pNetwork,
            type: data.type || 'data'
          });
        });
        setDataPlansList(list);
      }
    }, (error) => {
      console.error("Firestore data_plans stream failed:", error);
    });

    // Listener B: Utility / Electricity Plans
    const unsubUtils = onSnapshot(collection(db, 'utility_plans'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const pName = data.plan_name || data.name || data.planName || 'Utility Option';
        const pPrice = Number(data.retail_price || data.price || 0);
        list.push({
          id: doc.id,
          ...data,
          name: pName,
          plan_name: pName,
          price: pPrice,
          retail_price: pPrice,
          network: data.network || data.network_type || 'Utility',
          network_type: data.network || data.network_type || 'Utility',
          type: data.type || 'utility'
        });
      });
      setUtilityPlansList(list);
    }, (error) => {
      console.error("Firestore utility_plans stream failed:", error);
    });

    // Listener C: Exam / Education Plans
    const unsubExams = onSnapshot(collection(db, 'exam_plans'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const pName = data.plan_name || data.name || data.planName || 'Exam Option';
        const pPrice = Number(data.retail_price || data.price || 0);
        list.push({
          id: doc.id,
          ...data,
          name: pName,
          plan_name: pName,
          price: pPrice,
          retail_price: pPrice,
          network: data.network || data.network_type || 'Exam',
          network_type: data.network || data.network_type || 'Exam',
          type: data.type || 'exam'
        });
      });
      setExamPlansList(list);
    }, (error) => {
      console.error("Firestore exam_plans stream failed:", error);
    });

    return () => {
      unsubUsers();
      unsubTx();
      unsubPlans();
      unsubUtils();
      unsubExams();
    };
  }, []);

  const fetchOpayRevenueStats = async () => {
    setLoadingOpayStats(true);
    try {
      const res = await fetch('/api/admin/opay-revenue');
      if (res.ok) {
        const data = await res.json();
        setOpayRevenueStats(data);
      }
    } catch (err) {
      console.error("Error fetching OPy revenue stats:", err);
    } finally {
      setLoadingOpayStats(false);
    }
  };

  React.useEffect(() => {
    if (adminSubTab === 'opay-receipts') {
      fetchOpayRevenueStats();
    }
  }, [adminSubTab]);

  // Filter users
  const filteredUsers = users.filter(u => 
    u.fullName?.toLowerCase().includes(userSearchText.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearchText.toLowerCase()) ||
    u.phoneNumber?.includes(userSearchText)
  );

  // Filter service plans
  const filteredPlans = servicePlansList.filter(plan => {
    const matchesSearch = !planSearchQuery.trim() || 
      plan.name?.toLowerCase().includes(planSearchQuery.toLowerCase()) ||
      plan.network?.toLowerCase().includes(planSearchQuery.toLowerCase());
    const matchesNetwork = planFilterNetwork === 'All' || String(plan.network || plan.network_type || '').toLowerCase() === planFilterNetwork.toLowerCase();
    const matchesType = planFilterType === 'All' || String(plan.type || '').toLowerCase() === planFilterType.toLowerCase();
    return matchesSearch && matchesNetwork && matchesType;
  });

  // Stats Analytics derived state
  const totalBalanceReserves = users.reduce((sum, u) => sum + (u.balance || 0), 0);
  const totalTransactionsVolume = allTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  // Estimate profits as 4% of service recharges
  const estimatedPlatformProfits = allTransactions
    .filter(tx => tx.type === 'data' || tx.type === 'airtime' || tx.type === 'bill')
    .reduce((sum, tx) => sum + (tx.amount * 0.04), 0);

  // Credit/Debit handler
  const handleBalanceAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingUser || !adjustAmount || Number(adjustAmount) <= 0) {
      toast.error("Please enter a valid transfer amount");
      return;
    }

    setIsUpdatingBalance(true);
    try {
      const userRef = doc(db, 'users', adjustingUser.uid);
      const val = Number(adjustAmount);
      const adjustment = adjustMode === 'credit' ? val : -val;

      // Update User balance
      await updateDoc(userRef, {
        balance: increment(adjustment)
      });

      // Write transaction history logs
      await addDoc(collection(db, 'transactions'), {
        userId: adjustingUser.uid,
        type: 'funding',
        amount: adjustMode === 'credit' ? val : -val,
        status: 'completed',
        description: adjustReason.trim() || `Admin balance adjustment: ${adjustMode === 'credit' ? 'Wallet Funded' : 'Wallet Debited'}`,
        reference: `ADJ-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        createdAt: serverTimestamp()
      });

      toast.success(`Successfully ${adjustMode}ed ${adjustingUser.fullName} with ${formatCurrency(val)}`);
      setAdjustingUser(null);
      setAdjustAmount('');
      setAdjustReason('');
    } catch (err: any) {
      toast.error(`Operation failed: ${err.message}`);
    } finally {
      setIsUpdatingBalance(false);
    }
  };

  // Create service plan
  const handleAddPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim() || !planPrice || Number(planPrice) <= 0) {
      toast.error("Please enter a valid plan name and positive price index");
      return;
    }

    setIsAddingPlan(true);
    try {
      const priceNum = Number(planPrice);
      const resellerVal = planResellerPrice ? Number(planResellerPrice) : null;
      const agentVal = planAgentPrice ? Number(planAgentPrice) : null;
      const validityDaysVal = planType === 'data' ? planDuration : '30 Days';
      const peyflexIdVal = planPeyflexId.trim() || `plan_${Date.now()}`;

      // Call our robust backend API first so local DB and Firestore are perfectly in sync with admin privileges
      const response = await fetch('/api/admin/create-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggeredBy: 'ibrahimfaruqolamilekan4@gmail.com',
          network: planNetwork.toUpperCase(),
          type: planType,
          name: planName.trim(),
          price: priceNum,
          resellerPrice: resellerVal,
          agentPrice: agentVal,
          duration: validityDaysVal,
          peyflex_variation_id: peyflexIdVal
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server rejected request');
      }

      // Proactively try client-side direct write if permissions allow
      try {
        const nameUpper = planName.toUpperCase();
        let planCategory = "GIFTING";
        if (nameUpper.includes("SME")) {
          planCategory = "SME";
        } else if (nameUpper.includes("CG") || nameUpper.includes("CORPORATE")) {
          planCategory = "CG";
        }

        await addDoc(collection(db, 'data_plans'), {
          network_type: planNetwork.toUpperCase(),
          plan_category: planCategory,
          plan_name: planName.trim(),
          retail_price: priceNum,
          validity_days: validityDaysVal,
          peyflex_id: peyflexIdVal,
          network: planNetwork.toUpperCase(),
          type: planType,
          name: planName.trim(),
          price: priceNum,
          resellerPrice: resellerVal,
          agentPrice: agentVal,
          duration: validityDaysVal,
          peyflex_variation_id: peyflexIdVal,
          apiPlanId: peyflexIdVal,
          planType: planCategory,
          createdAt: new Date().toISOString()
        });
      } catch (fsErr) {
        console.warn("Client-side direct write ignored (backend successfully updated):", fsErr);
      }

      toast.success("New product code registered successfully!");
      setPlanName('');
      setPlanPrice('');
      setPlanResellerPrice('');
      setPlanAgentPrice('');
      setPlanPeyflexId('');
    } catch (err: any) {
      toast.error(`Failed to register plan: ${err.message}`);
    } finally {
      setIsAddingPlan(false);
    }
  };

  // Inline editing states for active inventory plans
  const [liveDraftPrices, setLiveDraftPrices] = React.useState<Record<string, { price: string, resellerPrice: string, agentPrice: string }>>({});

  const handleUpdateLiveDraft = (planId: string, field: 'price' | 'resellerPrice' | 'agentPrice', value: string) => {
    setLiveDraftPrices(prev => ({
      ...prev,
      [planId]: {
        ...(prev[planId] || {
          price: String(servicePlansList.find(x => x.id === planId)?.price || 0),
          resellerPrice: String(servicePlansList.find(x => x.id === planId)?.resellerPrice || ''),
          agentPrice: String(servicePlansList.find(x => x.id === planId)?.agentPrice || '')
        }),
        [field]: value
      }
    }));
  };

  const handleSaveSinglePlan = async (plan: any) => {
    const drafts = liveDraftPrices[plan.id] || {
      price: String(plan.price || plan.retail_price || 0),
      resellerPrice: String(plan.resellerPrice !== null && plan.resellerPrice !== undefined ? plan.resellerPrice : ''),
      agentPrice: String(plan.agentPrice !== null && plan.agentPrice !== undefined ? plan.agentPrice : '')
    };

    const newPrice = Number(drafts.price);
    const resellerVal = drafts.resellerPrice ? Number(drafts.resellerPrice) : null;
    const agentVal = drafts.agentPrice ? Number(drafts.agentPrice) : null;

    if (isNaN(newPrice) || newPrice <= 0) {
      toast.error("Please provide a valid retail price.");
      return;
    }

    try {
      const response = await fetch('/api/admin/edit-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggeredBy: 'ibrahimfaruqolamilekan4@gmail.com',
          id: plan.id,
          network: (plan.network_type || plan.network || 'MTN').toUpperCase(),
          type: plan.type || 'data',
          name: (plan.plan_name || plan.name || '').trim(),
          price: newPrice,
          resellerPrice: resellerVal,
          agentPrice: agentVal,
          duration: plan.validity_days || plan.duration || '30 Days',
          peyflex_variation_id: plan.peyflex_variation_id || plan.peyflex_id || plan.id,
          collectionName: plan.collectionName || 'data_plans'
        })
      });

      if (!response.ok) {
        const errObj = await response.json().catch(() => ({}));
        throw new Error(errObj.error || "Server rejected update");
      }

      // Proactively handle direct direct-write
      try {
        const planRef = doc(db, plan.collectionName || 'data_plans', plan.id);
        await updateDoc(planRef, {
          price: newPrice,
          retail_price: newPrice,
          resellerPrice: resellerVal,
          agentPrice: agentVal,
          updatedAt: serverTimestamp()
        });
      } catch (fsErr) {
        console.warn("Direct direct-write ignore:", fsErr);
      }

      toast.success(`Successfully saved prices for ${plan.name}!`);
    } catch (err: any) {
      toast.error(`Error updating plan price: ${err.message}`);
    }
  };

  // Delete service plan directly from Firestore
  const handleDeletePlan = async (id: string, collectionName: string = 'data_plans') => {
    if (!confirm("Are you sure you want to remove this service code?")) return;
    try {
      const response = await fetch('/api/admin/delete-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggeredBy: 'ibrahimfaruqolamilekan4@gmail.com',
          id,
          collectionName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server rejected delete request');
      }

      try {
        await deleteDoc(doc(db, collectionName, id));
      } catch (fsErr) {
        console.warn("Client-side delete ignore (backend successfully updated):", fsErr);
      }

      toast.success("Service code dissolved successfully.");
    } catch (err: any) {
      toast.error(`Failed to delete service plan: ${err.message}`);
    }
  };

  // Start plan edit mode
  const startEditPlan = (plan: ServicePlan) => {
    setEditingPlan(plan);
    setEditPlanNetwork((plan.network_type || plan.network || 'MTN') as NetworkType);
    setEditPlanType(plan.type || 'data');
    setEditPlanName(plan.plan_name || plan.name || '');
    setEditPlanPrice(String(plan.retail_price || plan.price || 0));
    setEditPlanResellerPrice(plan.resellerPrice ? String(plan.resellerPrice) : '');
    setEditPlanAgentPrice(plan.agentPrice ? String(plan.agentPrice) : '');
    setEditPlanDuration(plan.validity_days || plan.duration || plan.validity || '30 Days');
    setEditPlanPeyflexId(plan.peyflex_id || plan.peyflex_variation_id || plan.apiPlanId || plan.id || '');
  };

  // Submit plan edited content
  const handleEditPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    if (!editPlanName.trim() || !editPlanPrice || Number(editPlanPrice) <= 0) {
      toast.error("Please enter a valid plan name and positive price index");
      return;
    }

    setIsUpdatingPlan(true);
    try {
      const planId = editingPlan.id;
      const newPrice = Number(editPlanPrice);
      const resellerVal = editPlanResellerPrice ? Number(editPlanResellerPrice) : null;
      const agentVal = editPlanAgentPrice ? Number(editPlanAgentPrice) : null;
      const durationVal = editPlanType === 'data' ? editPlanDuration : '30 Days';
      const peyflexIdVal = editPlanPeyflexId.trim() || editingPlan.peyflex_id || editingPlan.peyflex_variation_id || editingPlan.id;

      // Submit to backend edit endpoint
      const response = await fetch('/api/admin/edit-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggeredBy: 'ibrahimfaruqolamilekan4@gmail.com',
          id: planId,
          network: editPlanNetwork.toUpperCase(),
          type: editPlanType,
          name: editPlanName.trim(),
          price: newPrice,
          resellerPrice: resellerVal,
          agentPrice: agentVal,
          duration: durationVal,
          peyflex_variation_id: peyflexIdVal
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server rejected edit request');
      }

      try {
        const nameUpper = editPlanName.toUpperCase();
        let planCategory = "GIFTING";
        if (nameUpper.includes("SME")) {
          planCategory = "SME";
        } else if (nameUpper.includes("CG") || nameUpper.includes("CORPORATE")) {
          planCategory = "CG";
        }

        const planRef = doc(db, 'data_plans', planId);
        await updateDoc(planRef, {
          network_type: editPlanNetwork.toUpperCase(),
          plan_category: planCategory,
          plan_name: editPlanName.trim(),
          retail_price: newPrice,
          validity_days: durationVal,
          peyflex_id: peyflexIdVal,
          network: editPlanNetwork.toUpperCase(),
          type: editPlanType,
          name: editPlanName.trim(),
          price: newPrice,
          resellerPrice: resellerVal,
          agentPrice: agentVal,
          duration: durationVal,
          peyflex_variation_id: peyflexIdVal,
          apiPlanId: peyflexIdVal,
          planType: planCategory
        });
      } catch (fsErr) {
        console.warn("Client-side edit write ignored (backend successfully updated):", fsErr);
      }

      toast.success("Service plan updated successfully!");
      setEditingPlan(null);
    } catch (err: any) {
      toast.error(`Failed to update plan: ${err.message}`);
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  // Push news banner announcement
  const handlePublishBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) {
      toast.error("Cannot broadcast empty notification text");
      return;
    }

    setIsPublishingBroadcast(true);
    try {
      // Save systemic announcements
      await addDoc(collection(db, 'broadcasts'), {
        message: broadcastText.trim(),
        isActive: true,
        createdAt: serverTimestamp()
      });

      // Simple localStorage simulation to let current session know
      localStorage.setItem('vtu_latest_announcement', broadcastText.trim());

      toast.success("Dynamic notification has been broadcast globally!");
      setBroadcastText('');
    } catch (err: any) {
      toast.error(`Broadcast failed: ${err.message}`);
    } finally {
      setIsPublishingBroadcast(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <Loader2 className="animate-spin mx-auto text-blue-600" size={40} />
        <p className="text-slate-400 font-bold font-sans">Connecting Admin Firestore Reserve Channels...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 font-sans pb-16">
      
      {/* 1. ADMIN HEADINGS */}
      <div className="flex justify-between items-center bg-white p-6 border border-slate-100 rounded-3xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-800 text-lg">Platform Admin Control</h4>
            <p className="text-xs text-slate-400 font-semibold font-sans uppercase">Continuous Whitelisted Bypass Mode</p>
          </div>
        </div>
        <span className="text-xs bg-green-50 text-green-700 font-extrabold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-green-150">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" /> Connection secure
        </span>
      </div>

      {/* 2. SUMMARY COUNTERS PANELS */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100/90 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-405 tracking-wider font-sans block">Total Registred Users</span>
          <div className="flex items-baseline justify-between mt-2.5">
            <span className="text-3xl font-black text-slate-800 tracking-tight">{users.length}</span>
            <Users className="text-slate-200" size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100/90 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-405 tracking-wider font-sans block">Balance Reserves Pool</span>
          <div className="flex items-baseline justify-between mt-2.5">
            <span className="text-2xl font-black text-slate-800 font-mono tracking-tight">{formatCurrency(totalBalanceReserves)}</span>
            <DollarSign className="text-slate-200" size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100/90 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-405 tracking-wider font-sans block">Processed Outflow</span>
          <div className="flex items-baseline justify-between mt-2.5">
            <span className="text-2xl font-black text-indigo-600 font-mono tracking-tight">{formatCurrency(totalTransactionsVolume)}</span>
            <TrendingUp className="text-slate-200" size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100/90 shadow-sm bg-gradient-to-br from-indigo-50/20 to-blue-50/20">
          <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider font-sans block">Est. Platform Profit (4%)</span>
          <div className="flex items-baseline justify-between mt-2.5">
            <span className="text-2xl font-black text-emerald-600 font-mono tracking-tight">{formatCurrency(estimatedPlatformProfits)}</span>
            <span className="text-xs font-black text-emerald-750 bg-emerald-50 px-2 py-0.5 rounded uppercase">Liquid</span>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl max-w-2xl select-none font-bold">
        <button
          type="button"
          onClick={() => setAdminSubTab('overview')}
          className={cn(
            "flex-1 py-3 text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center font-sans",
            adminSubTab === 'overview'
              ? "bg-white text-slate-900 shadow-md font-extrabold"
              : "text-slate-500 hover:text-slate-850"
          )}
        >
          Users & Operations
        </button>
        <button
          type="button"
          onClick={() => setAdminSubTab('service-plans')}
          className={cn(
            "flex-1 py-3 text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center font-sans",
            adminSubTab === 'service-plans'
              ? "bg-white text-slate-900 shadow-md font-extrabold"
              : "text-slate-500 hover:text-slate-850"
          )}
        >
          Service Plans Manager
        </button>
        <button
          type="button"
          onClick={() => setAdminSubTab('opay-receipts')}
          className={cn(
            "flex-1 py-3 text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center font-sans",
            adminSubTab === 'opay-receipts'
              ? "bg-white text-slate-900 shadow-md font-extrabold"
              : "text-slate-500 hover:text-slate-850"
          )}
        >
          Bank Deposits Audit
        </button>
      </div>

      {adminSubTab === 'overview' && (
        <>
          {/* CORE TWO BLOCK SECTOR: USER MANAGEMENT & UTILITIES */}
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* L-S: USER MANAGEMENT LOGICAL HUB */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h5 className="font-extrabold text-slate-900">User Wallet Registrar</h5>
                    <p className="text-xs text-slate-400 font-medium font-sans">Verify balances, credit, or debit platform users securely.</p>
                  </div>
                  
                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={userSearchText}
                      onChange={(e) => setUserSearchText(e.target.value)}
                      placeholder="Query by Name/Email..." 
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-600/30"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100 overflow-y-auto max-h-[460px]">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => (
                      <div key={u.uid} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="space-y-1 flex-1 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-800 leading-none">{u.fullName}</span>
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none",
                              u.role === 'admin' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                            )}>
                              {u.role}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-medium font-mono leading-none">{u.email}</p>
                          {u.phoneNumber && <p className="text-[10px] text-slate-500 font-sans font-semibold">Tel: {u.phoneNumber}</p>}
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-[9px] font-black uppercase text-slate-450 tracking-wider font-sans mb-0.5">Wallet Balance</p>
                            <p className="font-black text-sm text-slate-800 font-mono leading-none">{formatCurrency(u.balance || 0)}</p>
                          </div>

                          <div className="flex gap-1.5">
                            <button 
                              type="button"
                              onClick={() => { setAdjustingUser(u); setAdjustMode('credit'); }}
                              className="px-2.5 py-1.5 text-[11px] font-bold bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-all cursor-pointer"
                            >
                              Credit
                            </button>
                            <button 
                              type="button"
                              onClick={() => { setAdjustingUser(u); setAdjustMode('debit'); }}
                              className="px-2.5 py-1.5 text-[11px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-all cursor-pointer"
                            >
                              Debit
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-xs font-bold text-slate-400">No users found querying that keyword filter.</div>
                  )}
                </div>
              </div>
              
              <div className="p-4 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-450 text-center font-medium font-sans">
                Deducts or increments balances directly on transaction commit secure gates.
              </div>
            </div>

            {/* R-S: BROADCAST AND GATEWAY SIDEBAR CONTAINER */}
            <div className="space-y-6">
              {/* BROADCAST BOX */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                <div>
                  <h5 className="font-extrabold text-slate-900">Push Global Notification</h5>
                  <p className="text-xs text-slate-400 font-medium font-sans">Broadcast instant notice banners</p>
                </div>

                <form onSubmit={handlePublishBroadcast} className="space-y-3.5">
                  <textarea 
                    required
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    placeholder="Alert text, e.g. Temporary service warning notice."
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs font-medium focus:outline-none min-h-[90px] max-h-[140px]"
                  />

                  <button 
                    disabled={isPublishingBroadcast}
                    type="submit"
                    className="w-full bg-slate-900 hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {isPublishingBroadcast ? "Publishing..." : <><Send size={14} /> Send Broadcast</>}
                  </button>
                </form>
              </div>

              {/* API MANAGER GATEWAYS */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                <div>
                  <h5 className="font-extrabold text-slate-900">API Gateway Controller</h5>
                  <p className="text-xs text-slate-400 font-medium font-sans">Telecom API endpoints setting configuration</p>
                </div>

                <div className="space-y-3.5 text-xs font-bold text-slate-500">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block ml-1 font-sans">Provider url endpoint</span>
                    <input 
                      type="text" 
                      value={providerUrl} 
                      onChange={(e) => setProviderUrl(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-[11px] font-mono focus:outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block ml-1 font-sans">Provider authentication key</span>
                    <input 
                      type="text" 
                      value={providerKey} 
                      onChange={(e) => setProviderKey(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-[11px] font-mono focus:outline-none" 
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-green-50/50 border border-green-100 text-[10px] leading-relaxed text-slate-600 font-medium font-sans">
                    Connections automatically route in real-time. Changes write back safe-parameters.
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* LOWER LEVEL SECTION: SYSTEM TRANSACTION LOGS */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
            <div className="pb-6 border-b border-slate-50 mb-4">
              <h5 className="font-extrabold text-slate-900">System Transaction Logs</h5>
              <p className="text-xs text-slate-400 font-medium font-sans">Real-time dynamic monitoring logs for database audit trails.</p>
            </div>

            <div className="divide-y divide-slate-50 max-h-[350px] overflow-y-auto pr-2 space-y-1 flex flex-col">
              {allTransactions.length > 0 ? (
                allTransactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        tx.amount > 0 ? "bg-green-55 text-green-600 bg-green-50" : "bg-red-50 text-red-600"
                      )}>
                        {tx.amount > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{tx.description}</p>
                        <p className="font-mono text-[9px] text-slate-400 leading-none">ID: {tx.reference}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className={cn("font-bold text-xs font-mono", tx.amount > 0 ? "text-green-600" : "text-slate-900")}>
                        {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                      </p>
                      <p className="text-[8px] uppercase tracking-wider font-extrabold text-slate-400 font-sans">
                        {tx.status || 'completed'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs font-bold bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">No operations executed in platform yet.</div>
              )}
            </div>
          </div>
        </>
      )}

      {adminSubTab === 'service-plans' && (
        /* DEDICATED SERVICE PLANS MANAGER SPLIT-SCREEN LAYOUT */
        <div className="space-y-6 pb-12">
          {/* Header Action Dashboard with Option C Neo-Brutalis styling */}
          <div className="bg-yellow-100 rounded-2xl border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-black animate-pulse"></span>
                <span className="text-[10px] uppercase font-black tracking-wider text-black font-sans">Option C Neo-Brutalism Design Panel</span>
              </div>
              <h4 className="font-extrabold text-2xl tracking-tight text-black mt-0.5 font-sans">Service Plans Manager & Custom Sync Engine</h4>
              <p className="text-xs text-black/80 font-bold max-w-2xl font-sans">
                Real-time synchronized control. Keep your published digital packages perfectly calibrated. 7-day physical lifespan rules apply automatically on database write transactions.
              </p>
            </div>

            {/* Quick manual registry access */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={fetchPeyflexRates}
                disabled={isFetchingPeyflex}
                className="bg-purple-400 hover:bg-purple-300 disabled:opacity-50 text-black border-2 border-black font-extrabold text-xs px-5 py-3 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-2 cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] font-sans"
              >
                {isFetchingPeyflex ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-black" />
                    Connecting Peyflex API Gate...
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} className="text-black" />
                    Fetch Fresh Peyflex Node
                  </>
                )}
              </button>

              {peyflexProducts.length > 0 && (
                <button
                  type="button"
                  onClick={handlePublishPeyflexPlans}
                  disabled={isPublishingPeyflex}
                  className="bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-black border-2 border-black font-extrabold text-xs px-5 py-3 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-2 cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] font-sans"
                >
                  {isPublishingPeyflex ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-black" />
                      Saving Transactions...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} className="text-black" />
                      Save & Publish Staged Plans
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* SPLIT SCREEN LAYOUT CONFIG */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
            
            {/* COLUMN A: Active Published Inventory */}
            <div className="bg-white rounded-2xl border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] space-y-6">
              <div className="border-b-2 border-black pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                <div>
                  <h5 className="font-extrabold text-lg text-black font-sans uppercase tracking-tight">
                    🔥 Column A: Active Published Inventory (Old Pop Up)
                  </h5>
                  <p className="text-[11px] text-slate-500 font-bold font-sans">
                    Physical records stored in Firestore. Expired lifetimes are automatically filtered.
                  </p>
                </div>
                <div className="bg-slate-101 bg-slate-100 border border-black/20 px-2.5 py-1 rounded text-[10px] font-mono font-bold text-slate-700 font-sans">
                  {servicePlansList.filter(p => {
                    const isExpired = p.expiresAt ? (p.expiresAt.seconds ? new Date(p.expiresAt.seconds * 1000) < new Date() : new Date(p.expiresAt) < new Date()) : false;
                    return !isExpired;
                  }).length} Live Codes
                </div>
              </div>

              {/* Dynamic Categorization Selector Tabs - Column A */}
              <div className="flex flex-wrap gap-1.5 text-left">
                {([
                  { id: 'all', label: 'All Services (All)' },
                  { id: 'data', label: 'Internet Data (SME/CG/Gifting)' },
                  { id: 'cable', label: 'Cable TV Plan (DSTV/GOTV)' },
                  { id: 'electricity', label: 'Disco Electric (Pre/Postpaid)' }
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInventoryCategoryTab(tab.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-extrabold border-2 border-black transition-all cursor-pointer font-sans",
                      inventoryCategoryTab === tab.id
                        ? "bg-black text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        : "bg-slate-50 hover:bg-slate-100 text-black shadow-none"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Column A Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search live collections by variation code or prefix..."
                  value={planSearchQuery}
                  onChange={(e) => setPlanSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 border-2 border-slate-800 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:ring-0 focus:border-black placeholder-slate-400 font-sans"
                />
              </div>

              {/* Column A Plan List */}
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {(() => {
                  const getDisplayCategory = (plan: any) => {
                    const colName = plan.collectionName || '';
                    if (colName === 'data_plans' || plan.type === 'data') return 'data';
                    if (colName === 'exam_plans') return 'exam';
                    const nameUpper = String(plan.plan_name || plan.name || '').toUpperCase();
                    if (nameUpper.includes('DSTV') || nameUpper.includes('GOTV') || nameUpper.includes('STARTIMES') || nameUpper.includes('STARTIME') || plan.type === 'cable') {
                      return 'cable';
                    }
                    return 'electricity';
                  };

                  const isExpired = (plan: any) => {
                    if (!plan.expiresAt) return false;
                    let expiryDate: Date;
                    if (plan.expiresAt && plan.expiresAt.seconds) {
                      expiryDate = new Date(plan.expiresAt.seconds * 1000);
                    } else {
                      expiryDate = new Date(plan.expiresAt);
                    }
                    return expiryDate.getTime() < Date.now();
                  };

                  const getExpiryText = (plan: any) => {
                    if (!plan.expiresAt) return 'Permanent';
                    let expiryDate: Date;
                    if (plan.expiresAt && plan.expiresAt.seconds) {
                      expiryDate = new Date(plan.expiresAt.seconds * 1000);
                    } else {
                      expiryDate = new Date(plan.expiresAt);
                    }
                    const diffMs = expiryDate.getTime() - Date.now();
                    if (diffMs <= 0) return 'Expired';
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    if (diffDays > 0) return `${diffDays}d ${diffHours}h remaining`;
                    return `${diffHours} hours remaining`;
                  };

                  const filteredItems = servicePlansList.filter(plan => {
                    const displayCat = getDisplayCategory(plan);
                    const matchCategory = inventoryCategoryTab === 'all' || displayCat === inventoryCategoryTab;
                    const matchExpired = !isExpired(plan);
                    const matchSearch = !planSearchQuery.trim() ||
                      String(plan.name || plan.plan_name || '').toLowerCase().includes(planSearchQuery.toLowerCase()) ||
                      String(plan.peyflex_variation_id || plan.peyflex_id || '').toLowerCase().includes(planSearchQuery.toLowerCase());
                    return matchCategory && matchExpired && matchSearch;
                  });

                  if (filteredItems.length === 0) {
                    return (
                      <div className="py-12 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 font-sans">
                        No active inventory corresponds with the filters.
                      </div>
                    );
                  }

                  return filteredItems.map((plan) => {
                    const pevId = plan.peyflex_variation_id || plan.peyflex_id || plan.id;
                    const drafts = liveDraftPrices[plan.id] || {
                      price: String(plan.price || plan.retail_price || 0),
                      resellerPrice: plan.resellerPrice !== null && plan.resellerPrice !== undefined ? String(plan.resellerPrice) : '',
                      agentPrice: plan.agentPrice !== null && plan.agentPrice !== undefined ? String(plan.agentPrice) : ''
                    };

                    return (
                      <div key={plan.id} className="bg-slate-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all space-y-3 text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 font-sans">
                              <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded leading-none bg-black text-white">
                                {String(plan.network || plan.network_type || 'MTN').toUpperCase()}
                              </span>
                              <span className="text-[8px] bg-indigo-100 text-indigo-900 border border-indigo-200 font-extrabold px-1.5 py-0.5 rounded leading-none uppercase">
                                {plan.collectionName === 'data_plans' ? 'INTERNET' : plan.collectionName === 'utility_plans' ? 'UTILITY SERVICE' : 'EDUCATION'}
                              </span>
                              <span className="text-[8px] bg-purple-100 text-purple-900 border border-purple-200 font-bold px-1.5 py-0.5 rounded leading-none">
                                ⌛ {getExpiryText(plan)}
                              </span>
                            </div>
                            <h6 className="font-extrabold text-slate-900 text-sm tracking-tight pt-1 leading-snug">{plan.name}</h6>
                            <p className="text-[10px] text-slate-504 font-mono leading-none">Peyflex: {pevId}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeletePlan(plan.id, plan.collectionName || 'data_plans')}
                            className="bg-rose-100 hover:bg-rose-200 text-rose-700 p-2 rounded-xl border border-rose-300 transition-all cursor-pointer hover:scale-105"
                            title="Delete this service code immediately"
                          >
                            <Trash2 size={13} className="text-rose-700" />
                          </button>
                        </div>

                        {/* Direct One-By-One Input Forms with Premium Border Alignments */}
                        <div className="pt-2 border-t border-slate-200/80 grid grid-cols-3 gap-2">
                          <div className="space-y-1 text-left font-sans">
                            <span className="text-[8px] font-bold text-slate-400 block uppercase pl-1">Retail (₦)</span>
                            <input
                              type="number"
                              value={drafts.price}
                              onChange={(e) => handleUpdateLiveDraft(plan.id, 'price', e.target.value)}
                              className="w-full bg-white border border-slate-800 text-black font-semibold text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-black text-center font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1 text-left font-sans">
                            <span className="text-[8px] font-bold text-indigo-505 block uppercase pl-1">Reseller (₦)</span>
                            <input
                              type="number"
                              value={drafts.resellerPrice}
                              placeholder="Default"
                              onChange={(e) => handleUpdateLiveDraft(plan.id, 'resellerPrice', e.target.value)}
                              className="w-full bg-white border border-slate-800 text-slate-800 font-semibold text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500 text-center font-mono"
                            />
                          </div>
                          <div className="space-y-1 text-left font-sans">
                            <span className="text-[8px] font-bold text-emerald-505 block uppercase pl-1">Agent (₦)</span>
                            <input
                              type="number"
                              value={drafts.agentPrice}
                              placeholder="Default"
                              onChange={(e) => handleUpdateLiveDraft(plan.id, 'agentPrice', e.target.value)}
                              className="w-full bg-white border border-slate-800 text-emerald-700 font-semibold text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 text-center font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="text-[9px] text-slate-405 font-mono">
                            {plan.duration ? `Validity: ${plan.duration}` : ''}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSaveSinglePlan(plan)}
                            className="bg-black hover:bg-slate-850 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg border border-black hover:scale-102 transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm font-sans"
                          >
                            <ShieldCheck size={11} className="text-white" /> Save Price
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* COLUMN B: Peyflex Discovered Sync */}
            <div className="bg-white rounded-2xl border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] space-y-6">
              <div className="border-b-2 border-black pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                <div>
                  <h5 className="font-extrabold text-lg text-black font-sans uppercase tracking-tight">
                    ⚡ Column B: Peyflex Discovered Sync (New Pop Up)
                  </h5>
                  <p className="text-[11px] text-slate-500 font-bold font-sans">
                    Live products indexed from physical Peyflex nodes. Adjust prices before saving.
                  </p>
                </div>
                <div className="bg-purple-100 border border-purple-300 text-purple-950 px-2.5 py-1 rounded text-[10px] font-mono font-extrabold font-sans">
                  {peyflexProducts.length} Staged Variations
                </div>
              </div>

              {peyflexProducts.length > 0 ? (
                <div className="space-y-5">
                  {/* BULK MARKUP MULTI-SINK CONTROLS */}
                  <div className="bg-amber-50 border-2 border-black p-3.5 rounded-xl space-y-2 text-left">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 font-sans">⚡ Auto-Markup Utilities Matrix</span>
                    </div>
                    <p className="text-[10px] text-amber-955 font-sans font-medium">Click to instantly apply markup to all freshly loaded Peyflex drafts:</p>
                    <div className="flex flex-wrap items-center gap-1.5 font-sans">
                      <button
                        type="button"
                        onClick={() => {
                          setPeyflexProducts(prev => prev.map(p => ({
                            ...p,
                            retail_price: Math.round(p.wholesaleCost * 1.03),
                            price: Math.round(p.wholesaleCost * 1.03)
                          })));
                          toast.success("Applied Cost + 3% bulk markup draft!");
                        }}
                        className="bg-white hover:bg-slate-100 text-black border border-black font-bold text-[9px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer active:scale-95 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] font-sans"
                      >
                        Cost + 3%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPeyflexProducts(prev => prev.map(p => ({
                            ...p,
                            retail_price: Math.round(p.wholesaleCost * 1.05),
                            price: Math.round(p.wholesaleCost * 1.05)
                          })));
                          toast.success("Applied Cost + 5% bulk markup draft!");
                        }}
                        className="bg-white hover:bg-slate-100 text-black border border-black font-bold text-[9px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer active:scale-95 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] font-sans"
                      >
                        Cost + 5%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPeyflexProducts(prev => prev.map(p => ({
                            ...p,
                            retail_price: Math.round(p.wholesaleCost * 1.10),
                            price: Math.round(p.wholesaleCost * 1.10)
                          })));
                          toast.success("Applied Cost + 10% bulk markup draft!");
                        }}
                        className="bg-white hover:bg-slate-100 text-black border border-black font-bold text-[9px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer active:scale-95 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] font-sans"
                      >
                        Cost + 10%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPeyflexProducts(prev => prev.map(p => ({
                            ...p,
                            retail_price: p.wholesaleCost + 100,
                            price: p.wholesaleCost + 100
                          })));
                          toast.success("Applied Cost + ₦100 flat markup draft!");
                        }}
                        className="bg-white hover:bg-slate-100 text-black border border-black font-bold text-[9px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer active:scale-95 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] font-sans"
                      >
                        Cost + ₦100 Flat
                      </button>
                    </div>
                  </div>

                  {/* Categorization Selection Tabs for Column B */}
                  <div className="flex flex-wrap gap-1.5 font-sans justify-start">
                    {([
                      { id: 'all', label: 'All Staged' },
                      { id: 'data', label: 'Internet Data' },
                      { id: 'cable', label: 'Cable TV Plans' },
                      { id: 'electricity', label: 'Electricity DisCos' }
                    ] as const).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPeyflexFilterCategory(tab.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-extrabold border-2 border-black transition-all cursor-pointer font-sans",
                          peyflexFilterCategory === tab.id
                            ? "bg-purple-950 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            : "bg-slate-50 hover:bg-slate-100 text-black shadow-none"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Staged Column Search field */}
                  <div>
                    <input
                      type="text"
                      placeholder="Filter staged results by key terms or variation codes..."
                      value={peyflexSearchQuery}
                      onChange={(e) => setPeyflexSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border-2 border-slate-800 rounded-xl p-3 text-xs font-semibold focus:outline-none placeholder-slate-400 font-sans"
                    />
                  </div>

                  {/* Staged Items Loop Grid */}
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {(() => {
                      const filteredStaged = peyflexProducts
                        .filter(p => peyflexFilterCategory === 'all' || p.type === peyflexFilterCategory)
                        .filter(p => !peyflexSearchQuery.trim() ||
                          String(p.name || '').toLowerCase().includes(peyflexSearchQuery.toLowerCase()) ||
                          String(p.peyflex_variation_id || p.peyflex_id || '').toLowerCase().includes(peyflexSearchQuery.toLowerCase())
                        );

                      if (filteredStaged.length === 0) {
                        return (
                          <div className="py-12 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 font-sans">
                            No staged Peyflex items match the selected category & search criteria.
                          </div>
                        );
                      }

                      return filteredStaged.map((item) => {
                        const pevId = item.peyflex_variation_id || item.peyflex_id || item.apiPlanId || item.id;
                        const finalPrice = item.retail_price || item.price || 0;
                        const profitMargin = item.wholesaleCost > 0 ? Math.round(((finalPrice - item.wholesaleCost) / item.wholesaleCost) * 100) : 0;

                        return (
                          <div key={pevId} className="bg-slate-50 border-2 border-black rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs text-left shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-y-[-1px] font-sans">
                            {/* Left Meta info */}
                            <div className="space-y-1 min-w-0 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap font-sans">
                                <span className={cn(
                                  "text-[8px] font-black uppercase px-1.5 py-0.5 rounded leading-none border border-black",
                                  item.network === 'MTN' ? "bg-yellow-400 text-black" :
                                  item.network === 'Airtel' ? "bg-red-400 text-white" :
                                  item.network === 'Glo' ? "bg-green-400 text-white" :
                                  item.type === 'electricity' ? "bg-amber-400 text-black" : "bg-purple-400 text-white"
                                )}>
                                  {item.network}
                                </span>
                                <span className="text-[8px] bg-white text-slate-700 font-extrabold px-1.5 py-0.5 rounded leading-none border border-black uppercase">
                                  {item.planType || item.type}
                                </span>
                              </div>
                              <h6 className="font-extrabold text-slate-900 tracking-tight text-xs leading-tight">{item.name}</h6>
                              <div className="text-[9px] text-slate-400 font-mono font-bold">CODE: {pevId}</div>
                            </div>

                            {/* Cost and Price input */}
                            <div className="flex items-center gap-3 justify-between md:justify-end border-t border-dashed border-slate-300 md:border-t-0 pt-2 md:pt-0">
                              <div className="text-right text-[10px] font-sans pr-1 w-20 leading-tight shrink-0">
                                <span className="block text-slate-400 font-bold">Wholesale Cost</span>
                                <span className="font-bold text-xs text-slate-700 font-mono">₦{item.wholesaleCost}</span>
                              </div>

                              <div className="flex flex-col items-end">
                                <span className="text-[8px] text-slate-505 font-bold uppercase pb-0.5">Your Retail Price (₦)</span>
                                <div className="relative inline-block font-sans">
                                  <input
                                    type="number"
                                    value={item.retail_price || ''}
                                    onChange={(e) => handleUpdateDraftPrice(item.peyflex_variation_id, Number(e.target.value))}
                                    className="w-24 bg-white border-2 border-black text-black font-bold text-xs rounded-lg p-1.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500/20 font-mono"
                                  />
                                  <span className="absolute -top-1 -right-1 text-[7px] bg-black text-white font-black px-1 rounded-sm select-none border border-black leading-none py-0.5">
                                    {profitMargin >= 0 ? `+${profitMargin}%` : `${profitMargin}%`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center space-y-4">
                  <div className="mx-auto w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                    <RefreshCw size={20} className="animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-slate-800 font-sans">No Peyflex Draft Profiles Loaded</p>
                    <p className="text-[11px] text-slate-500 font-sans max-w-sm mx-auto font-medium">Please trigger the node synchronization using the primary button above to fetch instant pricing channels.</p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchPeyflexRates}
                    className="p-3 bg-black hover:bg-slate-850 text-white border-2 border-black font-extrabold text-xs rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer inline-flex items-center gap-2 font-sans"
                  >
                    🚀 Trigger Synchronization Channel
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Collapsible Tidy Manual Creator / Registry Suite */}
          <div className="bg-white rounded-2xl border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] space-y-4">
            <div className="pb-3 border-b border-slate-200 text-left">
              <h5 className="font-extrabold text-md text-black font-sans uppercase tracking-tight">⚙️ Manual Plan Registrar Suite</h5>
              <p className="text-xs text-slate-500 font-bold font-sans">Register manual custom variables or non-peyflex configurations directly</p>
            </div>

            <form onSubmit={handleAddPlanSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end font-sans">
              <div className="space-y-1 text-left font-sans animate-fadeIn">
                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Carrier Network</label>
                <select
                  value={planNetwork}
                  onChange={(e) => setPlanNetwork(e.target.value as NetworkType)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold leading-tight"
                >
                  <option value="MTN">MTN NG</option>
                  <option value="AIRTEL">AIRTEL NG</option>
                  <option value="GLO">GLO NG</option>
                  <option value="9MOBILE">9MOBILE</option>
                </select>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Package Category</label>
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold leading-tight font-sans"
                >
                  <option value="data">Internet Data</option>
                  <option value="airtime">DisCo Electricity / Cable Package</option>
                </select>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Display Plan Name</label>
                <input
                  type="text"
                  placeholder="e.g. MTN SME 1.2GB Gifting"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none font-sans"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans font-sans">Retail Pricing (₦)</label>
                <input
                  type="number"
                  placeholder="e.g. 350"
                  value={planPrice}
                  onChange={(e) => setPlanPrice(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] uppercase font-bold text-slate-505 ml-1 font-sans">Reseller Rate (₦) - Optional</label>
                <input
                  type="number"
                  placeholder="Leave empty for auto"
                  value={planResellerPrice}
                  onChange={(e) => setPlanResellerPrice(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none font-mono font-sans"
                />
              </div>

              <div className="space-y-1 text-left font-sans font-sans">
                <label className="text-[10px] uppercase font-bold text-slate-505 ml-1 font-sans">Agent Rate (₦) - Optional</label>
                <input
                  type="number"
                  placeholder="Leave empty for auto"
                  value={planAgentPrice}
                  onChange={(e) => setPlanAgentPrice(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none font-mono font-sans"
                />
              </div>

              <div className="space-y-1 text-left font-sans">
                <label className="text-[10px] uppercase font-bold text-slate-505 ml-1 font-sans">Validity Duration</label>
                <input
                  type="text"
                  placeholder="e.g. 30 Days"
                  value={planDuration}
                  onChange={(e) => setPlanDuration(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none font-mono font-sans"
                />
              </div>

              <div className="space-y-1 text-left font-sans">
                <label className="text-[10px] uppercase font-bold text-slate-505 ml-1 font-sans font-mono font-mono">Peyflex ID (Var Code)</label>
                <input
                  type="text"
                  placeholder="e.g. mtn_sme_1gb"
                  value={planPeyflexId}
                  onChange={(e) => setPlanPeyflexId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none font-mono"
                />
              </div>

              <div className="col-span-1 md:col-span-4 flex justify-end pt-2 font-sans">
                <button
                  type="submit"
                  disabled={isAddingPlan}
                  className="bg-black hover:bg-slate-850 text-white font-extrabold text-xs px-6 py-3 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:scale-101 transition-all cursor-pointer font-sans"
                >
                  {isAddingPlan ? "Registering Plan Code..." : "➕ Create & Publish Manual Service Package"}
                </button>
              </div>
            </form>
          </div>

        </div>
      )}

      {adminSubTab === 'service-plans' && (
        /* DEDICATED SERVICE PLANS MANAGER VIEW SECTION - RETIRED FOR SUPERIOR SPLIT SCREEN LAYOUT */
        <div className="hidden space-y-8">
          {/* PEYFLEX SYNC ENGINE CONTROL PANEL */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 font-sans">Peyflex Wholesale Services Integration</span>
                </div>
                <h4 className="font-extrabold text-xl tracking-tight text-white mt-1">Peyflex Product Engine & Live Syncer</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl font-sans">
                  Query, map, verify, and markup wholesale digital products (Internet Data, Electricity tokens, Cable bouquets) directly from Peyflex. Changes made here can be dynamically validated and published instantly across client views.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={fetchPeyflexRates}
                  disabled={isFetchingPeyflex}
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-lg shadow-indigo-900/30 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap active:scale-95"
                >
                  {isFetchingPeyflex ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Fetching Peyflex Node...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      🔄 Fetch Fresh Plans from Peyflex
                    </>
                  )}
                </button>

                {peyflexProducts.length > 0 && (
                  <button
                    onClick={handlePublishPeyflexPlans}
                    disabled={isPublishingPeyflex}
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-lg shadow-emerald-950/20 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    {isPublishingPeyflex ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Publishing to Firestore...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} />
                        Save & Publish Plans to App
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {peyflexProducts.length > 0 ? (
              <div className="bg-slate-950/80 rounded-2xl border border-slate-850 p-4 md:p-6 space-y-6">
                {/* DRAFT PRICE MULTI-SELECT MARKUP / SEARCH BAR */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-850">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-505 block tracking-wider font-sans">Plan Editor Manager ({peyflexProducts.length} Staged Products)</span>
                    <p className="text-[11px] text-slate-400 font-sans">Modify prices individually below or apply bulk markup structures.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-404 font-sans font-extrabold mr-1 uppercase">Bulk Markup:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPeyflexProducts(prev => prev.map(p => ({
                          ...p,
                          retail_price: Math.round(p.wholesaleCost * 1.03),
                          price: Math.round(p.wholesaleCost * 1.03)
                        })));
                        toast.success("Applied Cost + 3% bulk markup draft!");
                      }}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold font-sans cursor-pointer active:scale-95"
                    >
                      3% Markup
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPeyflexProducts(prev => prev.map(p => ({
                          ...p,
                          retail_price: Math.round(p.wholesaleCost * 1.05),
                          price: Math.round(p.wholesaleCost * 1.05)
                        })));
                        toast.success("Applied Cost + 5% bulk markup draft!");
                      }}
                      className="bg-indigo-950/80 text-indigo-400 hover:bg-indigo-900 border border-indigo-900 px-2.5 py-1.5 rounded-lg text-[10px] font-black font-sans cursor-pointer active:scale-95"
                    >
                      5% Markup
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPeyflexProducts(prev => prev.map(p => ({
                          ...p,
                          retail_price: Math.round(p.wholesaleCost * 1.10),
                          price: Math.round(p.wholesaleCost * 1.10)
                        })));
                        toast.success("Applied Cost + 10% bulk markup draft!");
                      }}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold font-sans cursor-pointer active:scale-95"
                    >
                      10% Markup
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPeyflexProducts(prev => prev.map(p => ({
                          ...p,
                          retail_price: p.wholesaleCost + 100,
                          price: p.wholesaleCost + 100
                        })));
                        toast.success("Applied Cost + ₦100 flat markup draft!");
                      }}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold font-sans cursor-pointer active:scale-95"
                    >
                      +₦100 Flat
                    </button>
                  </div>
                </div>

                {/* SINK SUBCATEGORY SELECTOR FILTER TABS */}
                <div className="flex gap-2 border-b border-slate-900 pb-3 overflow-x-auto">
                  {(['all', 'data', 'electricity', 'cable'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPeyflexFilterCategory(cat)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-extrabold tracking-tight transition-all uppercase font-sans cursor-pointer whitespace-nowrap",
                        peyflexFilterCategory === cat
                          ? "bg-indigo-650 text-white"
                          : "bg-slate-900 text-slate-400 hover:text-white"
                      )}
                    >
                      {cat === 'all' ? 'All categories' : cat === 'data' ? 'Data Bundles' : cat === 'electricity' ? 'Electricity Bills' : 'Cable TV Packages'}
                    </button>
                  ))}
                </div>

                {/* DRAFT LIST GRID CONTAINER */}
                <div className="grid md:grid-cols-2 gap-4 max-h-[480px] overflow-y-auto pr-2">
                  {peyflexProducts
                    .filter(p => peyflexFilterCategory === 'all' || p.type === peyflexFilterCategory)
                    .map((item) => {
                      const pevId = item.peyflex_variation_id;
                      return (
                        <div key={item.peyflex_variation_id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-left">
                          {/* Left: Product carrier metadata */}
                          <div className="text-left space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide leading-none",
                                item.network === 'MTN' ? "bg-yellow-500 text-yellow-950" :
                                item.network === 'Airtel' ? "bg-red-500 text-white" :
                                item.network === 'Glo' ? "bg-green-500 text-white" :
                                item.type === 'electricity' ? "bg-amber-500 text-slate-950" : "bg-purple-500 text-white"
                              )}>
                                {item.network}
                              </span>
                              <span className="text-[8px] bg-slate-800 text-slate-300 font-extrabold px-1.5 py-0.5 rounded leading-none uppercase">
                                {item.planType || item.type}
                              </span>
                            </div>
                            <h6 className="font-extrabold text-slate-100 tracking-tight text-xs leading-tight mt-0.5">{item.name}</h6>
                            <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1.5 mt-0.5">
                              <span>Peyflex Var ID:</span>
                              <span className="font-mono font-semibold text-indigo-400">{pevId}</span>
                            </div>
                          </div>

                          {/* Right: Pricing layout */}
                          <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3 border-t border-slate-800 md:border-0 pt-2.5 md:pt-0">
                            <div className="text-right text-[10px] text-slate-400 pr-1">
                              <span className="block font-sans">Wholesale Cost</span>
                              <span className="font-mono text-xs font-bold text-slate-300">₦{item.wholesaleCost}</span>
                            </div>

                            <div className="flex flex-col items-end">
                              <span className="text-[9px] text-slate-400 font-sans font-extrabold pb-0.5">Your Retail Price (₦)</span>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={item.retail_price || ''}
                                  onChange={(e) => handleUpdateDraftPrice(item.peyflex_variation_id, Number(e.target.value))}
                                  className="w-24 bg-slate-950 border border-slate-750 focus:border-indigo-500 text-white font-mono font-bold text-xs rounded-xl p-2 focus:ring-1 focus:ring-indigo-500/20 text-center focus:outline-none"
                                />
                                <span className="absolute -top-1 -right-1 text-[8px] bg-indigo-900 text-indigo-300 font-semibold px-1 rounded border border-indigo-700 select-none">
                                  {item.wholesaleCost > 0 ? `+${Math.round((((item.retail_price || 0) - item.wholesaleCost) / item.wholesaleCost) * 100)}%` : '0%'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* BOTTOM WARNING STATEMENT */}
                <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-3 flex gap-2 items-start text-left text-[11px] text-amber-400/90 font-sans leading-relaxed">
                  <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-bold block text-amber-300">Staging Mode Pre-requisite Note</span>
                    These plans are loaded in-memory and will <strong>Not</strong> affect live customers until you click <strong>"Save & Publish Plans to App"</strong> above. Once published, they replace or merge with your current inventory and locked into backend database collections.
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400 text-xs leading-relaxed space-y-3 font-sans">
                <p>⚡ No Peyflex draft profiles loaded in-memory. Please trigger the node synchronization using the primary button above.</p>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={fetchPeyflexRates}
                    className="bg-indigo-650 hover:bg-indigo-600 text-white font-extrabold text-[11px] px-4 py-2 rounded-xl transition-all cursor-pointer font-sans"
                  >
                    Sync Node Now
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
          
          {/* L-S: ADD SERVICE PLANS FORM */}
          <div className="space-y-6 lg:col-span-1">
            <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm space-y-5">
              <div>
                <h5 className="font-extrabold text-slate-900 text-base">Add Service Plan</h5>
                <p className="text-[10px] text-slate-400 font-bold font-sans uppercase">Create Dynamic Product Package</p>
              </div>

              <form onSubmit={handleAddPlanSubmit} className="space-y-4 text-xs font-bold">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Network Carrier</label>
                    <select 
                      value={planNetwork}
                      onChange={(e) => setPlanNetwork(e.target.value as NetworkType)}
                      className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-indigo-650/20"
                    >
                      <option value="MTN">MTN</option>
                      <option value="Airtel">Airtel</option>
                      <option value="Glo">Glo</option>
                      <option value="9mobile">9mobile</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Plan Category</label>
                    <select 
                      value={planType}
                      onChange={(e) => setPlanType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-indigo-650/20"
                    >
                      <option value="data">Internet Data</option>
                      <option value="airtime">Bulk Airtime</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Plan Name</label>
                  <input 
                    required
                    type="text" 
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="e.g. 5GB Corporate Gifting"
                    className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 focus:outline-none font-medium text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Retail Price (₦)</label>
                    <input 
                      required
                      type="text" 
                      value={planPrice}
                      onChange={(e) => setPlanPrice(e.target.value.replace(/\D/g,''))}
                      placeholder="e.g. 1250"
                      className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-650/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Validity Duration</label>
                    <input 
                      type="text" 
                      value={planDuration}
                      onChange={(e) => setPlanDuration(e.target.value)}
                      placeholder="30 Days"
                      disabled={planType === 'airtime'}
                      className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 focus:outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-405 ml-1 font-sans">Peyflex Variation ID / Code</label>
                  <input 
                    required
                    type="text" 
                    value={planPeyflexId}
                    onChange={(e) => setPlanPeyflexId(e.target.value)}
                    placeholder="e.g. mtn_sme_1gb (copied from Peyflex)"
                    className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 focus:outline-none font-medium text-xs font-mono"
                  />
                </div>

                {/* ADVANCED AGENT & RESELLER DISCOUNTED SPECIFICATIONS */}
                <div className="border-t border-slate-100 pt-4 space-y-3.5">
                  <span className="text-[10px] uppercase font-black text-indigo-600 block tracking-wider font-sans">Partner Pricing Markups (Optional)</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Reseller Price (₦)</label>
                      <input 
                        type="text" 
                        value={planResellerPrice}
                        onChange={(e) => setPlanResellerPrice(e.target.value.replace(/\D/g,''))}
                        placeholder="e.g. 1150"
                        className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 font-mono focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Agent Price (₦)</label>
                      <input 
                        type="text" 
                        value={planAgentPrice}
                        onChange={(e) => setPlanAgentPrice(e.target.value.replace(/\D/g,''))}
                        placeholder="e.g. 1100"
                        className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <button 
                  disabled={isAddingPlan}
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold p-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 cursor-pointer text-xs"
                >
                  {isAddingPlan ? "Registering..." : <><Plus size={15} /> Create Service Plan</>}
                </button>
              </form>
            </div>

            {/* PERMANENT DEDICATED MANAGE EXISTING PLANS SECTION */}
            <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm space-y-5">
              <div>
                <h5 className="font-extrabold text-slate-900 text-base">Manage Existing Plans</h5>
                <p className="text-[10px] text-slate-400 font-bold font-sans uppercase">Modify Existing Registered Service Packages</p>
              </div>

              {/* Editable Form Block (Loads details when startEditPlan is triggered) */}
              {editingPlan ? (
                <form onSubmit={handleEditPlanSubmit} className="space-y-4 text-xs font-bold border border-indigo-150 bg-indigo-50/20 p-4.5 rounded-2xl">
                  <div className="flex justify-between items-center pb-2 border-b border-indigo-100">
                    <span className="text-xs font-black text-indigo-700 font-mono line-clamp-1">Modify Plan: {editingPlan.name || editingPlan.planName}</span>
                    <button 
                      type="button" 
                      onClick={() => setEditingPlan(null)} 
                      className="text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-md cursor-pointer transition-colors shrink-0"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Name</label>
                    <input 
                      required
                      type="text" 
                      value={editPlanName}
                      onChange={(e) => setEditPlanName(e.target.value)}
                      placeholder="e.g. 5GB Corporate Gifting"
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 focus:outline-none font-medium text-xs font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Retail Price (₦)</label>
                      <input 
                        required
                        type="text" 
                        value={editPlanPrice}
                        onChange={(e) => setEditPlanPrice(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 1250"
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 font-mono focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Validity Duration</label>
                      <input 
                        type="text" 
                        value={editPlanDuration}
                        onChange={(e) => setEditPlanDuration(e.target.value)}
                        placeholder="30 Days"
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 focus:outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Peyflex ID (Variation Code)</label>
                    <input 
                      required
                      type="text" 
                      value={editPlanPeyflexId}
                      onChange={(e) => setEditPlanPeyflexId(e.target.value)}
                      placeholder="e.g. mtn_sme_1gb"
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 focus:outline-none font-medium text-xs font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Reseller Price (₦)</label>
                      <input 
                        type="text" 
                        value={editPlanResellerPrice}
                        onChange={(e) => setEditPlanResellerPrice(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-white border border-slate-150 rounded-xl p-3 font-mono text-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Agent Price (₦)</label>
                      <input 
                        type="text" 
                        value={editPlanAgentPrice}
                        onChange={(e) => setEditPlanAgentPrice(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-white border border-slate-150 rounded-xl p-3 font-mono text-slate-700"
                      />
                    </div>
                  </div>

                  <button 
                    disabled={isUpdatingPlan}
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold p-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 cursor-pointer text-xs mt-2"
                  >
                    {isUpdatingPlan ? "Saving Changes..." : "Save Changes"}
                  </button>
                </form>
              ) : (
                <div className="bg-slate-50/50 rounded-2xl border border-dashed border-slate-150 p-6 text-center text-slate-400 text-[11px] leading-relaxed">
                  💡 Select any service option below or click "Edit" on standard grid cards to begin modification in real-time.
                </div>
              )}

              {/* Clean Quick List of existing plans in DB */}
              <div className="border-t border-slate-100 pt-4">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block mb-3">Database Registered Packages ({servicePlansList.length})</span>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {servicePlansList.length > 0 ? (
                    servicePlansList.map((p) => {
                      const pevId = p.peyflex_variation_id || p.peyflex_id || p.apiPlanId || p.id || '';
                      return (
                        <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl transition-all hover:bg-slate-100/70">
                          <div className="flex flex-col text-left">
                            <div className="flex items-center gap-1.5 leading-none">
                              <span className={cn(
                                "text-[8px] font-black px-1 py-0.5 rounded leading-none uppercase",
                                p.network === 'MTN' ? "bg-yellow-100 text-yellow-800" :
                                p.network === 'Airtel' ? "bg-red-100 text-red-700" :
                                p.network === 'Glo' ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-700"
                              )}>
                                {p.network}
                              </span>
                              <span className="text-[8px] bg-slate-200 text-slate-650 font-black uppercase px-1 py-0.5 rounded">
                                {p.type || 'data'}
                              </span>
                            </div>
                            <span className="text-xs font-bold text-slate-800 tracking-tight mt-1 line-clamp-1">{p.name || p.planName}</span>
                            <div className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                              <div>Retail Price: <span className="font-extrabold text-slate-705">₦{Number(p.price || p.retail_price || 0).toLocaleString()}</span></div>
                              <div>Peyflex ID: <span className="font-mono text-indigo-600 font-semibold">{pevId}</span></div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => startEditPlan(p)}
                            className="flex-shrink-0 bg-white hover:bg-indigo-600 hover:text-white text-indigo-600 font-bold border border-slate-150 px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 text-[10px] cursor-pointer font-sans"
                          >
                            <Edit size={10} /> Edit
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-[10px] text-slate-400">No plans registered yet in Firestore.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* R-S: ACTIVE SERVICE PLANS VIEW PANEL WITH FILTER & SEARCH BAR & EDIT / DELETE */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-50">
              <div>
                <h5 className="font-extrabold text-slate-900 text-base">Active Registered Service Packages</h5>
                <p className="text-xs text-slate-400 font-medium font-sans">Real-time service options visible on dynamic client recharge dashboards.</p>
              </div>
              <span className="self-start md:self-auto text-xs font-black bg-indigo-50 text-indigo-700 tracking-wider px-3.5 py-1.5 rounded-full border border-indigo-100 font-sans">
                {filteredPlans.length} plans listed
              </span>
            </div>

            {/* REAL-TIME FILTERING GEAR CONTROLS */}
            <div className="grid sm:grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              {/* Search text */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-455 tracking-wider font-sans">Search by name</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                  <input 
                    type="text"
                    value={planSearchQuery}
                    onChange={(e) => setPlanSearchQuery(e.target.value)}
                    placeholder="Search package..."
                    className="w-full bg-white border border-slate-100 rounded-lg py-1.5 pl-8 pr-3 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-600/30"
                  />
                </div>
              </div>

              {/* Carrier filter */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-455 tracking-wider font-sans">Network provider</label>
                <select 
                  value={planFilterNetwork}
                  onChange={(e) => setPlanFilterNetwork(e.target.value)}
                  className="w-full bg-white border border-slate-100 rounded-lg py-1.5 px-2 text-xs font-bold focus:outline-none"
                >
                  <option value="All">All Carriers</option>
                  <option value="MTN">MTN</option>
                  <option value="Airtel">Airtel</option>
                  <option value="Glo">Glo</option>
                  <option value="9mobile">9mobile</option>
                </select>
              </div>

              {/* Category type filter */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-455 tracking-wider font-sans">Type category</label>
                <select 
                  value={planFilterType}
                  onChange={(e) => setPlanFilterType(e.target.value)}
                  className="w-full bg-white border border-slate-100 rounded-lg py-1.5 px-2 text-xs font-bold focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  <option value="data">Internet Data</option>
                  <option value="airtime">Bulk Airtime</option>
                </select>
              </div>
            </div>

            {/* LIST GRID OF SERVICE OPTIONS WITH EDIT ACTIONS */}
            {filteredPlans.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-4 max-h-[520px] overflow-y-auto pr-1">
                {filteredPlans.map((plan) => (
                  <div 
                    key={plan.id} 
                    className={cn(
                      "p-5 rounded-2xl border bg-white flex flex-col justify-between items-start relative overflow-hidden shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
                      plan.network === 'MTN' ? "border-l-4 border-l-yellow-400 border-slate-100" :
                      plan.network === 'Airtel' ? "border-l-4 border-l-red-500 border-slate-100" :
                      plan.network === 'Glo' ? "border-l-4 border-l-green-500 border-slate-100" : "border-l-4 border-l-slate-650 border-slate-100"
                    )}
                  >
                    <div className="w-full space-y-2">
                      <div className="flex justify-between items-start w-full gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded leading-none",
                            plan.network === 'MTN' ? "bg-yellow-50 text-yellow-800" :
                            plan.network === 'Airtel' ? "bg-red-50 text-red-600" :
                            plan.network === 'Glo' ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-700"
                          )}>
                            {plan.network}
                          </span>
                          <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 uppercase px-1.5 py-0.5 rounded leading-none font-sans">
                            {plan.type}
                          </span>
                        </div>
                        
                        <div className="flex gap-1">
                          <button 
                            type="button"
                            onClick={() => startEditPlan(plan)}
                            className="p-1 px-1.5 bg-slate-50 border border-slate-100 rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-650 hover:border-indigo-100 transition-all inline-flex items-center cursor-pointer shadow-sm"
                            title="Edit Plan properties"
                          >
                            <Edit size={12} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDeletePlan(plan.id)}
                            className="p-1 px-1.5 bg-slate-50 border border-slate-100 rounded-lg text-red-500 hover:bg-rose-50 hover:border-rose-100 transition-all inline-flex items-center cursor-pointer shadow-sm"
                            title="Dissolve Plan code"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div>
                        <h6 className="font-extrabold text-sm text-slate-850 leading-snug">{plan.name}</h6>
                        {plan.duration && <p className="text-[10px] text-slate-400 font-bold font-sans">Validity: {plan.duration}</p>}
                      </div>

                      {/* DISPLAY COST BRACKETS */}
                      <div className="pt-2 border-t border-slate-50 grid grid-cols-3 gap-2 text-left leading-tight">
                        <div>
                          <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 font-sans block">Regular</span>
                          <span className="font-black text-xs text-slate-900 font-mono">{formatCurrency(plan.price)}</span>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase tracking-wider font-bold text-indigo-500 font-sans block">Reseller</span>
                          <span className="font-black text-xs text-indigo-600 font-mono">
                            {plan.resellerPrice ? formatCurrency(plan.resellerPrice) : 'Default'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase tracking-wider font-bold text-emerald-500 font-sans block">Agent</span>
                          <span className="font-black text-xs text-emerald-600 font-mono">
                            {plan.agentPrice ? formatCurrency(plan.agentPrice) : 'Default'}
                          </span>
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center text-xs font-bold text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-150 font-sans">
                No active packages correspond with the filter parameters defined above.
              </div>
            )}
          </div>

        </div>
        </div>
      )}

      {adminSubTab === 'opay-receipts' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-8">
          <div className="flex justify-between items-center pb-6 border-b border-slate-50">
            <div>
              <h5 className="font-extrabold text-slate-900 text-lg">Bank Deposits (Paystack & Monnify) Audit & Logs</h5>
              <p className="text-sm text-slate-400 font-medium font-sans">
                Real-time transaction values, status checks, and revenue auditing.
              </p>
            </div>
            <button
              onClick={fetchOpayRevenueStats}
              disabled={loadingOpayStats}
              className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all cursor-pointer disabled:opacity-50"
            >
              {loadingOpayStats ? "Refreshing..." : "🔄 Refresh Stats"}
            </button>
          </div>

          {loadingOpayStats && !opayRevenueStats ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-bold font-sans">Loading administrative receipts...</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Cards Panel */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-purple-50/50 border border-purple-100/80 p-6 rounded-3xl">
                  <span className="text-[10px] uppercase font-extrabold text-purple-700 tracking-wider block font-sans">Total Deposited Revenue</span>
                  <p className="text-2xl font-black text-purple-800 font-mono tracking-tight mt-2">{formatCurrency(opayRevenueStats?.totalRevenue || 0)}</p>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-100/80 p-6 rounded-3xl">
                  <span className="text-[10px] uppercase font-extrabold text-emerald-700 tracking-wider block font-sans">Successful Payments</span>
                  <p className="text-2xl font-black text-emerald-800 font-mono tracking-tight mt-2">{opayRevenueStats?.successfulCount || 0}</p>
                </div>

                <div className="bg-rose-50/50 border border-rose-100/80 p-6 rounded-3xl">
                  <span className="text-[10px] uppercase font-extrabold text-rose-700 tracking-wider block font-sans">Failed Payments</span>
                  <p className="text-2xl font-black text-rose-800 font-mono tracking-tight mt-2">{opayRevenueStats?.failedCount || 0}</p>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl">
                  <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider block font-sans">Total Credit Invariant Logs</span>
                  <p className="text-2xl font-black text-slate-800 font-mono tracking-tight mt-2">{opayRevenueStats?.totalCount || 0}</p>
                </div>
              </div>

              {/* Transactions List */}
              <div className="space-y-4">
                <h6 className="font-extrabold text-slate-900">Deposit Webhook Transaction Logs</h6>
                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-50">
                  {opayRevenueStats?.payments && opayRevenueStats.payments.length > 0 ? (
                    opayRevenueStats.payments.map((p: any) => (
                      <div key={p.reference} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between text-xs hover:bg-slate-50/50 transition-colors gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 font-sans">{p.email || "user@example.com"}</span>
                            <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">User: {p.userId?.slice(0, 8)}...</span>
                          </div>
                          <p className="font-mono text-[10px] text-slate-400">Ref: <span className="text-slate-600 font-semibold">{p.reference}</span></p>
                          <p className="text-[10px] text-slate-400 font-sans">{new Date(p.createdAt || 0).toLocaleString()}</p>
                        </div>

                        <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2">
                          <span className="font-black text-sm text-slate-900 font-mono">{formatCurrency(p.amount)}</span>
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded font-sans",
                            p.status === "completed" || p.status === "success" ? "bg-emerald-50 text-emerald-700" :
                            p.status === "pending" ? "bg-amber-50 text-amber-700 animate-pulse" : "bg-rose-50 text-rose-700"
                          )}>
                            {p.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center text-slate-500">No OPay payment gateway transactions recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EDIT SERVICE PLAN OVERLAY MODAL */}
      <AnimatePresence>
        {editingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditingPlan(null)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] p-8 max-w-md w-full relative border border-slate-100 shadow-2xl z-10 font-sans text-slate-900"
            >
              <h5 className="font-extrabold text-lg text-slate-900 mb-2 font-sans">Edit Service Plan</h5>
              <p className="text-xs text-slate-500 mb-6 font-sans">Modify product properties for <span className="font-bold text-slate-800 font-mono">{editingPlan.network} - {editingPlan.name}</span></p>

              <form onSubmit={handleEditPlanSubmit} className="space-y-4 text-xs font-bold">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Network Carrier</label>
                    <select 
                      value={editPlanNetwork}
                      onChange={(e) => setEditPlanNetwork(e.target.value as NetworkType)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 focus:outline-none"
                    >
                      <option value="MTN">MTN</option>
                      <option value="Airtel">Airtel</option>
                      <option value="Glo">Glo</option>
                      <option value="9mobile">9mobile</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Plan Category</label>
                    <select 
                      value={editPlanType}
                      onChange={(e) => setEditPlanType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 focus:outline-none"
                    >
                      <option value="data">Internet Data</option>
                      <option value="airtime">Bulk Airtime</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Plan Name</label>
                  <input 
                    required
                    type="text" 
                    value={editPlanName}
                    onChange={(e) => setEditPlanName(e.target.value)}
                    placeholder="e.g. 5GB Corporate Gifting"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 focus:outline-none font-medium text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Retail Price (₦)</label>
                    <input 
                      required
                      type="text" 
                      value={editPlanPrice}
                      onChange={(e) => setEditPlanPrice(e.target.value.replace(/\D/g,''))}
                      placeholder="e.g. 1250"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 font-mono focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Validity Duration</label>
                    <input 
                      type="text" 
                      value={editPlanDuration}
                      onChange={(e) => setEditPlanDuration(e.target.value)}
                      placeholder="30 Days"
                      disabled={editPlanType === 'airtime'}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 focus:outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-405 ml-1 font-sans">Peyflex Variation ID / Code</label>
                  <input 
                    required
                    type="text" 
                    value={editPlanPeyflexId}
                    onChange={(e) => setEditPlanPeyflexId(e.target.value)}
                    placeholder="e.g. mtn_sme_1gb (copied from Peyflex)"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 focus:outline-none font-medium text-xs font-mono"
                  />
                </div>

                {/* EDIT MARKUP PRICES */}
                <div className="border-t border-slate-100 pt-4 space-y-3.5">
                  <span className="text-[10px] uppercase font-black text-indigo-650 block tracking-wider font-sans">Partner Pricing Markups (Optional)</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Reseller Price (₦)</label>
                      <input 
                        type="text" 
                        value={editPlanResellerPrice}
                        onChange={(e) => setEditPlanResellerPrice(e.target.value.replace(/\D/g,''))}
                        placeholder="e.g. 1150"
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 font-mono focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Agent Price (₦)</label>
                      <input 
                        type="text" 
                        value={editPlanAgentPrice}
                        onChange={(e) => setEditPlanAgentPrice(e.target.value.replace(/\D/g,''))}
                        placeholder="e.g. 1100"
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setEditingPlan(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-xl font-bold font-sans transition-colors cursor-pointer"
                  >
                    Cancel Action
                  </button>
                  <button 
                    disabled={isUpdatingPlan}
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-extrabold transition-all flex items-center justify-center gap-1 shadow-lg shadow-indigo-100 cursor-pointer"
                  >
                    {isUpdatingPlan ? "Saving..." : "Save Properties"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. USER WALLET ADJUST ADJUSTMENT MODAL POPUP */}
      <AnimatePresence>
        {adjustingUser && adjustMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setAdjustingUser(null); setAdjustMode(null); }}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full relative border border-slate-100 shadow-2xl z-10 font-sans text-slate-900"
            >
              <h5 className="font-extrabold text-lg text-slate-900 capitalize mb-2">{adjustMode} Wallet Balance</h5>
              <p className="text-xs text-slate-500 mb-6 font-sans">Modifies wallet reserves for <span className="font-bold text-slate-800">{adjustingUser.fullName}</span> ({adjustingUser.email})</p>

              <form onSubmit={handleBalanceAdjustSubmit} className="space-y-4 text-xs font-bold">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Transfer Amount (₦)</label>
                  <input 
                    required
                    type="text" 
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g,''))}
                    placeholder="e.g. 5000"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 font-mono text-sm focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 ml-1 font-sans">Adjustment Reason / Notes (Optional)</label>
                  <input 
                    type="text" 
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Referral reward boost, Manual transfer credit code"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 focus:outline-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => { setAdjustingUser(null); setAdjustMode(null); }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-xl font-bold font-sans transition-colors cursor-pointer"
                  >
                    Cancel Action
                  </button>
                  <button 
                    disabled={isUpdatingBalance}
                    type="submit"
                    className={cn(
                      "flex-1 text-white py-3.5 rounded-xl font-extrabold transition-all flex items-center justify-center gap-1 shadow-lg cursor-pointer",
                      adjustMode === 'credit' ? "bg-green-600 hover:bg-green-700 shadow-green-100" : "bg-red-600 hover:bg-red-700 shadow-red-100"
                    )}
                  >
                    {isUpdatingBalance ? "Processing..." : `${adjustMode === 'credit' ? 'Credit' : 'Debit'} User`}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
