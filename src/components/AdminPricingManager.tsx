/**
 * AdminPricingManager.tsx — Multi-Provider Plan & Pricing Manager
 * Supports Mozosubz and Nifex Data (https://nifexdataapp.com.ng)
 * Features:
 *  - Real-time API plan sync directly from upstream provider
 *  - Automated dead/removed plan pruning
 *  - Single-row and batch Save/Publish to live customer store
 *  - Per-row Delete Action ("delete clip" / trash)
 *  - Global & custom markup management
 *  - Provider switching (Mozosubz / Nifex Data)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  RefreshCw, Save, DollarSign, CheckCircle, AlertTriangle,
  Loader2, Search, Eye, EyeOff, TrendingUp, Zap,
  BarChart2, Globe, Percent, ToggleLeft, ToggleRight, Filter,
  Trash2, Layers, Key, ShieldCheck, Check, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';

// ── Constants ──────────────────────────────────────────────────────────────────

const MOZOSUBZ_SERVICES = [
  { id: 'mtn_sme',        label: 'MTN SME',        network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'mtn_gifting',    label: 'MTN Gifting',    network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'mtn_datashare',  label: 'MTN Datashare',  network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'mtn_awoof',      label: 'MTN Awoof',      network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'mtn_awoof2',     label: 'MTN Awoof 2',     network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'glo_sme',        label: 'GLO SME',        network: 'GLO',     color: '#4ADE80', bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.30)'  },
  { id: 'glo_data',       label: 'GLO Data',       network: 'GLO',     color: '#4ADE80', bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.30)'  },
  { id: 'airtel_sme',     label: 'Airtel SME',     network: 'Airtel',  color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)' },
  { id: 'airtel_gifting', label: 'Airtel Gifting', network: 'Airtel',  color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)' },
  { id: 'etisalat_data',  label: '9mobile Data',   network: '9mobile', color: '#2DD4BF', bg: 'rgba(45,212,191,0.10)', border: 'rgba(45,212,191,0.30)' },
] as const;

const NETWORK_TABS = [
  { id: 'all',     label: 'All',     color: '#818CF8', bg: 'rgba(129,140,248,0.10)', border: 'rgba(129,140,248,0.30)' },
  { id: 'MTN',     label: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',  border: 'rgba(252,211,77,0.30)'  },
  { id: 'GLO',     label: 'GLO',     color: '#4ADE80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.30)'  },
  { id: 'Airtel',  label: 'Airtel',  color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)' },
  { id: '9mobile', label: '9mobile', color: '#2DD4BF', bg: 'rgba(45,212,191,0.10)', border: 'rgba(45,212,191,0.30)' },
] as const;
type NetworkTab = typeof NETWORK_TABS[number]['id'];

const MTN_SUBTABS = [
  { id: 'all_mtn',       label: 'All MTN'    },
  { id: 'mtn_sme',       label: 'SME'        },
  { id: 'mtn_gifting',   label: 'Gifting'    },
  { id: 'mtn_datashare', label: 'Datashare'  },
  { id: 'mtn_awoof',     label: 'Awoof'      },
  { id: 'mtn_awoof2',    label: 'Awoof 2'    },
] as const;
type MtnSubTab = typeof MTN_SUBTABS[number]['id'];

type ServiceID = typeof MOZOSUBZ_SERVICES[number]['id'] | string;

const PROVIDER_OPTIONS = [
  { value: 'mozosubz', label: 'Mozosubz (mozosubz.xyz)' },
  { value: 'nifex',    label: 'Nifex Data (nifexdataapp.com.ng)' },
] as const;
type ProviderSlug = typeof PROVIDER_OPTIONS[number]['value'];

interface PricingRow {
  planId:        string;
  serviceId:     ServiceID;
  network:       string;
  name:          string;
  costPrice:     number;
  markupPct:     number;
  sellingPrice:  number;
  saved:         boolean;
  saving:        boolean;
  deleting?:     boolean;
  dirty:         boolean;
  provider:      ProviderSlug;
  bigisubPlanId: string;
  isActive:      boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

const calcSelling = (cost: number, pct: number) => Math.ceil(cost * (1 + pct / 100));

function parseValidity(name: string): string {
  const m = name.match(/(\d+)\s*(day|days|month|months|week|weeks|hr|hour|hours)/i);
  return m ? `${m[1]} ${m[2]}` : '30 Days';
}

function deriveCategory(serviceId: string, name?: string): string {
  const s = (serviceId + ' ' + (name || '')).toLowerCase();
  if (s.includes('sme'))       return 'SME';
  if (s.includes('cg') || s.includes('corporate')) return 'CG';
  if (s.includes('datashare')) return 'DATASHARE';
  if (s.includes('awoof'))     return 'AWOOF';
  if (s.includes('gifting'))   return 'GIFTING';
  return 'DATA';
}

const SERVICE_MAP = Object.fromEntries(MOZOSUBZ_SERVICES.map(s => [s.id, s]));

async function getSession() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  } catch (_) {
    return null;
  }
}

async function getAdminHeaders(): Promise<Record<string, string>> {
  try {
    const session = await getSession();
    const token = session?.access_token || '';
    const email = (session as any)?.user?.email || 'ibrahimfaruqolamilekan4@gmail.com';
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'x-admin-email': email
    };
  } catch (_) {
    return {
      'Content-Type': 'application/json',
      'x-admin-email': 'ibrahimfaruqolamilekan4@gmail.com'
    };
  }
}

function isRowVisible(r: PricingRow, networkTab: NetworkTab, mtnSubTab: MtnSubTab, search: string): boolean {
  if (networkTab !== 'all' && r.network.toUpperCase() !== networkTab.toUpperCase()) return false;
  if (networkTab.toUpperCase() === 'MTN' && mtnSubTab !== 'all_mtn') {
    const sub = mtnSubTab.toLowerCase().replace(/^mtn_/, '');
    const sId = String(r.serviceId || '').toLowerCase();
    const name = String(r.name || '').toLowerCase();
    if (!sId.includes(sub) && !name.includes(sub)) return false;
  }
  if (search) {
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.planId.toLowerCase().includes(q) || r.network.toLowerCase().includes(q);
  }
  return true;
}

function buildPayload(row: PricingRow) {
  return {
    id:                    row.planId,
    name:                  row.name,
    network:               row.network,
    service:               row.serviceId,
    type:                  'data',
    price:                 row.sellingPrice,
    cost_price:            row.costPrice,
    selling_price:         row.sellingPrice,
    retail_price:          row.sellingPrice,
    plan_category:         deriveCategory(row.serviceId, row.name),
    validity_days:         parseValidity(row.name),
    mozosubz_plan_id:      row.planId,
    mozosubs_plan_id:      row.planId,
    mozosubz_service:      row.serviceId,
    provider:              row.provider,
    bigisub_identifier_id: row.planId,
    bigisub_plan_id:       row.planId,
    is_active:             row.isActive,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPricingManager() {
  const [rows,            setRows]            = useState<PricingRow[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [publishing,      setPublishing]      = useState(false);
  const [fetched,         setFetched]         = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderSlug>('mozosubz');
  const [networkTab,      setNetworkTab]      = useState<NetworkTab>('all');
  const [mtnSubTab,       setMtnSubTab]       = useState<MtnSubTab>('all_mtn');
  const [search,          setSearch]          = useState('');
  const [showCost,        setShowCost]        = useState(true);
  const [globalMarkup,    setGlobalMarkup]    = useState('10');
  const [batchProvider,   setBatchProvider]   = useState<ProviderSlug>('mozosubz');
  const [lastFetched,     setLastFetched]     = useState<Date | null>(null);
  const [providerBalance, setProviderBalance] = useState<number | null>(null);
  const [isDeletingAll,   setIsDeletingAll]   = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'all';
    planId?: string;
    planName?: string;
  }>({
    isOpen: false,
    type: 'all'
  });
  const [isForceFetchingAll, setIsForceFetchingAll] = useState(false);

  // ── Provider API Key Management ───────────────────────────────────────────
  const [apiKeyInput,     setApiKeyInput]     = useState('');
  const [isTestingKey,    setIsTestingKey]    = useState(false);
  const [isSavingKey,     setIsSavingKey]     = useState(false);
  const [keyStatus,       setKeyStatus]       = useState<Record<string, { configured: boolean; masked: string | null }>>({});
  const [showKeyConfig,   setShowKeyConfig]   = useState(false);
  const [fetchWarning,    setFetchWarning]    = useState<string | null>(null);

  const loadKeyStatus = useCallback(async () => {
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/provider-secrets', { headers });
      if (res.ok) {
        const data = await res.json();
        setKeyStatus(data);
      }
    } catch (_) {}
  }, []);

  React.useEffect(() => {
    loadKeyStatus();
  }, [loadKeyStatus]);

  const handleDirectSaveKey = async (overrideKey?: string) => {
    const keyToSave = (overrideKey || apiKeyInput).trim();
    if (!keyToSave) {
      toast.error('Please enter an API key or Connect Key to save.');
      return;
    }
    setIsSavingKey(true);
    try {
      const headers = await getAdminHeaders();
      const identifier = selectedProvider === 'nifex' ? 'nifex_api_key' : 'mozosubz_api_key';
      const saveRes = await fetch('/api/admin/provider-secrets', {
        method: 'POST',
        headers,
        body: JSON.stringify({ identifier, secret: keyToSave })
      });
      if (!saveRes.ok) {
        const saveErr = await saveRes.json().catch(() => ({}));
        throw new Error(saveErr.error || 'Failed to save key');
      }

      toast.success(`🎉 Key for ${selectedProvider === 'nifex' ? 'Nifex Data' : 'Mozosubz'} saved and activated permanently!`);
      setApiKeyInput('');
      setFetchWarning(null);
      await loadKeyStatus();
      setShowKeyConfig(false);
      fetchPlans();
    } catch (err: any) {
      toast.error(`❌ Failed to save key: ${err.message || err}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestAndSaveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      toast.error('Please enter an API key or Connect Key to test and save.');
      return;
    }
    setIsTestingKey(true);
    try {
      const headers = await getAdminHeaders();
      // 1. Test key live with upstream provider
      const testRes = await fetch('/api/admin/test-provider-key', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider: selectedProvider, key: trimmed })
      });
      const testData = await testRes.json();
      if (!testRes.ok || !testData.success) {
        toast.error(`❌ Provider rejected key: ${testData.error || 'Invalid API key'}. You can still use 'Save Key' to store it.`);
        return;
      }

      // 2. Key is verified live! Save it permanently to server memory & Supabase
      await handleDirectSaveKey(trimmed);
    } catch (err: any) {
      toast.error(`❌ Verification failed: ${err.message || err}`);
    } finally {
      setIsTestingKey(false);
    }
  };

  // ── Load existing DB prices ────────────────────────────────────────────────
  const loadExistingPrices = useCallback(async () => {
    const { data, error } = await supabase
      .from('services_config')
      .select('id, mozosubz_plan_id, mozosubs_plan_id, bigisub_identifier_id, selling_price, cost_price, is_active, provider, item_name')
      .eq('service_type', 'data');

    if (error) console.warn('[loadExistingPrices]', error.message);

    const map: Record<string, { selling: number; cost: number; active: boolean; provider: string; bigisub_id: string; dbId: string }> = {};
    (data || []).forEach((r: any) => {
      const keys = [
        String(r.mozosubz_plan_id || '').trim(),
        String(r.mozosubs_plan_id || '').trim(),
        String(r.bigisub_identifier_id || '').trim(),
        String(r.id || '').trim(),
      ].filter(Boolean);

      const val = {
        selling:   Number(r.selling_price || 0),
        cost:      Number(r.cost_price    || 0),
        active:    r.is_active !== false,
        provider:  String(r.provider || 'mozosubz'),
        bigisub_id: String(r.bigisub_identifier_id || ''),
        dbId:       String(r.id || ''),
      };

      keys.forEach(k => { map[k] = val; });
    });
    return map;
  }, []);

  // ── Fetch live plans from selected provider ────────────────────────────────
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAdminHeaders();
      const endpoint = selectedProvider === 'nifex'
        ? '/api/admin/fetch-nifex-plans'
        : '/api/admin/fetch-mozosubz-plans';

      const [res, existingPrices] = await Promise.all([
        fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fetchOnly: true }),
        }),
        loadExistingPrices(),
      ]);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (data.warning) {
        setFetchWarning(data.warning);
        toast(data.warning, { icon: '⚠️', duration: 7000 });
      } else {
        setFetchWarning(null);
      }
      if (data.balance !== undefined && data.balance !== null) {
        setProviderBalance(Number(data.balance));
      }

      const plans: any[] = (data.plans || []).filter((p: any) => (p.id || p.plan_id) && p.name && p.price > 0);

      if (!plans.length) {
        toast(`No plans returned from ${selectedProvider === 'nifex' ? 'Nifex Data' : 'Mozosubz'} — check your API token.`, { icon: '⚠️' });
        setFetched(true);
        return;
      }

      const defaultMarkup = parseFloat(globalMarkup) || 10;
      const newRows: PricingRow[] = plans.map((p: any) => {
        const planKey = String(p.id || p.plan_id);
        const existing = existingPrices[planKey] || existingPrices[String(p.plan_id)] || existingPrices[`${p.service}_${p.id}`];
        const cost     = Number(p.price);
        let markup     = defaultMarkup;
        if (existing && existing.selling > 0 && existing.cost > 0) {
          markup = ((existing.selling - existing.cost) / existing.cost) * 100;
        }
        const svc = SERVICE_MAP[p.service] || {
          id: p.service || 'custom',
          label: `${p.network} ${p.plan_type || 'Data'}`,
          network: p.network,
          color: '#818CF8',
          bg: 'rgba(129,140,248,0.10)',
          border: 'rgba(129,140,248,0.30)',
        };

        return {
          planId:        planKey,
          serviceId:     p.service as ServiceID,
          network:       p.network || svc.network,
          name:          String(p.name),
          costPrice:     cost,
          markupPct:     Math.round(markup * 10) / 10,
          sellingPrice:  existing?.selling || calcSelling(cost, markup),
          saved:         !!existing?.selling,
          saving:        false,
          dirty:         false,
          provider:      (p.provider || existing?.provider || selectedProvider) as ProviderSlug,
          bigisubPlanId: existing?.bigisub_id || planKey,
          isActive:      existing?.active !== false,
        };
      });

      setRows(newRows);
      setFetched(true);
      setLastFetched(new Date());
      toast.success(`Loaded ${newRows.length} live plans from ${selectedProvider === 'nifex' ? 'Nifex Data' : 'Mozosubz'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  }, [selectedProvider, globalMarkup, loadExistingPrices]);

  // ── Row mutations ──────────────────────────────────────────────────────────
  const updateMarkup = useCallback((planId: string, pct: number) => {
    setRows(prev => prev.map(r =>
      r.planId !== planId ? r : { ...r, markupPct: pct, sellingPrice: calcSelling(r.costPrice, pct), dirty: true }
    ));
  }, []);

  const updateSelling = useCallback((planId: string, val: number) => {
    setRows(prev => prev.map(r => {
      if (r.planId !== planId) return r;
      const pct = r.costPrice > 0 ? ((val - r.costPrice) / r.costPrice) * 100 : 0;
      return { ...r, sellingPrice: val, markupPct: Math.round(pct * 10) / 10, dirty: true };
    }));
  }, []);

  const toggleActive = useCallback((planId: string) => {
    setRows(prev => prev.map(r =>
      r.planId !== planId ? r : { ...r, isActive: !r.isActive, dirty: true }
    ));
  }, []);

  // ── Trigger In-App Confirmation Modal (NO window.confirm blocking) ──────────
  const deleteRow = useCallback((planId: string) => {
    const row = rows.find(r => String(r.planId) === String(planId));
    setDeleteConfirmModal({
      isOpen: true,
      type: 'single',
      planId: String(planId),
      planName: row?.name || 'Selected Plan'
    });
  }, [rows]);

  const deleteAllPlans = useCallback(() => {
    setDeleteConfirmModal({
      isOpen: true,
      type: 'all'
    });
  }, []);

  // ── Executed when user confirms inside the modal ──────────────────────────
  const handleExecuteConfirmedDelete = useCallback(async () => {
    if (deleteConfirmModal.type === 'all') {
      setIsDeletingAll(true);
      try {
        const headers = await getAdminHeaders();

        // 1. Backend delete endpoint
        const res = await fetch('/api/admin/delete-all-plans', {
          method: 'POST',
          headers,
          body: JSON.stringify({ serviceType: 'data' })
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error || 'Server failed to delete all plans');
        }

        // 2. Direct Supabase fallback to guarantee complete clean database
        try {
          await supabase.from('services_config').delete().eq('service_type', 'data');
        } catch (_) {}
        try {
          await supabase.from('services_config').delete().ilike('service_type', 'data');
        } catch (_) {}
        try {
          await supabase.from('services_config').delete().or('provider.eq.mozosubz,provider.eq.nifex');
        } catch (_) {}
        try {
          await supabase.from('data_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (_) {}

        setRows([]);
        setFetched(false);
        setDeleteConfirmModal({ isOpen: false, type: 'all' });
        window.dispatchEvent(new CustomEvent('plans-updated'));
        toast.success('🗑️ All data plans deleted successfully! You can now fetch fresh plans or add a new plan.');
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete all plans');
      } finally {
        setIsDeletingAll(false);
      }
    } else if (deleteConfirmModal.type === 'single' && deleteConfirmModal.planId) {
      const planId = deleteConfirmModal.planId;
      const planName = deleteConfirmModal.planName;

      // Remove from table immediately
      setRows(prev => prev.filter(r => String(r.planId) !== String(planId)));
      setDeleteConfirmModal({ isOpen: false, type: 'all' });

      try {
        const headers = await getAdminHeaders();
        const res = await fetch('/api/admin/delete-plan', {
          method: 'POST',
          headers,
          body: JSON.stringify({ id: planId, name: planName, collectionName: 'services_config' }),
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error || 'Failed to delete plan from server');
        }

        // Direct Supabase fallback
        if (planName) {
          try { await supabase.from('services_config').delete().eq('item_name', planName); } catch (_) {}
        }
        try { await supabase.from('services_config').delete().eq('bigisub_identifier_id', planId); } catch (_) {}
        try { await supabase.from('services_config').delete().eq('mozosubz_plan_id', planId); } catch (_) {}

        window.dispatchEvent(new CustomEvent('plans-updated'));
        toast.success(`🗑️ Deleted "${planName || 'plan'}" successfully`);
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete plan');
      }
    }
  }, [deleteConfirmModal]);

  // ── Force Fetch All Plans from ALL Providers (Mozosubz + Nifex) ─────────────
  const forceFetchAllProviders = useCallback(async (autoPublish = false) => {
    setIsForceFetchingAll(true);
    setLoading(true);
    try {
      const headers = await getAdminHeaders();
      const [res, existingPrices] = await Promise.all([
        fetch('/api/admin/fetch-all-providers-plans', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            autoPublish,
            defaultMarkup: parseFloat(globalMarkup) || 10
          })
        }),
        loadExistingPrices(),
      ]);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to force fetch from providers');
      }

      const plans: any[] = (data.plans || []).filter((p: any) => (p.id || p.plan_id) && p.name && p.price > 0);
      if (!plans.length) {
        toast('No active plans returned across providers — check your provider keys.', { icon: '⚠️' });
        setFetched(true);
        return;
      }

      const defaultMarkup = parseFloat(globalMarkup) || 10;
      const newRows: PricingRow[] = plans.map((p: any) => {
        const planKey = String(p.id || p.plan_id);
        const existing = existingPrices[planKey] || existingPrices[String(p.plan_id)] || existingPrices[`${p.service}_${p.id}`];
        const cost     = Number(p.price);
        let markup     = defaultMarkup;
        if (existing && existing.selling > 0 && existing.cost > 0) {
          markup = ((existing.selling - existing.cost) / existing.cost) * 100;
        }
        const svc = SERVICE_MAP[p.service] || {
          id: p.service || 'custom',
          label: `${p.network} ${p.plan_type || 'Data'}`,
          network: p.network,
          color: '#818CF8',
          bg: 'rgba(129,140,248,0.10)',
          border: 'rgba(129,140,248,0.30)',
        };

        return {
          planId:        planKey,
          serviceId:     p.service as ServiceID,
          network:       p.network || svc.network,
          name:          String(p.name),
          costPrice:     cost,
          markupPct:     Math.round(markup * 10) / 10,
          sellingPrice:  existing?.selling || calcSelling(cost, markup),
          saved:         autoPublish || !!existing?.selling,
          saving:        false,
          dirty:         false,
          provider:      (p.provider || existing?.provider || 'mozosubz') as ProviderSlug,
          bigisubPlanId: existing?.bigisub_id || planKey,
          isActive:      existing?.active !== false,
        };
      });

      setRows(newRows);
      setFetched(true);
      setLastFetched(new Date());

      if (autoPublish) {
        toast.success(`🎉 Force-fetched & published ${data.publishedCount || newRows.length} plans directly to store!`);
      } else {
        toast.success(`🚀 Force-fetched ${newRows.length} live plans from ALL providers (Mozosubz & Nifex)!`);
      }
      window.dispatchEvent(new CustomEvent('plans-updated'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to force fetch plans');
    } finally {
      setIsForceFetchingAll(false);
      setLoading(false);
    }
  }, [globalMarkup, loadExistingPrices]);

  // ── Apply global markup ────────────────────────────────────────────────────
  const applyGlobalMarkup = useCallback(() => {
    const pct = parseFloat(globalMarkup);
    if (isNaN(pct) || pct < 0) { toast.error('Enter a valid markup %'); return; }
    let count = 0;
    setRows(prev => prev.map(r => {
      if (!isRowVisible(r, networkTab, mtnSubTab, search)) return r;
      count++;
      return { ...r, markupPct: pct, sellingPrice: calcSelling(r.costPrice, pct), dirty: true };
    }));
    toast.success(`Applied ${pct}% to ${count} plans — hit "Publish All" to save`);
  }, [globalMarkup, networkTab, mtnSubTab, search]);

  // ── Apply batch provider ───────────────────────────────────────────────────
  const applyBatchProvider = useCallback(() => {
    let count = 0;
    setRows(prev => prev.map(r => {
      if (!isRowVisible(r, networkTab, mtnSubTab, search)) return r;
      count++;
      return { ...r, provider: batchProvider, dirty: true };
    }));
    toast.success(`Set ${count} plans → ${batchProvider === 'nifex' ? 'Nifex Data' : 'Mozosubz'}`);
  }, [batchProvider, networkTab, mtnSubTab, search]);

  // ── Save single row ────────────────────────────────────────────────────────
  const publishRow = useCallback(async (planId: string) => {
    const row = rows.find(r => r.planId === planId);
    if (!row) return;
    if (row.sellingPrice < row.costPrice) {
      toast.error(`Selling price (${fmt(row.sellingPrice)}) is below cost (${fmt(row.costPrice)})`);
      return;
    }
    setRows(prev => prev.map(r => r.planId === planId ? { ...r, saving: true } : r));
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/create-plan', {
        method: 'POST',
        headers,
        body: JSON.stringify(buildPayload(row)),
      });
      let resData: any = {};
      try { resData = await res.json(); } catch { /**/ }
      if (!res.ok) throw new Error(resData?.error || resData?.message || `Server error ${res.status}`);
      setRows(prev => prev.map(r => r.planId === planId ? { ...r, saved: true, saving: false, dirty: false } : r));
      toast.success(`✅ "${row.name}" saved to store`);
    } catch (err: any) {
      setRows(prev => prev.map(r => r.planId === planId ? { ...r, saving: false } : r));
      toast.error(err.message || 'Save failed');
    }
  }, [rows]);

  // ── Publish ALL visible unsaved/dirty rows in parallel ─────────────────────
  const publishAll = useCallback(async () => {
    const targets = rows.filter(r => (r.dirty || !r.saved) && isRowVisible(r, networkTab, mtnSubTab, search));
    if (!targets.length) { toast('No unsaved plans in current view'); return; }

    setPublishing(true);
    setRows(prev => prev.map(r => targets.find(t => t.planId === r.planId) ? { ...r, saving: true } : r));

    let ok = 0, fail = 0;
    try {
      const headers = await getAdminHeaders();
      const results = await Promise.allSettled(
        targets.map(async row => {
          if (row.sellingPrice < row.costPrice) throw new Error('Price below cost');
          const res = await fetch('/api/admin/create-plan', {
            method: 'POST',
            headers,
            body: JSON.stringify(buildPayload(row)),
          });
          let resData: any = {};
          try { resData = await res.json(); } catch { /**/ }
          if (!res.ok) throw new Error(resData?.error || `Error ${res.status}`);
          return row.planId;
        })
      );

      const successIds = new Set<string>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') { ok++; successIds.add(targets[i].planId); }
        else { fail++; console.warn('[publishAll fail]', targets[i].name, (r as any).reason?.message); }
      });

      setRows(prev => prev.map(r => {
        if (successIds.has(r.planId)) return { ...r, saved: true, saving: false, dirty: false };
        if (targets.find(t => t.planId === r.planId)) return { ...r, saving: false };
        return r;
      }));
    } catch (err: any) {
      setRows(prev => prev.map(r => ({ ...r, saving: false })));
      toast.error(err.message || 'Publish failed');
      setPublishing(false);
      return;
    }

    setPublishing(false);
    if (ok)   toast.success(`✅ Published ${ok} plan${ok !== 1 ? 's' : ''} to store`);
    if (fail) toast.error(`${fail} plan${fail !== 1 ? 's' : ''} failed — check selling prices`);
  }, [rows, networkTab, mtnSubTab, search]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const filtered = useMemo(
    () => rows.filter(r => isRowVisible(r, networkTab, mtnSubTab, search)),
    [rows, networkTab, mtnSubTab, search]
  );

  const stats = useMemo(() => ({
    total:     rows.length,
    published: rows.filter(r => r.saved && !r.dirty).length,
    pending:   rows.filter(r => !r.saved || r.dirty).length,
    avgMarkup: rows.length ? rows.reduce((a, r) => a + r.markupPct, 0) / rows.length : 0,
  }), [rows]);

  const pendingCount = useMemo(
    () => filtered.filter(r => r.dirty || !r.saved).length,
    [filtered]
  );

  const netCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    NETWORK_TABS.forEach(t => {
      if (t.id !== 'all') {
        c[t.id] = rows.filter(r => r.network.toUpperCase() === t.id.toUpperCase()).length;
      }
    });
    return c;
  }, [rows]);

  const mtnSubCounts = useMemo(() => {
    const mtnRows = rows.filter(r => r.network.toUpperCase() === 'MTN');
    const c: Record<string, number> = { all_mtn: mtnRows.length };
    MTN_SUBTABS.forEach(t => {
      if (t.id !== 'all_mtn') {
        const sub = t.id.toLowerCase().replace(/^mtn_/, '');
        c[t.id] = mtnRows.filter(r => {
          const sId = String(r.serviceId || '').toLowerCase();
          const name = String(r.name || '').toLowerCase();
          return sId.includes(sub) || name.includes(sub);
        }).length;
      }
    });
    return c;
  }, [rows]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 text-slate-100">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_60%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/30">
                <DollarSign size={20} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Plan Pricing Manager</h2>
                <p className="text-xs text-slate-400">
                  Live API Wholesale → Markup Manager → Direct Store Deployment
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-slate-400">
              {lastFetched && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Synced: {lastFetched.toLocaleTimeString('en-NG')}
                </span>
              )}
              {providerBalance !== null && (
                <span className="bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 px-2 py-0.5 rounded-md font-mono font-semibold">
                  API Balance: {fmt(providerBalance)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Provider Selector */}
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl p-1">
              <Layers size={14} className="text-slate-400 ml-2 mr-1" />
              <select
                value={selectedProvider}
                onChange={e => setSelectedProvider(e.target.value as ProviderSlug)}
                className="bg-transparent text-xs font-semibold text-white px-2 py-1.5 focus:outline-none cursor-pointer">
                {PROVIDER_OPTIONS.map(p => (
                  <option key={p.value} value={p.value} className="bg-slate-900 text-white">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Status / Config Toggle */}
            <button
              onClick={() => setShowKeyConfig(prev => !prev)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition cursor-pointer ${
                keyStatus[selectedProvider]?.configured
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 hover:bg-emerald-900/40'
                  : 'bg-amber-950/40 text-amber-300 border-amber-800/40 hover:bg-amber-900/40 animate-pulse'
              }`}>
              <Key size={13} />
              <span>
                {selectedProvider === 'nifex' ? 'Nifex Token' : 'Mozosubz Connect Key'}:{' '}
                {keyStatus[selectedProvider]?.configured ? (keyStatus[selectedProvider]?.masked || 'Active') : 'Configure Key'}
              </span>
              {showKeyConfig ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            <button onClick={fetchPlans} disabled={loading}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {loading ? 'Fetching…' : fetched ? 'Sync Live Plans' : `Fetch from ${selectedProvider === 'nifex' ? 'Nifex Data' : 'Mozosubz'}`}
            </button>

            {fetched && pendingCount > 0 && (
              <button onClick={publishAll} disabled={publishing}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {publishing ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {publishing ? 'Publishing…' : `Publish ${pendingCount} to Store`}
              </button>
            )}
          </div>
        </div>

        {/* Live Provider API Key Configurator Drawer */}
        {(showKeyConfig || (keyStatus[selectedProvider] && !keyStatus[selectedProvider].configured)) && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 rounded-2xl bg-slate-900/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key size={15} className="text-indigo-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Live {selectedProvider === 'nifex' ? 'Nifex Data Token' : 'Mozosubz Connect Key'} Setup
                </h4>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  keyStatus[selectedProvider]?.configured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {keyStatus[selectedProvider]?.configured ? 'Connected' : 'Key Missing'}
                </span>
              </div>
              <button
                onClick={() => setShowKeyConfig(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1">
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              {selectedProvider === 'nifex'
                ? 'Enter your API token from nifexdataapp.com.ng (Profile / API Settings). Live validation will check your live account balance.'
                : 'Enter your Connect Key from mozosubz.xyz (starts with "connect_..."). We test it live with Mozosubz and save it permanently.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder={selectedProvider === 'nifex' ? 'Paste your Nifex API token…' : 'Paste your Mozosubz Connect Key (e.g. connect_...)'}
                className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => handleDirectSaveKey()}
                disabled={isSavingKey || isTestingKey || !apiKeyInput.trim()}
                className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {isSavingKey ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {isSavingKey ? 'Saving…' : 'Save Key'}
              </button>
              <button
                onClick={handleTestAndSaveKey}
                disabled={isTestingKey || isSavingKey || !apiKeyInput.trim()}
                className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {isTestingKey ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                {isTestingKey ? 'Testing…' : 'Test Live'}
              </button>
            </div>
          </div>
        )}

        {/* Plan Maintenance & Danger Zone Panel */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 rounded-xl bg-slate-900/60 border border-slate-800 p-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles size={14} className="text-indigo-400" />
                Multi-Provider Synchronization & Plan Maintenance
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Force fetch all data plans from both Mozosubz and Nifex Data at once, or wipe all plans to re-sync cleanly without duplicates.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* Force Fetch Both Providers */}
              <button
                type="button"
                onClick={() => forceFetchAllProviders(false)}
                disabled={isForceFetchingAll || loading}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md disabled:opacity-50 transition cursor-pointer border border-indigo-400/30"
              >
                {isForceFetchingAll ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>{isForceFetchingAll ? "Force Fetching..." : "Force Fetch All Providers"}</span>
              </button>

              {/* Force Sync & Publish Directly */}
              <button
                type="button"
                onClick={() => forceFetchAllProviders(true)}
                disabled={isForceFetchingAll || loading}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md disabled:opacity-50 transition cursor-pointer border border-emerald-400/30"
              >
                {isForceFetchingAll ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                <span>Force Sync & Publish Live</span>
              </button>

              {/* Delete All Data Plans */}
              <button
                type="button"
                onClick={deleteAllPlans}
                disabled={isDeletingAll}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 hover:border-red-600 shadow-md disabled:opacity-50 transition cursor-pointer"
              >
                {isDeletingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>{isDeletingAll ? "Deleting All..." : "Delete All Plans"}</span>
              </button>
            </div>
          </div>
        </div>

        {fetchWarning && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <span>{fetchWarning}</span>
            </div>
            <button
              onClick={() => setShowKeyConfig(true)}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline shrink-0 cursor-pointer">
              Configure Key
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      {fetched && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            { label: 'Total Plans',   value: stats.total,                      icon: BarChart2,    color: 'text-indigo-400',  ring: 'ring-indigo-500/20'  },
            { label: 'Live in Store', value: stats.published,                  icon: CheckCircle,  color: 'text-emerald-400', ring: 'ring-emerald-500/20' },
            { label: 'Pending Push',  value: stats.pending,                    icon: AlertTriangle,color: 'text-amber-400',   ring: 'ring-amber-500/20'   },
            { label: 'Avg Markup',    value: stats.avgMarkup.toFixed(1) + '%', icon: Percent,      color: 'text-sky-400',     ring: 'ring-sky-500/20'     },
          ] as const).map(({ label, value, icon: Icon, color, ring }) => (
            <div key={label} className={`rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 ring-1 ${ring}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400 font-medium">{label}</span>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-slate-800">
                  <Icon size={13} className={color} />
                </div>
              </div>
              <span className={`text-2xl font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      {fetched && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Global Markup */}
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Global Markup %</label>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <input type="number" min={0} step={0.5} value={globalMarkup}
                    onChange={e => setGlobalMarkup(e.target.value)}
                    className="w-20 bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                </div>
                <button onClick={applyGlobalMarkup}
                  className="px-4 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-sm font-medium transition border border-indigo-500/30">
                  Apply to view
                </button>
                <div className="hidden sm:flex items-center gap-1.5">
                  {[5, 8, 10, 15, 20].map(p => (
                    <button key={p} onClick={() => setGlobalMarkup(String(p))}
                      className={`px-2 py-1 rounded-md text-xs font-semibold border transition ${
                        globalMarkup === String(p)
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white'}`}>
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Batch Provider */}
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Fulfillment Provider</label>
              <div className="flex items-center gap-2">
                <select value={batchProvider} onChange={e => setBatchProvider(e.target.value as ProviderSlug)}
                  className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={applyBatchProvider}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition border border-slate-600">
                  Apply to view
                </button>
              </div>
            </div>

            {/* Search + cost toggle */}
            <div className="flex items-center gap-3 ml-auto">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plans…"
                  className="pl-8 pr-3 py-2 bg-slate-800 border border-slate-600 text-white text-sm rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:w-56 transition-all" />
              </div>
              <button onClick={() => setShowCost(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-400 hover:text-white text-xs transition">
                {showCost ? <EyeOff size={13} /> : <Eye size={13} />}
                {showCost ? 'Hide cost' : 'Show cost'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Network Tabs */}
      {fetched && (
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-none">
          {NETWORK_TABS.map(tab => (
            <button key={tab.id}
              onClick={() => { setNetworkTab(tab.id); setMtnSubTab('all_mtn'); }}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border"
              style={networkTab === tab.id
                ? { background: tab.bg, borderColor: tab.border, color: tab.color, boxShadow: `0 4px 15px ${tab.color}25` }
                : { background: 'rgba(30,41,59,0.6)', borderColor: 'rgba(51,65,85,0.6)', color: '#94a3b8' }
              }>
              {tab.id === 'all' ? <Globe size={12} /> : <span className="w-2 h-2 rounded-full" style={{ background: tab.color }} />}
              {tab.label}
              <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold"
                style={networkTab === tab.id ? { background: 'rgba(255,255,255,0.15)' } : { background: 'rgba(51,65,85,0.8)', color: '#94a3b8' }}>
                {netCounts[tab.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* MTN Sub-Tabs */}
      {fetched && networkTab === 'MTN' && (
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-none pl-2">
          <Filter size={12} className="text-slate-500 self-center flex-shrink-0 mr-1" />
          <span className="text-xs text-slate-500 self-center flex-shrink-0 mr-1">MTN Plans:</span>
          {MTN_SUBTABS.map(tab => (
            <button key={tab.id} onClick={() => setMtnSubTab(tab.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                mtnSubTab === tab.id
                  ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}>
              {tab.label}
              <span className={`text-[10px] rounded-full px-1.5 font-bold ${mtnSubTab === tab.id ? 'bg-yellow-500/25 text-yellow-300' : 'bg-slate-700 text-slate-400'}`}>
                {mtnSubCounts[tab.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!fetched && (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-slate-700 bg-slate-900/30">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
            <TrendingUp size={28} className="text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No plans loaded yet</h3>
          <p className="text-sm text-slate-400 text-center max-w-xs mb-6">
            Click "Fetch Plans" to pull live wholesale prices directly from {selectedProvider === 'nifex' ? 'Nifex Data' : 'Mozosubz'} and set your markup.
          </p>
          <button onClick={fetchPlans} disabled={loading}
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? 'Fetching…' : `Fetch Plans from ${selectedProvider === 'nifex' ? 'Nifex Data' : 'Mozosubz'}`}
          </button>
        </div>
      )}

      {/* No results after filter */}
      {fetched && filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">No plans match your current filters.</div>
      )}

      {/* Plans Table */}
      {fetched && filtered.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
          {/* Header row */}
          <div className="grid gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-900/80 border-b border-slate-700/50"
            style={{ gridTemplateColumns: showCost ? '2.5fr 1fr 1fr 1fr 1fr 1fr auto auto' : '2.5fr 1fr 1fr 1fr auto auto' }}>
            <span>Plan</span>
            {showCost && <span>Cost</span>}
            <span>Markup %</span>
            <span>Selling ₦</span>
            {showCost && <span>Profit/unit</span>}
            <span>Active</span>
            <span>Save</span>
            <span>Action</span>
          </div>

          {/* Plan rows */}
          <div className="divide-y divide-slate-700/30">
            {filtered.map(row => {
              const svc       = SERVICE_MAP[row.serviceId];
              const profit    = row.sellingPrice - row.costPrice;
              const belowCost = row.sellingPrice < row.costPrice;
              return (
                <div key={row.planId}
                  className={`grid gap-2 px-4 py-3 items-center hover:bg-slate-800/30 transition-colors ${row.dirty ? 'bg-amber-500/5' : ''}`}
                  style={{ gridTemplateColumns: showCost ? '2.5fr 1fr 1fr 1fr 1fr 1fr auto auto' : '2.5fr 1fr 1fr 1fr auto auto' }}>

                  {/* Plan identity */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: svc?.bg || 'rgba(99,102,241,0.1)', color: svc?.color || '#818cf8', border: `1px solid ${svc?.border || 'rgba(99,102,241,0.3)'}` }}>
                        {svc?.label || row.serviceId}
                      </span>
                      <span className="text-[9px] bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded-md font-mono">
                        {row.provider === 'nifex' ? 'Nifex' : 'Mozosubz'}
                      </span>
                      {row.dirty && <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-md font-bold">UNSAVED</span>}
                      {row.saved && !row.dirty && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-md font-bold">LIVE</span>}
                    </div>
                    <p className="text-sm text-white font-medium truncate">{row.name}</p>
                    <p className="text-[10px] text-slate-500">ID: {row.planId} · {parseValidity(row.name)}</p>
                  </div>

                  {/* Cost price */}
                  {showCost && <span className="text-sm text-slate-400 font-mono">{fmt(row.costPrice)}</span>}

                  {/* Markup % */}
                  <div className="relative">
                    <input type="number" min={0} step={0.5} value={row.markupPct}
                      onChange={e => updateMarkup(row.planId, parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-2 py-1.5 pr-5 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                  </div>

                  {/* Selling price */}
                  <div>
                    <input type="number" min={0} value={row.sellingPrice}
                      onChange={e => updateSelling(row.planId, parseFloat(e.target.value) || 0)}
                      className={`w-full bg-slate-800 border text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${belowCost ? 'border-red-500 text-red-400' : 'border-slate-600 text-white'}`} />
                    {belowCost && <p className="text-[9px] text-red-400 mt-0.5">Below cost!</p>}
                  </div>

                  {/* Profit */}
                  {showCost && (
                    <span className={`text-sm font-mono font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {profit >= 0 ? '+' : ''}{fmt(profit)}
                    </span>
                  )}

                  {/* Active toggle */}
                  <button onClick={() => toggleActive(row.planId)} title={row.isActive ? 'Click to disable' : 'Click to enable'}
                    className="flex items-center gap-1 text-xs transition">
                    {row.isActive ? <ToggleRight size={22} className="text-emerald-400" /> : <ToggleLeft size={22} className="text-slate-500" />}
                    <span className={row.isActive ? 'text-emerald-400 text-[10px]' : 'text-slate-500 text-[10px]'}>
                      {row.isActive ? 'On' : 'Off'}
                    </span>
                  </button>

                  {/* Save button */}
                  <button onClick={() => publishRow(row.planId)} disabled={row.saving || belowCost}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition disabled:opacity-40 disabled:cursor-not-allowed ${
                      row.saved && !row.dirty
                        ? 'border-slate-600 bg-slate-800 text-slate-400 hover:text-white'
                        : 'border-indigo-500/40 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40'}`}>
                    {row.saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    {row.saving ? 'Saving…' : row.saved && !row.dirty ? 'Update' : 'Save'}
                  </button>

                  {/* Delete button ("Delete Clip") */}
                  <button
                    onClick={() => deleteRow(row.planId)}
                    disabled={row.deleting}
                    title="Delete unnecessary plan"
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/30 transition disabled:opacity-40">
                    {row.deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-900/80 border-t border-slate-700/50 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing {filtered.length} of {rows.length} plans
              {pendingCount > 0 && <span className="text-amber-400 ml-2">· {pendingCount} unsaved</span>}
            </span>
            {pendingCount > 0 && (
              <button onClick={publishAll} disabled={publishing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition disabled:opacity-50">
                {publishing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {publishing ? 'Publishing…' : `Publish ${pendingCount} changes`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── In-App Deletion Confirmation Modal (Smooth & Reliable) ── */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 text-left">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center text-xl shrink-0">
                <Trash2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white">
                  {deleteConfirmModal.type === 'all' ? 'Delete ALL Data Plans?' : 'Delete Plan?'}
                </h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  {deleteConfirmModal.type === 'all'
                    ? 'This will permanently remove all data plans from your database. You can then immediately click "Force Sync & Publish Live" or "Force Fetch All Providers" to load clean, fresh plans from Mozosubz and Nifex Data.'
                    : `Are you sure you want to delete "${deleteConfirmModal.planName}" from your store and database?`}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-semibold">
              ⚠️ Permanent action: Any selected plans will be purged completely.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmModal({ isOpen: false, type: 'all' })}
                disabled={isDeletingAll}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteConfirmedDelete}
                disabled={isDeletingAll}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
              >
                {isDeletingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{isDeletingAll ? 'Deleting All...' : 'Yes, Delete Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
