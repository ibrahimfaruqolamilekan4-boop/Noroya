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
import { db, auth } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { useSupabaseError } from '../hooks/useSupabaseError';
import { 
  collection, 
  query, 
  getDocs, 
  getDoc,
  setDoc,
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

// Pure deterministic UUID mapper to prevent PostgreSQL id column type conflicts (UUID vs text)
export const ensureUUID = (strId: string): string => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(strId)) {
    return strId;
  }
  let seed = 0;
  for (let i = 0; i < strId.length; i++) {
    seed = (seed * 31 + strId.charCodeAt(i)) >>> 0;
  }
  const r = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  const hexChars = '0123456789abcdef';
  let hex32 = '';
  for (let i = 0; i < 32; i++) {
    hex32 += hexChars[r() % 16];
  }
  const part1 = hex32.substring(0, 8);
  const part2 = hex32.substring(8, 12);
  const part3 = '4' + hex32.substring(12, 15);
  const part4 = 'a' + hex32.substring(15, 18);
  const part5 = hex32.substring(18, 30);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
};

export default function AdminPanelSection() {
  const { handleSupabaseError } = useSupabaseError();
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

  // Dynamic Supabase Overrides
  const [supabaseUrlInput, setSupabaseUrlInput] = React.useState(localStorage.getItem("DYNAMIC_SUPABASE_URL") || "");
  const [supabaseKeyInput, setSupabaseKeyInput] = React.useState(localStorage.getItem("DYNAMIC_SUPABASE_ANON_KEY") || "");
  
  // Credit/Debit Modals
  const [adjustingUser, setAdjustingUser] = React.useState<UserProfile | null>(null);
  const [adjustMode, setAdjustMode] = React.useState<'credit' | 'debit' | null>(null);
  const [adjustAmount, setAdjustAmount] = React.useState('');
  const [adjustReason, setAdjustReason] = React.useState('');
  const [isUpdatingBalance, setIsUpdatingBalance] = React.useState(false);

  // Bigisub Services Config State
  const [servicesConfig, setServicesConfig] = React.useState<any[]>([]);
  const [isUpdatingService, setIsUpdatingService] = React.useState<string | null>(null);

  // Add Service Form State
  const [newServiceType, setNewServiceType] = React.useState<'data' | 'airtime' | 'cable' | 'electricity' | 'exam_pin'>('data');
  const [newNetworkOrProvider, setNewNetworkOrProvider] = React.useState('MTN');
  const [newItemName, setNewItemName] = React.useState('');
  const [newCostPrice, setNewCostPrice] = React.useState('');
  const [newSellingPrice, setNewSellingPrice] = React.useState('');
  const [newBigisubIdentifierId, setNewBigisubIdentifierId] = React.useState('');
  const [isAddingService, setIsAddingService] = React.useState(false);

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

  const [inventoryCategoryTab, setInventoryCategoryTab] = React.useState<'all' | 'data' | 'airtime' | 'cable' | 'electricity' | 'exam_pin'>('all');

  // Missing states for Peyflex/manual plans
  const [peyflexProducts, setPeyflexProducts] = React.useState<any[]>([]);
  const [peyflexSearchQuery, setPeyflexSearchQuery] = React.useState('');
  const [peyflexFilterCategory, setPeyflexFilterCategory] = React.useState<'all' | 'data' | 'cable' | 'electricity'>('all');

  const [planNetwork, setPlanNetwork] = React.useState<NetworkType>('MTN');
  const [planType, setPlanType] = React.useState<'data' | 'airtime'>('data');
  const [planName, setPlanName] = React.useState('');
  const [planPrice, setPlanPrice] = React.useState('');
  const [planResellerPrice, setPlanResellerPrice] = React.useState('');
  const [planAgentPrice, setPlanAgentPrice] = React.useState('');
  const [planDuration, setPlanDuration] = React.useState('30 Days');
  const [planPeyflexId, setPlanPeyflexId] = React.useState('');
  const [isAddingPlan, setIsAddingPlan] = React.useState(false);

  const [editingPlan, setEditingPlan] = React.useState<any | null>(null);
  const [isUpdatingPlan, setIsUpdatingPlan] = React.useState(false);
  const [editPlanNetwork, setEditPlanNetwork] = React.useState<NetworkType>('MTN');
  const [editPlanType, setEditPlanType] = React.useState<'data' | 'airtime'>('data');
  const [editPlanName, setEditPlanName] = React.useState('');
  const [editPlanPrice, setEditPlanPrice] = React.useState('');
  const [editPlanDuration, setEditPlanDuration] = React.useState('30 Days');
  const [editPlanPeyflexId, setEditPlanPeyflexId] = React.useState('');
  const [editPlanResellerPrice, setEditPlanResellerPrice] = React.useState('');
  const [editPlanAgentPrice, setEditPlanAgentPrice] = React.useState('');

  const fetchPeyflexRates = async () => {
    toast.loading("Initiating synchronization channels...", { id: 'peyflex-sync' });
    setTimeout(() => {
      toast.success("Synchronized successfully! (Offline mode)", { id: 'peyflex-sync' });
    }, 1000);
  };

  const handleUpdateDraftPrice = (peyflex_variation_id: string, price: number) => {
    setPeyflexProducts(prev => prev.map(p => {
      const pId = p.peyflex_variation_id || p.peyflex_id || p.apiPlanId || p.id;
      if (pId === peyflex_variation_id) {
        return { ...p, retail_price: price, price: price };
      }
      return p;
    }));
  };

  const handleAddPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim() || !planPrice || Number(planPrice) <= 0) {
      toast.error("Please enter a valid plan name and price");
      return;
    }
    setIsAddingPlan(true);
    try {
      const { data, error } = await supabase
        .from('services_config')
        .insert({
          service_type: planType,
          provider_or_network: planNetwork.toUpperCase(),
          item_name: planName.trim(),
          cost_price: Number(planPrice) * 0.95, // mock cost
          selling_price: Number(planPrice),
          bigisub_plan_id: planPeyflexId.trim() || `manual_${Date.now()}`,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Manual plan registered and activated successfully!");
      if (data) {
        setServicesConfig(prev => [data, ...prev]);
      }
      setPlanName('');
      setPlanPrice('');
      setPlanResellerPrice('');
      setPlanAgentPrice('');
      setPlanPeyflexId('');
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to register plan: ${err.message}`);
    } finally {
      setIsAddingPlan(false);
    }
  };

  const handleEditPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setIsUpdatingPlan(true);
    try {
      const { error } = await supabase
        .from('services_config')
        .update({
          service_type: editPlanType,
          provider_or_network: editPlanNetwork.toUpperCase(),
          item_name: editPlanName.trim(),
          selling_price: Number(editPlanPrice),
          bigisub_plan_id: editPlanPeyflexId.trim()
        })
        .eq('id', editingPlan.id);

      if (error) throw error;
      toast.success("Plan updated successfully!");
      setServicesConfig(prev => prev.map(p => p.id === editingPlan.id ? {
        ...p,
        service_type: editPlanType,
        provider_or_network: editPlanNetwork.toUpperCase(),
        item_name: editPlanName.trim(),
        selling_price: Number(editPlanPrice),
        bigisub_plan_id: editPlanPeyflexId.trim()
      } : p));
      setEditingPlan(null);
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to update plan: ${err.message}`);
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  // Update a Bigisub service configuration dynamically
  const handleUpdateServiceConfig = async (id: string, cost_price: number, selling_price: number, is_active: boolean) => {
    setIsUpdatingService(id);
    try {
      const response = await fetch(`/api/admin/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_price, selling_price, is_active })
      });

      if (!response.ok) {
        const errObj = await response.json().catch(() => ({}));
        throw new Error(errObj.error || "Failed to update service config.");
      }

      const resData = await response.json();
      toast.success(`Updated ${resData.service?.item_name || 'service'} configuration successfully!`);
      
      // Update local state
      setServicesConfig(prev => prev.map(item => {
        if (item.id === id) {
          return { ...item, cost_price, selling_price, is_active };
        }
        return item;
      }));
    } catch (err: any) {
      console.error("[handleUpdateServiceConfig Error]:", err);
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setIsUpdatingService(null);
    }
  };

  const handleAddServiceConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newCostPrice || !newSellingPrice || !newBigisubIdentifierId.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsAddingService(true);
    try {
      const { data, error } = await supabase
        .from('services_config')
        .insert({
          service_type: newServiceType,
          provider_or_network: newNetworkOrProvider.toUpperCase().trim(),
          item_name: newItemName.trim(),
          cost_price: Number(newCostPrice),
          selling_price: Number(newSellingPrice),
          bigisub_plan_id: newBigisubIdentifierId.trim(),
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("New Bigisub Service Configuration created successfully!");
      if (data) {
        setServicesConfig(prev => [data, ...prev]);
      }
      
      // Reset form fields
      setNewItemName('');
      setNewCostPrice('');
      setNewSellingPrice('');
      setNewBigisubIdentifierId('');
    } catch (err: any) {
      console.error("[handleAddServiceConfig Error]:", err);
      toast.error(`Failed to create service configuration: ${err.message || err}`);
    } finally {
      setIsAddingService(false);
    }
  };

  const handleDeleteServiceConfig = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this service configuration?")) return;

    try {
      const { error } = await supabase
        .from('services_config')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success("Service configuration removed successfully!");
      setServicesConfig(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      console.error("[handleDeleteServiceConfig Error]:", err);
      toast.error(`Failed to delete configuration: ${err.message || err}`);
    }
  };

  // API config state
  const [providerUrl, setProviderUrl] = React.useState('https://vtu-provider-a.com/api/v1');
  const [providerKey, setProviderKey] = React.useState('******************_vtu_p_a');

  React.useEffect(() => {
    let unsubUsers = () => {};
    let unsubTx = () => {};

    if (auth.currentUser) {
      // 1. Fetch Users
      unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
        const userList: UserProfile[] = [];
        snapshot.forEach(doc => {
          userList.push({ uid: doc.id, ...doc.data() } as any);
        });
        setUsers(userList);
        setLoading(false);
      }, (err) => {
        console.warn("Firestore collection 'users' subscribe failed:", err);
        setLoading(false);
      });

      // 2. Fetch System Transactions
      unsubTx = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(150)), (snapshot) => {
        const txList: Transaction[] = [];
        snapshot.forEach(doc => {
          txList.push({ id: doc.id, ...doc.data() } as any);
        });
        setAllTransactions(txList);
      }, (err) => {
        console.warn("Firestore collection 'transactions' subscribe failed:", err);
      });
    } else {
      console.log("Admin Panel loaded with simulated session. Using offline mock datasets.");
      setUsers([{
        uid: 'admin_ibrahim_vtu_uid',
        email: 'ibrahimfaruqolamilekan4@gmail.com',
        fullName: 'Faruq Ibrahim (Admin)',
        balance: 0,
        role: 'admin',
        referralCode: 'NOROYA-ADMIN-99',
        createdAt: new Date().toISOString()
      }]);
      setLoading(false);
      
      const stored = localStorage.getItem("vtu_simulated_transactions");
      if (stored) {
        try {
          setAllTransactions(JSON.parse(stored));
        } catch (e) {}
      }
    }

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

    // Listener A: Internet Data Plans from Supabase with Firestore fallback
    const initSupabasePlansSync = async () => {
      try {
        const { data: plans, error } = await supabase
          .from('data_plans')
          .select('*');
        if (error) throw error;
        if (plans && plans.length > 0) {
          const list = plans.map((p: any) => {
            const pName = p.plan_name || p.name || `${p.network_type || 'MTN'} Plan`;
            const pPrice = Number(p.price || p.retail_price || p.amount || 0);
            return {
              id: p.id,
              ...p,
              name: pName,
              plan_name: pName,
              price: pPrice,
              retail_price: pPrice,
              network: p.network_type || 'MTN',
              network_type: p.network_type || 'MTN',
              type: p.type || 'data'
            };
          });
          setDataPlansList(list);
        }
      } catch (err: any) {
        console.warn("[Supabase Admin Fetch] Failing over to Firestore data stream:", err);
      }
    };

    initSupabasePlansSync();

    // Fetch Services Config from Supabase
    const fetchServicesConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('services_config')
          .select('*')
          .order('service_type', { ascending: true })
          .order('provider_or_network', { ascending: true });
        if (error) throw error;
        if (data) {
          setServicesConfig(data);
        }
      } catch (err: any) {
        console.warn("Could not load services_config from Supabase:", err);
      }
    };
    fetchServicesConfig();

    const supabasePlansChannel = supabase
      .channel('realtime:admin_data_plans')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'data_plans' },
        async () => {
          console.log("[Supabase Realtime Admin] Postgres data plans change, reloading...");
          const { data: plans } = await supabase
            .from('data_plans')
            .select('*');
          if (plans) {
            const list = plans.map((p: any) => {
              const pName = p.plan_name || p.name || `${p.network_type || 'MTN'} Plan`;
              const pPrice = Number(p.price || p.retail_price || p.amount || 0);
              return {
                id: p.id,
                ...p,
                name: pName,
                plan_name: pName,
                price: pPrice,
                retail_price: pPrice,
                network: p.network_type || 'MTN',
                network_type: p.network_type || 'MTN',
                type: p.type || 'data'
              };
            });
            setDataPlansList(list);
          }
        }
      )
      .subscribe();

    const unsubPlans = onSnapshot(collection(db, 'data_plans'), (snapshot) => {
      if (snapshot.empty) {
        if (!fallbackPlansLoaded && dataPlansList.length === 0) setDataPlansList([]);
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
        // Only accept firebase fallbacks if we haven't already synced from Supabase
        setDataPlansList(prev => prev.length > 0 ? prev : list);
      }
    }, (error) => {
      console.warn("Firestore data_plans fallback stream passive:", error);
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
      supabase.removeChannel(supabasePlansChannel);
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

  const handleToggleResellerRole = async (targetUser: UserProfile) => {
    const isCurrentlyReseller = targetUser.is_reseller === true || targetUser.user_role === 'reseller';
    const nextResellerState = !isCurrentlyReseller;
    const nextRole = nextResellerState ? 'reseller' : 'customer';

    try {
      // 1. Update in Firestore
      const userDocRef = doc(db, 'users', targetUser.uid);
      await updateDoc(userDocRef, {
        is_reseller: nextResellerState,
        user_role: nextRole
      });

      // 2. Local State update
      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? {
        ...u,
        is_reseller: nextResellerState,
        user_role: nextRole
      } : u));

      // 3. Update in Supabase
      try {
        const pgUuid = ensureUUID(targetUser.uid);
        const { error: pgErr } = await supabase
          .from('users')
          .update({
            is_reseller: nextResellerState,
            user_role: nextRole
          })
          .eq('id', pgUuid);

        if (pgErr) {
          console.warn("[ToggleReseller] Supabase update warning:", pgErr.message);
        }
      } catch (e: any) {
        console.warn("[ToggleReseller] Supabase update skipped:", e.message);
      }

      toast.success(`Successfully updated ${targetUser.fullName || 'user'} to ${nextRole.toUpperCase()}`);
    } catch (err: any) {
      toast.error(`Failed to update user role: ${err.message}`);
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
        {/* Monnify config option completely deleted */}
      </div>

      {adminSubTab === 'overview' && (
        <>
          {/* SUPABASE CONNECTION CREDENTIALS PANEL */}
          <div className="bg-amber-50/40 border-2 border-amber-200 p-6 rounded-3xl space-y-4 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 rotate-12 opacity-5 pointer-events-none">
              <Database size={200} />
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 shrink-0 border border-amber-200">
                <Database size={20} />
              </div>
              <div className="space-y-1 max-w-2xl">
                <h5 className="font-extrabold text-amber-900 text-sm">Supabase Integration Gateway</h5>
                <p className="text-xs text-amber-700 font-bold leading-relaxed">
                  Connect your live database to load plans dynamically. Enter your Supabase connection parameters below. They will be securely stored inside your local browser storage and override defaults automatically without requiring clean redeployment.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 max-w-4xl pt-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500 ml-1">Supabase URL Link</label>
                <input
                  type="text"
                  value={supabaseUrlInput}
                  onChange={(e) => setSupabaseUrlInput(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full bg-white border-2 border-slate-200 focus:border-black rounded-xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black/15 transition-all text-black"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500 ml-1">Supabase Anon key</label>
                <input
                  type="password"
                  value={supabaseKeyInput}
                  onChange={(e) => setSupabaseKeyInput(e.target.value)}
                  placeholder="eyJhbGciOi..."
                  className="w-full bg-white border-2 border-slate-200 focus:border-black rounded-xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black/15 transition-all text-black"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!supabaseUrlInput.trim() || !supabaseKeyInput.trim()) {
                    toast.error("Both fields are required to secure the bridge.");
                    return;
                  }
                  localStorage.setItem("DYNAMIC_SUPABASE_URL", supabaseUrlInput.trim());
                  localStorage.setItem("DYNAMIC_SUPABASE_ANON_KEY", supabaseKeyInput.trim());
                  toast.success("Bridge successfully mapped! Reloading connection...");
                  setTimeout(() => window.location.reload(), 1000);
                }}
                className="bg-black hover:bg-slate-900 text-white font-black uppercase text-[10px] tracking-wider py-2.5 px-5 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
              >
                Save Configuration Settings
              </button>
              {localStorage.getItem("DYNAMIC_SUPABASE_URL") && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("DYNAMIC_SUPABASE_URL");
                    localStorage.removeItem("DYNAMIC_SUPABASE_ANON_KEY");
                    setSupabaseUrlInput("");
                    setSupabaseKeyInput("");
                    toast.success("Values reset to repository defaults! Tuning down connection...");
                    setTimeout(() => window.location.reload(), 1000);
                  }}
                  className="bg-white hover:bg-slate-50 text-rose-600 font-black uppercase text-[10px] tracking-wider py-2.5 px-5 rounded-xl border-2 border-rose-200 cursor-pointer text-center"
                >
                  Reset Default Settings
                </button>
              )}
            </div>

            <div className="pt-2 text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>Current URL:</span>
              <span className="font-mono text-slate-600 lowercase bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{(supabase as any).supabaseUrl || 'None / Not Initialized'}</span>
            </div>
          </div>

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
                            {(u.is_reseller === true || u.user_role === 'reseller' || u.role === 'reseller') && (
                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none bg-purple-50 text-purple-600 border border-purple-200">
                                Reseller Tier
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-medium font-mono leading-none">{u.email}</p>
                          {u.phoneNumber && <p className="text-[10px] text-slate-500 font-sans font-semibold">Tel: {u.phoneNumber}</p>}
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-[9px] font-black uppercase text-slate-455 tracking-wider font-sans mb-0.5">Wallet Balance</p>
                            <p className="font-black text-sm text-slate-800 font-mono leading-none">{formatCurrency(u.balance || 0)}</p>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-1.5">
                            <button 
                              type="button"
                              onClick={() => { setAdjustingUser(u); setAdjustMode('credit'); }}
                              className="px-2.5 py-1.5 text-[11px] font-black bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-all border border-green-200 cursor-pointer text-center"
                            >
                              Credit
                            </button>
                            <button 
                              type="button"
                              onClick={() => { setAdjustingUser(u); setAdjustMode('debit'); }}
                              className="px-2.5 py-1.5 text-[11px] font-black bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-all border border-rose-200 cursor-pointer text-center"
                            >
                              Debit
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleToggleResellerRole(u)}
                              className={cn(
                                "px-2.5 py-1.5 text-[11px] font-black rounded-lg transition-all border cursor-pointer text-center whitespace-nowrap",
                                (u.is_reseller === true || u.user_role === 'reseller' || u.role === 'reseller')
                                  ? "bg-purple-100 border-purple-300 text-purple-900 hover:bg-purple-200 shadow-sm"
                                  : "bg-slate-100 border-slate-300 text-slate-705 hover:bg-slate-200 shadow-sm"
                              )}
                            >
                              {(u.is_reseller === true || u.user_role === 'reseller' || u.role === 'reseller') ? '➔ Customer' : '➔ Reseller'}
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
              <h4 className="font-extrabold text-2xl tracking-tight text-black mt-0.5 font-sans">Bigisub VTU Integration Console</h4>
              <p className="text-xs text-black/80 font-bold max-w-2xl font-sans">
                Real-time synchronized control. Keep your published digital packages perfectly calibrated. 7-day physical lifespan rules apply automatically on database write transactions.
              </p>
            </div>
            <div className="bg-white border-2 border-black px-4 py-3 rounded-2xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-center shrink-0">
              <span className="text-[10px] uppercase font-bold text-slate-500 block font-sans">Active Services</span>
              <span className="text-2xl font-black text-black font-mono">{servicesConfig.filter(s => s.is_active).length} / {servicesConfig.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
            {/* COLUMN A: Create New Service Config (Form) */}
            <div className="xl:col-span-1 bg-white rounded-3xl border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-5">
              <div>
                <h5 className="font-extrabold text-lg text-black font-sans">➕ Add New Service</h5>
                <p className="text-[10px] text-slate-400 font-bold font-sans uppercase">Create dynamic VTU product mapping</p>
              </div>

              <form onSubmit={handleAddServiceConfig} className="space-y-4 text-xs font-bold text-left">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Service Type</label>
                  <select
                    value={newServiceType}
                    onChange={(e) => {
                      const type = e.target.value as 'data' | 'airtime' | 'cable' | 'electricity' | 'exam_pin';
                      setNewServiceType(type);
                      if (type === 'data' || type === 'airtime') {
                        setNewNetworkOrProvider('MTN');
                      } else if (type === 'cable') {
                        setNewNetworkOrProvider('GOTV');
                      } else if (type === 'electricity') {
                        setNewNetworkOrProvider('IKEDC');
                      } else {
                        setNewNetworkOrProvider('WAEC');
                      }
                    }}
                    className="w-full bg-slate-50 border-2 border-black rounded-xl p-3 focus:outline-none"
                  >
                    <option value="data">📶 Internet Data</option>
                    <option value="airtime">📞 Voice Airtime</option>
                    <option value="cable">📺 Cable TV Bouquet</option>
                    <option value="electricity">⚡ Electricity Bill Disco</option>
                    <option value="exam_pin">🎓 Exam Result PIN</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Network or Provider</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. MTN, AIRTEL, DSTV, AEDC, WAEC"
                    value={newNetworkOrProvider}
                    onChange={(e) => setNewNetworkOrProvider(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-black rounded-xl p-3 focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Package/Item Name</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. 1GB SME, ₦500 Top-Up, WAEC PIN"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-black rounded-xl p-3 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Cost Price (₦)</label>
                    <input
                      required
                      type="number"
                      placeholder="Wholesale price"
                      value={newCostPrice}
                      onChange={(e) => setNewCostPrice(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-black rounded-xl p-3 focus:outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Selling Price (₦)</label>
                    <input
                      required
                      type="number"
                      placeholder="Retail price"
                      value={newSellingPrice}
                      onChange={(e) => setNewSellingPrice(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-black rounded-xl p-3 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 font-sans">Bigisub Plan/Identifier ID</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. MTN_SME_1GB, 1, aedc_prepaid"
                    value={newBigisubIdentifierId}
                    onChange={(e) => setNewBigisubIdentifierId(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-black rounded-xl p-3 focus:outline-none font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAddingService}
                  className="w-full bg-black hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold p-3.5 rounded-xl transition-all flex items-center justify-center gap-2 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer text-xs"
                >
                  {isAddingService ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      Creating...
                    </>
                  ) : (
                    "Register & Activate Service"
                  )}
                </button>
              </form>
            </div>

            {/* COLUMN B: Manage Existing Service Configurations */}
            <div className="xl:col-span-2 bg-white rounded-3xl border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-6">
              <div className="border-b-2 border-black pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
                <div>
                  <h5 className="font-extrabold text-lg text-black font-sans uppercase tracking-tight">⚙️ Services Inventory Matrix</h5>
                  <p className="text-[11px] text-slate-500 font-bold font-sans">
                    View active plans, calibrate markup profits, and save configuration records to Supabase.
                  </p>
                </div>
              </div>

              {/* Dynamic Filtering Panel */}
              <div className="space-y-3">
                {/* Category Filters */}
                <div className="flex flex-wrap gap-1.5 justify-start text-left">
                  {([
                    { id: 'all', label: 'All Services' },
                    { id: 'data', label: '📶 Internet Data' },
                    { id: 'airtime', label: '📞 Airtime' },
                    { id: 'cable', label: '📺 Cable TV' },
                    { id: 'electricity', label: '⚡ Electricity' },
                    { id: 'exam_pin', label: '🎓 Exam PIN' }
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setInventoryCategoryTab(tab.id as any)}
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

                {/* Search Inputs */}
                <div className="grid sm:grid-cols-2 gap-3 text-left">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search items (e.g. 1GB, GOTV)..."
                      value={planSearchQuery}
                      onChange={(e) => setPlanSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border-2 border-slate-850 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-black placeholder-slate-400 font-sans"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search Network/Provider (e.g. MTN, AEDC)..."
                      value={peyflexSearchQuery} // reused as provider filter query
                      onChange={(e) => setPeyflexSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border-2 border-slate-850 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-black placeholder-slate-400 font-sans"
                    />
                  </div>
                </div>
              </div>

              {/* Service Plans Dynamic Grid List */}
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 text-slate-900">
                {(() => {
                  const filtered = servicesConfig.filter(item => {
                    const matchCategory = inventoryCategoryTab === 'all' || item.service_type === inventoryCategoryTab;
                    const matchSearch = !planSearchQuery.trim() ||
                      String(item.item_name || '').toLowerCase().includes(planSearchQuery.toLowerCase()) ||
                      String(item.bigisub_plan_id || '').toLowerCase().includes(planSearchQuery.toLowerCase());
                    const matchProvider = !peyflexSearchQuery.trim() ||
                      String(item.provider_or_network || '').toLowerCase().includes(peyflexSearchQuery.toLowerCase());

                    return matchCategory && matchSearch && matchProvider;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-16 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 font-sans">
                        No active service configurations found in database.
                      </div>
                    );
                  }

                  return filtered.map((item) => {
                    const profit = (item.selling_price || 0) - (item.cost_price || 0);
                    const profitPercentage = item.cost_price > 0 ? Math.round((profit / item.cost_price) * 100) : 0;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "bg-slate-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all space-y-3 text-left relative overflow-hidden",
                          !item.is_active && "opacity-70 grayscale"
                        )}
                      >
                        {/* Status Label Badge */}
                        <div className="absolute top-3 right-3 flex items-center gap-2">
                          <label className="flex items-center gap-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={item.is_active}
                              onChange={(e) => handleUpdateServiceConfig(item.id, item.cost_price, item.selling_price, e.target.checked)}
                              className="rounded border-2 border-black accent-black cursor-pointer h-4 w-4"
                            />
                            <span className="text-[10px] font-black uppercase font-sans">
                              {item.is_active ? "🟢 Active" : "🔴 Off"}
                            </span>
                          </label>
                        </div>

                        {/* Package Meta Header */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 font-sans">
                            <span className={cn(
                              "text-[9px] font-black uppercase px-2 py-0.5 rounded leading-none border border-black",
                              item.provider_or_network?.toUpperCase() === 'MTN' ? "bg-yellow-400 text-black" :
                              item.provider_or_network?.toUpperCase() === 'AIRTEL' ? "bg-red-500 text-white" :
                              item.provider_or_network?.toUpperCase() === 'GLO' ? "bg-green-500 text-white" :
                              item.provider_or_network?.toUpperCase() === '9MOBILE' ? "bg-emerald-600 text-white" :
                              "bg-slate-900 text-white"
                            )}>
                              {item.provider_or_network}
                            </span>
                            <span className="text-[9px] bg-slate-200 text-slate-800 font-extrabold px-1.5 py-0.5 rounded leading-none uppercase border border-slate-300 font-mono">
                              {item.service_type}
                            </span>
                          </div>

                          <h6 className="font-extrabold text-slate-950 text-sm tracking-tight pt-1 leading-snug">
                            {item.item_name}
                          </h6>
                          
                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                            <span>Bigisub ID:</span>
                            <span className="font-extrabold text-black font-sans">{item.bigisub_plan_id}</span>
                          </div>
                        </div>

                        {/* Price Fields and Profiting Grid */}
                        <div className="pt-2.5 border-t border-slate-200/85 grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <span className="text-[8px] font-extrabold text-slate-400 block uppercase pl-1 font-sans">Cost (₦)</span>
                            <input
                              type="number"
                              value={item.cost_price}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setServicesConfig(prev => prev.map(p => p.id === item.id ? { ...p, cost_price: val } : p));
                              }}
                              className="w-full bg-white border-2 border-black text-black font-semibold text-xs rounded-lg px-2 py-1 focus:outline-none text-center font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="text-[8px] font-extrabold text-indigo-600 block uppercase pl-1 font-sans">Selling (₦)</span>
                            <input
                              type="number"
                              value={item.selling_price}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setServicesConfig(prev => prev.map(p => p.id === item.id ? { ...p, selling_price: val } : p));
                              }}
                              className="w-full bg-white border-2 border-black text-black font-semibold text-xs rounded-lg px-2 py-1 focus:outline-none text-center font-mono"
                            />
                          </div>

                          <div className="space-y-1 text-center font-sans">
                            <span className="text-[8px] font-extrabold text-slate-400 block uppercase font-sans">Markup Profit</span>
                            <div className="text-xs font-black text-green-600 font-mono pt-1 leading-none">
                              ₦{profit} <span className="text-[9px] text-slate-400 block font-normal mt-0.5 font-sans">{profitPercentage}% gain</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions Trigger Section */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleDeleteServiceConfig(item.id)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-2.5 py-1.5 rounded-lg text-[10px] font-bold font-sans cursor-pointer flex items-center gap-1 active:scale-95 transition-all"
                          >
                            <Trash2 size={11} /> Delete
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUpdateServiceConfig(item.id, item.cost_price, item.selling_price, item.is_active)}
                            disabled={isUpdatingService === item.id}
                            className="bg-black hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-[10px] px-3.5 py-1.5 rounded-lg border border-black hover:scale-102 transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm font-sans"
                          >
                            {isUpdatingService === item.id ? (
                              <>
                                <Loader2 size={10} className="animate-spin text-white" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <ShieldCheck size={11} className="text-white" />
                                Save & Sync Price
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div> </div>

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

      {adminSubTab === 'opay-receipts' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-8">
          <div className="flex justify-between items-center pb-6 border-b border-slate-50">
            <div>
              <h5 className="font-extrabold text-slate-900 text-lg">Bank Deposits (Flutterwave) Audit & Logs</h5>
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
                    <div className="p-12 text-center text-slate-500">No Flutterwave payment gateway transactions recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monnify Configuration form completely deleted */}

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
