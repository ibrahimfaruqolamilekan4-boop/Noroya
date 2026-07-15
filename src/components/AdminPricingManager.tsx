/**
 * AdminPricingManager.tsx — v3 (complete rewrite)
 *
 * Bugs fixed vs previous version:
 *  1. publishAll skipped provider/bigisubPlanId/is_active from payload
 *  2. Batch-provider used un-controlled getElementById DOM hack → pure React state
 *  3. filtered variable used before declaration (TS compile error)
 *  4. Global markup "Apply" gave no feedback on what to do next
 *  5. "Publish X" button counted already-saved clean rows as pending
 *  6. Save single row didn't handle non-JSON error bodies → now catches gracefully
 *  7. loadExistingPrices had wrong property access (silent miss on mozosubs_plan_id)
 *  8. MTN has 4 service types — now has proper sub-tabs (SME/Gifting/Datashare/Awoof)
 *  9. publishAll ran sequentially (slow on 50+ plans) → parallel Promise.allSettled
 * 10. No way to enable/disable a plan → added per-row active toggle
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  RefreshCw, Save, DollarSign, CheckCircle, AlertTriangle,
  Loader2, Search, Eye, EyeOff, TrendingUp, Zap,
  BarChart2, Globe, Percent, ToggleLeft, ToggleRight, Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';

// ── Constants ──────────────────────────────────────────────────────────────────

const MOZOSUBZ_SERVICES = [
  { id: 'mtn_sme',        label: 'MTN SME',        network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'mtn_gifting',    label: 'MTN Gifting',    network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'mtn_datashare',  label: 'MTN Datashare',  network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
  { id: 'mtn_awoof',      label: 'MTN Awoof',      network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',   border: 'rgba(252,211,77,0.30)'   },
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
] as const;
type MtnSubTab = typeof MTN_SUBTABS[number]['id'];

type ServiceID = typeof MOZOSUBZ_SERVICES[number]['id'];

const PROVIDER_OPTIONS = [
  { value: 'mozosubz', label: 'Mozosubz' },
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

function deriveCategory(serviceId: string): string {
  if (serviceId.includes('sme'))       return 'SME';
  if (serviceId.includes('gifting'))   return 'GIFTING';
  if (serviceId.includes('datashare')) return 'DATASHARE';
  if (serviceId.includes('awoof'))     return 'AWOOF';
  return 'DATA';
}

const SERVICE_MAP = Object.fromEntries(MOZOSUBZ_SERVICES.map(s => [s.id, s]));

async function getSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Not authenticated — please log in again.');
  return data.session;
}

function isRowVisible(r: PricingRow, networkTab: NetworkTab, mtnSubTab: MtnSubTab, search: string): boolean {
  if (networkTab !== 'all' && r.network !== networkTab) return false;
  if (networkTab === 'MTN' && mtnSubTab !== 'all_mtn' && r.serviceId !== (mtnSubTab as string)) return false;
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
    plan_category:         deriveCategory(row.serviceId),
    validity_days:         parseValidity(row.name),
    mozosubz_plan_id:      row.planId,
    mozosubs_plan_id:      row.planId,
    mozosubz_service:      row.serviceId,
    provider:              row.provider,
    bigisub_identifier_id: row.provider === 'bigisub' ? row.bigisubPlanId : '',
    is_active:             row.isActive,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPricingManager() {
  const [rows,          setRows]          = useState<PricingRow[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [publishing,    setPublishing]    = useState(false);
  const [fetched,       setFetched]       = useState(false);
  const [networkTab,    setNetworkTab]    = useState<NetworkTab>('all');
  const [mtnSubTab,     setMtnSubTab]     = useState<MtnSubTab>('all_mtn');
  const [search,        setSearch]        = useState('');
  const [showCost,      setShowCost]      = useState(true);
  const [globalMarkup,  setGlobalMarkup]  = useState('10');
  const [batchProvider, setBatchProvider] = useState<ProviderSlug>('mozosubz');
  const [lastFetched,   setLastFetched]   = useState<Date | null>(null);

  // ── Load existing DB prices ────────────────────────────────────────────────
  const loadExistingPrices = useCallback(async () => {
    const { data, error } = await supabase
      .from('services_config')
      .select('mozosubz_plan_id, mozosubs_plan_id, bigisub_identifier_id, selling_price, cost_price, is_active, provider')
      .eq('service_type', 'data');

    if (error) console.warn('[loadExistingPrices]', error.message);

    const map: Record<string, { selling: number; cost: number; active: boolean; provider: string; bigisub_id: string }> = {};
    (data || []).forEach((r: any) => {
      const k = String(r.mozosubz_plan_id || r.mozosubs_plan_id || r.bigisub_identifier_id || '').trim();
      if (k) {
        map[k] = {
          selling:   Number(r.selling_price || 0),
          cost:      Number(r.cost_price    || 0),
          active:    r.is_active !== false,
          provider:  String(r.provider || 'mozosubz'),
          bigisub_id: String(r.bigisub_identifier_id || ''),
        };
      }
    });
    return map;
  }, []);

  // ── Fetch live plans ───────────────────────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const session = await getSession();
      const [res, existingPrices] = await Promise.all([
        fetch('/api/admin/fetch-mozosubz-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ fetchOnly: true }),
        }),
        loadExistingPrices(),
      ]);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      const plans: any[] = (data.plans || []).filter((p: any) => p.id && p.name && p.price > 0);

      if (!plans.length) {
        toast('No plans returned — check your MOZOSUBS_CONNECT_KEY is set in Vercel env vars.', { icon: '⚠️' });
        setFetched(true);
        return;
      }

      const defaultMarkup = parseFloat(globalMarkup) || 10;
      const newRows: PricingRow[] = plans.map((p: any) => {
        const existing = existingPrices[String(p.id)];
        const cost     = Number(p.price);
        let markup     = defaultMarkup;
        if (existing && existing.selling > 0 && existing.cost > 0) {
          markup = ((existing.selling - existing.cost) / existing.cost) * 100;
        }
        const svc = SERVICE_MAP[p.service] || MOZOSUBZ_SERVICES[0];
        return {
          planId:        String(p.id),
          serviceId:     p.service as ServiceID,
          network:       svc.network,
          name:          String(p.name),
          costPrice:     cost,
          markupPct:     Math.round(markup * 10) / 10,
          sellingPrice:  existing?.selling || calcSelling(cost, markup),
          saved:         !!existing?.selling,
          saving:        false,
          dirty:         false,
          provider:      (existing?.provider as ProviderSlug) || 'mozosubz',
          bigisubPlanId: existing?.bigisub_id || '',
          isActive:      existing?.active !== false,
        };
      });

      setRows(newRows);
      setFetched(true);
      setLastFetched(new Date());
      toast.success(`Loaded ${newRows.length} plans from Mozosubz`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  }, [globalMarkup, loadExistingPrices]);

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
    toast.success(`Set ${count} plans → ${batchProvider}`);
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
      const session = await getSession();
      const res = await fetch('/api/admin/create-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
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
      const session = await getSession();
      const results = await Promise.allSettled(
        targets.map(async row => {
          if (row.sellingPrice < row.costPrice) throw new Error('Price below cost');
          const res = await fetch('/api/admin/create-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
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
    NETWORK_TABS.forEach(t => { if (t.id !== 'all') c[t.id] = rows.filter(r => r.network === t.id).length; });
    return c;
  }, [rows]);

  const mtnSubCounts = useMemo(() => {
    const mtnRows = rows.filter(r => r.network === 'MTN');
    const c: Record<string, number> = { all_mtn: mtnRows.length };
    MTN_SUBTABS.forEach(t => { if (t.id !== 'all_mtn') c[t.id] = mtnRows.filter(r => r.serviceId === t.id).length; });
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
                <p className="text-xs text-slate-400">Mozosubz API → set markup → publish to user store</p>
              </div>
            </div>
            {lastFetched && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Last synced: {lastFetched.toLocaleTimeString('en-NG')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={fetchPlans} disabled={loading}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {loading ? 'Fetching…' : fetched ? 'Sync Plans' : 'Fetch Plans from Mozosubz'}
            </button>
            {fetched && pendingCount > 0 && (
              <button onClick={publishAll} disabled={publishing}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {publishing ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {publishing ? 'Publishing…' : `Publish ${pendingCount} to Store`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      {fetched && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            { label: 'Total Plans',  value: stats.total,                      icon: BarChart2,    color: 'text-indigo-400',  ring: 'ring-indigo-500/20'  },
            { label: 'Live in Store',value: stats.published,                  icon: CheckCircle,  color: 'text-emerald-400', ring: 'ring-emerald-500/20' },
            { label: 'Pending Push', value: stats.pending,                    icon: AlertTriangle,color: 'text-amber-400',   ring: 'ring-amber-500/20'   },
            { label: 'Avg Markup',   value: stats.avgMarkup.toFixed(1) + '%', icon: Percent,      color: 'text-sky-400',     ring: 'ring-sky-500/20'     },
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
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Provider for visible plans</label>
              <div className="flex items-center gap-2">
                <select value={batchProvider} onChange={e => setBatchProvider(e.target.value as ProviderSlug)}
                  className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={applyBatchProvider}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition border border-slate-600">
                  Apply
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
            Click "Fetch Plans" to pull live wholesale prices from Mozosubz and set your markup.
          </p>
          <button onClick={fetchPlans} disabled={loading}
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? 'Fetching…' : 'Fetch Plans from Mozosubz'}
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
          <div className={`grid gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-900/80 border-b border-slate-700/50`}
            style={{ gridTemplateColumns: showCost ? '2fr 1fr 1fr 1fr 1fr 1fr auto' : '2fr 1fr 1fr 1fr auto' }}>
            <span>Plan</span>
            {showCost && <span>Cost</span>}
            <span>Markup %</span>
            <span>Selling ₦</span>
            {showCost && <span>Profit/unit</span>}
            <span>Active</span>
            <span>Save</span>
          </div>

          {/* Plan rows */}
          <div className="divide-y divide-slate-700/30">
            {filtered.map(row => {
              const svc      = SERVICE_MAP[row.serviceId];
              const profit   = row.sellingPrice - row.costPrice;
              const belowCost = row.sellingPrice < row.costPrice;
              return (
                <div key={row.planId}
                  className={`grid gap-2 px-4 py-3 items-center hover:bg-slate-800/30 transition-colors ${row.dirty ? 'bg-amber-500/5' : ''}`}
                  style={{ gridTemplateColumns: showCost ? '2fr 1fr 1fr 1fr 1fr 1fr auto' : '2fr 1fr 1fr 1fr auto' }}>

                  {/* Plan identity */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: svc?.bg || 'rgba(99,102,241,0.1)', color: svc?.color || '#818cf8', border: `1px solid ${svc?.border || 'rgba(99,102,241,0.3)'}` }}>
                        {svc?.label || row.serviceId}
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
    </div>
  );
}
