/**
 * AdminPricingManager.tsx
 * Live Plan Pricing Manager — fetches from Mozosubz API, lets admin
 * set markup per plan or globally, then publishes to services_config.
 *
 * Data flow:
 *   Mozosubz API → backend /api/admin/fetch-mozosubz-plans
 *     → admin sets markup → /api/admin/publish-plans
 *       → services_config table → /api/services/data → user data page
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  RefreshCw, Save, DollarSign, CheckCircle, AlertTriangle,
  Loader2, Search, Eye, EyeOff, TrendingUp, Zap,
  ChevronDown, BarChart2, Globe, Settings, Percent
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';

// ── Constants ─────────────────────────────────────────────────────────────────

const MOZOSUBZ_SERVICES = [
  { id: 'mtn_sme',        label: 'MTN SME',        network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.08)', border: 'rgba(252,211,77,0.2)'  },
  { id: 'mtn_gifting',    label: 'MTN Gifting',    network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.08)', border: 'rgba(252,211,77,0.2)'  },
  { id: 'mtn_datashare',  label: 'MTN Datashare',  network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.08)', border: 'rgba(252,211,77,0.2)'  },
  { id: 'mtn_awoof',      label: 'MTN Awoof',      network: 'MTN',     color: '#FCD34D', bg: 'rgba(252,211,77,0.08)', border: 'rgba(252,211,77,0.2)'  },
  { id: 'glo_sme',        label: 'GLO SME',        network: 'GLO',     color: '#4ADE80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)'  },
  { id: 'glo_data',       label: 'GLO Data',       network: 'GLO',     color: '#4ADE80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)'  },
  { id: 'airtel_sme',     label: 'Airtel SME',     network: 'Airtel',  color: '#F87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
  { id: 'airtel_gifting', label: 'Airtel Gifting', network: 'Airtel',  color: '#F87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
  { id: 'etisalat_data',  label: '9mobile Data',   network: '9mobile', color: '#2DD4BF', bg: 'rgba(45,212,191,0.08)', border: 'rgba(45,212,191,0.2)'  },
] as const;

type ServiceID = typeof MOZOSUBZ_SERVICES[number]['id'];

interface RawPlan { id: string; name: string; price: number; }

// All supported providers — add new ones here as you onboard them
const PROVIDER_OPTIONS = [
  { value: 'mozosubz', label: 'Mozosubz' },
  { value: 'bigisub',  label: 'Bigisub'  },
  // { value: 'myprovider', label: 'My Provider' }, ← plug in new providers here
] as const;
type ProviderSlug = typeof PROVIDER_OPTIONS[number]['value'];

interface PricingRow {
  planId:              string;
  serviceId:           ServiceID;
  network:             string;
  name:                string;
  costPrice:           number;    // Mozosubz wholesale price
  markupPct:           number;    // % above cost
  sellingPrice:        number;    // costPrice * (1 + markupPct/100), rounded up
  saved:               boolean;   // published to services_config?
  saving:              boolean;
  dirty:               boolean;   // edited since last publish
  provider:            ProviderSlug; // which gateway fulfils this plan
  bigisubPlanId:       string;    // Bigisub numeric/string plan ID (only used when provider=bigisub)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

const calcSelling = (cost: number, pct: number) => Math.ceil(cost * (1 + pct / 100));

function parseValidity(name: string): string {
  const m = name.match(/(\d+)\s*(day|days|month|months|week|weeks|hr|hour|hours)/i);
  return m ? `${m[1]} ${m[2]}` : '30 days';
}

function deriveCategory(serviceId: string): string {
  if (serviceId.includes('sme'))       return 'SME';
  if (serviceId.includes('gifting'))   return 'GIFTING';
  if (serviceId.includes('datashare')) return 'DATASHARE';
  if (serviceId.includes('awoof'))     return 'AWOOF';
  return 'DATA';
}

const SERVICE_MAP = Object.fromEntries(MOZOSUBZ_SERVICES.map(s => [s.id, s]));

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPricingManager() {
  const [rows,         setRows]         = useState<PricingRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [publishing,   setPublishing]   = useState(false);
  const [fetched,      setFetched]      = useState(false);
  const [activeTab,    setActiveTab]    = useState<ServiceID | 'all'>('all');
  const [search,       setSearch]       = useState('');
  const [showCost,     setShowCost]     = useState(true);
  const [globalMarkup, setGlobalMarkup] = useState('10');
  const [lastFetched,  setLastFetched]  = useState<Date | null>(null);

  // ── Load existing published prices from DB on mount ──────────────────────────
  const loadExistingPrices = useCallback(async () => {
    const { data } = await supabase
      .from('services_config')
      .select('mozosubs_plan_id, mozosubz_plan_id, bigisub_identifier_id, selling_price, cost_price, is_active, provider')
      .eq('service_type', 'data');
    const map: Record<string, { selling: number; cost: number; active: boolean }> = {};
    (data || []).forEach((r: any) => {
      const k = String(r.mozosubs_plan_id || r.mozosubz_plan_id || r.bigisub_identifier_id || '');
      if (k) map[k] = { selling: Number(r.selling_price || 0), cost: Number(r.cost_price || 0), active: !!r.is_active, provider: r.provider || 'mozosubz', bigisub_identifier_id: r.bigisub_identifier_id || '' };
    });
    return map;
  }, []);

  // ── Fetch live plans from Mozosubz via backend ───────────────────────────────
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

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
      const plans: Array<{ service: ServiceID; id: string; name: string; price: number }> =
        (data.plans || []).filter((p: any) => p.id && p.name && p.price > 0);

      if (!plans.length) {
        toast('No plans returned — make sure your MOZOSUBS_API_KEY is set and plans are priced in your Mozosubz dashboard.', { icon: '⚠️' });
        setFetched(true);
        setLoading(false);
        return;
      }

      const defaultMarkup = parseFloat(globalMarkup) || 10;

      const newRows: PricingRow[] = plans.map((p: any) => {
        const existing = existingPrices[p.id];
        const cost     = p.price;
        let markup     = defaultMarkup;
        if (existing?.selling > 0 && existing.cost > 0) {
          markup = ((existing.selling - existing.cost) / existing.cost) * 100;
        }
        const selling = existing?.selling || calcSelling(cost, markup);
        const svc     = SERVICE_MAP[p.service] || { network: 'MTN' };
        return {
          planId:        p.id,
          serviceId:     p.service,
          network:       svc.network,
          name:          p.name,
          costPrice:     cost,
          markupPct:     Math.round(markup * 10) / 10,
          sellingPrice:  selling,
          saved:         !!existing?.selling,
          saving:        false,
          dirty:         false,
          provider:      ((existing as any)?.provider as ProviderSlug) || 'mozosubz',
          bigisubPlanId: (existing as any)?.bigisub_identifier_id || '',
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

  // ── Update markup for one row ─────────────────────────────────────────────────
  const updateMarkup = useCallback((planId: string, pct: number) => {
    setRows(prev => prev.map(r => {
      if (r.planId !== planId) return r;
      const selling = calcSelling(r.costPrice, pct);
      return { ...r, markupPct: pct, sellingPrice: selling, dirty: true };
    }));
  }, []);

  // ── Update selling price directly ─────────────────────────────────────────────
  const updateSelling = useCallback((planId: string, val: number) => {
    setRows(prev => prev.map(r => {
      if (r.planId !== planId) return r;
      const pct = r.costPrice > 0 ? ((val - r.costPrice) / r.costPrice) * 100 : 0;
      return { ...r, sellingPrice: val, markupPct: Math.round(pct * 10) / 10, dirty: true };
    }));
  }, []);

  // ── Apply global markup to all visible rows ───────────────────────────────────
  const applyGlobalMarkup = useCallback(() => {
    const pct = parseFloat(globalMarkup);
    if (isNaN(pct) || pct < 0) { toast.error('Enter a valid markup %'); return; }
    const tabOk = (r: PricingRow) => activeTab === 'all' || r.serviceId === activeTab;
    const q     = search.toLowerCase();
    const txtOk = (r: PricingRow) => !q || r.name.toLowerCase().includes(q) || r.planId.includes(q);
    let count = 0;
    setRows(prev => prev.map(r => {
      if (!tabOk(r) || !txtOk(r)) return r;
      count++;
      return { ...r, markupPct: pct, sellingPrice: calcSelling(r.costPrice, pct), dirty: true };
    }));
    toast.success(`Applied ${pct}% markup to visible plans`);
  }, [globalMarkup, activeTab, search]);

  // ── Publish single plan to services_config ────────────────────────────────────
  const publishRow = useCallback(async (planId: string) => {
    const row = rows.find(r => r.planId === planId);
    if (!row) return;
    if (row.sellingPrice < row.costPrice) { toast.error('Selling price below cost!'); return; }

    setRows(prev => prev.map(r => r.planId === planId ? { ...r, saving: true } : r));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const svc = SERVICE_MAP[row.serviceId];
      const payload = {
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
      };

      const res = await fetch('/api/admin/create-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `Error ${res.status}`);
      }
      setRows(prev => prev.map(r => r.planId === planId ? { ...r, saved: true, saving: false, dirty: false } : r));
      toast.success(`Published "${row.name}"`);
    } catch (err: any) {
      setRows(prev => prev.map(r => r.planId === planId ? { ...r, saving: false } : r));
      toast.error(err.message);
    }
  }, [rows]);

  // ── Publish ALL visible dirty rows ────────────────────────────────────────────
  const publishAll = useCallback(async () => {
    const tabOk2 = (r: PricingRow) => activeTab === 'all' || r.serviceId === activeTab;
    const q2     = search.toLowerCase();
    const txtOk2 = (r: PricingRow) => !q2 || r.name.toLowerCase().includes(q2) || r.planId.includes(q2);
    const targets = rows.filter(r => (r.dirty || !r.saved) && tabOk2(r) && txtOk2(r));
    if (!targets.length) { toast('Nothing new to publish'); return; }
    setPublishing(true);
    let ok = 0, fail = 0;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Not authenticated'); setPublishing(false); return; }

    for (const row of targets) {
      if (row.sellingPrice < row.costPrice) { fail++; continue; }
      try {
        const payload = {
          id: row.planId, name: row.name, network: row.network, service: row.serviceId, type: 'data',
          price: row.sellingPrice, cost_price: row.costPrice, selling_price: row.sellingPrice,
          retail_price: row.sellingPrice, plan_category: deriveCategory(row.serviceId),
          validity_days: parseValidity(row.name), mozosubz_plan_id: row.planId, mozosubz_service: row.serviceId,
        };
        const res = await fetch('/api/admin/create-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify(payload),
        });
        if (res.ok) { ok++; setRows(prev => prev.map(r => r.planId === row.planId ? { ...r, saved: true, dirty: false } : r)); }
        else fail++;
      } catch { fail++; }
    }
    setPublishing(false);
    if (ok) toast.success(`✅ Published ${ok} plan${ok > 1 ? 's' : ''} to your store`);
    if (fail) toast.error(`${fail} failed — check selling prices are above cost`);
  }, [rows, activeTab, search]);

  // ── Filtered view ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      const tabMatch = activeTab === 'all' || r.serviceId === activeTab;
      const q        = search.toLowerCase();
      const txtMatch = !q || r.name.toLowerCase().includes(q) || r.planId.includes(q) || r.network.toLowerCase().includes(q);
      return tabMatch && txtMatch;
    });
  }, [rows, activeTab, search]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const src = activeTab === 'all' ? rows : rows.filter(r => r.serviceId === activeTab);
    const published  = src.filter(r => r.saved && !r.dirty).length;
    const unpublished = src.filter(r => !r.saved || r.dirty).length;
    const avgMarkup  = src.length ? src.reduce((a, r) => a + r.markupPct, 0) / src.length : 0;
    const revenue    = src.reduce((a, r) => a + r.sellingPrice, 0);
    return { total: src.length, published, unpublished, avgMarkup, revenue };
  }, [rows, activeTab]);

  // ── Network group counts for tabs ─────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    MOZOSUBZ_SERVICES.forEach(s => { counts[s.id] = rows.filter(r => r.serviceId === s.id).length; });
    return counts;
  }, [rows]);

  return (
    <div className="space-y-6 text-slate-100">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_60%)]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/30">
                <DollarSign size={20} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Plan Pricing Manager</h2>
                <p className="text-xs text-slate-400">Mozosubz API → markup → publish to user store</p>
              </div>
            </div>
            {lastFetched && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Last synced: {lastFetched.toLocaleTimeString('en-NG')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchPlans}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition
                         bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {loading ? 'Fetching…' : fetched ? 'Sync Prices' : 'Fetch Plans'}
            </button>
            {fetched && stats.unpublished > 0 && (
              <button
                onClick={publishAll}
                disabled={publishing}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition
                           bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20
                           disabled:opacity-50"
              >
                {publishing ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {publishing ? 'Publishing…' : `Publish ${stats.unpublished}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      {fetched && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Plans',    value: stats.total,                     icon: BarChart2,   color: 'text-indigo-400',  ring: 'ring-indigo-500/20' },
            { label: 'Live in Store',  value: stats.published,                 icon: CheckCircle, color: 'text-emerald-400', ring: 'ring-emerald-500/20' },
            { label: 'Pending Push',   value: stats.unpublished,               icon: AlertTriangle,color:'text-amber-400',   ring: 'ring-amber-500/20' },
            { label: 'Avg Markup',     value: stats.avgMarkup.toFixed(1) + '%',icon: Percent,     color: 'text-sky-400',     ring: 'ring-sky-500/20' },
          ].map(({ label, value, icon: Icon, color, ring }) => (
            <div key={label} className={`rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 ring-1 ${ring}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400 font-medium">{label}</span>
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center bg-slate-800`}>
                  <Icon size={13} className={color} />
                </div>
              </div>
              <span className={`text-2xl font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Global Markup Bar ── */}
      {fetched && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">Global Markup %</label>
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="number" min={0} step={0.5}
                  value={globalMarkup}
                  onChange={e => setGlobalMarkup(e.target.value)}
                  className="w-20 bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
              </div>
              <button
                onClick={applyGlobalMarkup}
                className="px-4 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-sm font-medium transition border border-indigo-500/30"
              >
                Apply to {filtered.length} plans
              </button>
              {/* Quick presets */}
              <div className="hidden sm:flex items-center gap-1.5 ml-2">
                <span className="text-xs text-slate-500 mr-1">Quick:</span>
                {[5, 8, 10, 15, 20].map(p => (
                  <button
                    key={p}
                    onClick={() => { setGlobalMarkup(String(p)); }}
                    className={`px-2 py-1 rounded-md text-xs font-semibold border transition ${
                      globalMarkup === String(p)
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

          {/* ── Batch Provider Setter ── */}
          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">Set all visible plans → provider</label>
            <div className="flex items-center gap-2">
              <select
                id="batch-provider"
                defaultValue="mozosubz"
                className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PROVIDER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const sel = (document.getElementById('batch-provider') as HTMLSelectElement)?.value as ProviderSlug;
                  setRows(prev => prev.map(r => {
                    const tab  = activeTab === 'all' || r.serviceId === activeTab;
                    const srch = !search || r.name.toLowerCase().includes(search.toLowerCase());
                    return tab && srch ? { ...r, provider: sel, dirty: true } : r;
                  }));
                  toast.success(`Set ${filtered.length} plans → ${sel}`);
                }}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition border border-slate-600"
              >
                Apply to visible
              </button>
            </div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search plans…"
                className="pl-8 pr-3 py-2 bg-slate-800 border border-slate-600 text-white text-sm rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:w-56 transition-all"
              />
            </div>
            <button
              onClick={() => setShowCost(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-400 hover:text-white text-xs transition"
            >
              {showCost ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{showCost ? 'Hide cost' : 'Show cost'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Service Tabs ── */}
      {fetched && (
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-none">
          {/* All tab */}
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
              activeTab === 'all'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
            }`}
          >
            <Globe size={12} />
            All Services
            <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {tabCounts.all}
            </span>
          </button>
          {MOZOSUBZ_SERVICES.map(svc => (
            <button
              key={svc.id}
              onClick={() => setActiveTab(svc.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
                activeTab === svc.id
                  ? 'text-white shadow-lg'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white'
              }`}
              style={activeTab === svc.id ? { background: svc.bg, borderColor: svc.border, color: svc.color, boxShadow: `0 4px 15px ${svc.color}20` } : { borderColor: 'rgba(51,65,85,0.6)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTab === svc.id ? svc.color : '#475569' }} />
              {svc.label}
              {tabCounts[svc.id] > 0 && (
                <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold bg-black/20">
                  {tabCounts[svc.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty / Loading States ── */}
      {!fetched && !loading && (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-slate-700/50">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
            <TrendingUp size={28} className="text-indigo-400" />
          </div>
          <h3 className="text-white font-semibold mb-1">No plans loaded yet</h3>
          <p className="text-slate-400 text-sm text-center max-w-xs leading-relaxed">
            Click <strong>Fetch Plans</strong> to pull live prices from Mozosubz, set your margins, and publish to your user store.
          </p>
          <p className="text-slate-500 text-xs mt-3 text-center max-w-xs">
            Requires <code className="bg-slate-800 px-1 rounded text-slate-300">MOZOSUBS_API_KEY</code> in your environment and plans priced in your Mozosubz dashboard.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-slate-700/50">
          <div className="relative mb-4">
            <div className="h-16 w-16 rounded-full border-2 border-indigo-600/30 border-t-indigo-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Globe size={18} className="text-indigo-400" />
            </div>
          </div>
          <p className="text-slate-300 font-medium">Fetching all 9 services from Mozosubz…</p>
          <p className="text-slate-500 text-xs mt-1">MTN · GLO · Airtel · 9mobile</p>
        </div>
      )}

      {/* ── Plan Table ── */}
      {fetched && !loading && (
        <div className="rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Table header */}
          <div className="grid items-center bg-slate-900 border-b border-slate-700/50 px-5 py-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold"
               style={{ gridTemplateColumns: showCost ? '2fr 100px 80px 80px 110px 110px 80px 80px' : '2fr 100px 80px 110px 110px 80px 80px' }}>
            <span>Plan</span>
            <span>Network</span>
            <span>Type</span>
            {showCost && <span className="text-right">Cost ₦</span>}
            <span className="text-right">Markup %</span>
            <span className="text-right">Selling ₦</span>
            <span className="text-center">Status</span>
            <span className="text-center">Action</span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-slate-900/30">
              No plans found for this selection. Try a different tab or check your Mozosubz dashboard.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {filtered.map((row) => {
                const svc         = SERVICE_MAP[row.serviceId];
                const isBelowCost = row.sellingPrice < row.costPrice;
                const profit      = row.sellingPrice - row.costPrice;
                const isGood      = row.markupPct >= 5;

                return (
                  <div
                    key={row.planId}
                    className="grid items-center px-5 py-4 bg-slate-900/20 hover:bg-slate-900/60 transition group"
                    style={{ gridTemplateColumns: showCost ? '2fr 100px 80px 80px 110px 110px 80px 80px' : '2fr 100px 80px 110px 110px 80px 80px' }}
                  >
                    {/* Plan name */}
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-indigo-200 transition">{row.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500">ID: {row.planId}</span>
                        <span className="text-[10px] text-slate-600">·</span>
                        <span className="text-[10px] text-slate-500">{parseValidity(row.name)}</span>
                        {row.dirty && <span className="text-[9px] text-amber-400 font-semibold bg-amber-400/10 px-1.5 py-0.5 rounded">EDITED</span>}
                      </div>
                    </div>

                    {/* Network badge */}
                    <div>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase border"
                        style={{ color: svc?.color, backgroundColor: svc?.bg, borderColor: svc?.border }}
                      >
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: svc?.color }} />
                        {row.network}
                      </span>
                    </div>

                    {/* Type */}
                    <div>
                      <span className="text-[10px] text-slate-400 font-medium">{deriveCategory(row.serviceId)}</span>
                    </div>

                    {/* Cost price */}
                    {showCost && (
                      <div className="text-right">
                        <span className="text-sm font-mono text-slate-400">{fmt(row.costPrice)}</span>
                      </div>
                    )}

                    {/* Markup % input */}
                    <div className="text-right">
                      <div className="relative inline-flex items-center">
                        <input
                          type="number" min={0} step={0.5}
                          value={row.markupPct}
                          onChange={e => updateMarkup(row.planId, parseFloat(e.target.value) || 0)}
                          className={`w-16 text-right bg-slate-800 text-sm rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold ${
                            isGood ? 'border-slate-600 text-emerald-400' : 'border-orange-500/50 text-orange-400'
                          }`}
                        />
                        <span className="absolute -right-4 text-slate-500 text-xs">%</span>
                      </div>
                    </div>

                    {/* Selling price input */}
                    <div className="text-right">
                      <div className="flex flex-col items-end">
                        <div className="relative inline-flex items-center">
                          <span className="absolute left-2 text-slate-500 text-xs">₦</span>
                          <input
                            type="number" min={row.costPrice}
                            value={row.sellingPrice}
                            onChange={e => updateSelling(row.planId, parseInt(e.target.value) || 0)}
                            className={`w-20 text-right pl-5 pr-2 py-1.5 bg-slate-800 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold ${
                              isBelowCost ? 'border-red-500 text-red-400' : 'border-slate-600 text-white'
                            }`}
                          />
                        </div>
                        {!isBelowCost && profit > 0 && (
                          <span className="text-[10px] text-emerald-500 mt-0.5">+{fmt(profit)}</span>
                        )}
                        {isBelowCost && (
                          <span className="text-[10px] text-red-400 font-semibold mt-0.5">Below cost!</span>
                        )}
                      </div>
                    </div>

                    {/* Provider dropdown + Bigisub plan ID */}
                    <div className="text-center space-y-1">
                      <select
                        value={row.provider}
                        onChange={e => setRows(prev => prev.map(r =>
                          r.planId === row.planId
                            ? { ...r, provider: e.target.value as ProviderSlug, dirty: true }
                            : r
                        ))}
                        className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {PROVIDER_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {row.provider === 'bigisub' && (
                        <input
                          type="text"
                          placeholder="Bigisub plan ID"
                          value={row.bigisubPlanId}
                          onChange={e => setRows(prev => prev.map(r =>
                            r.planId === row.planId
                              ? { ...r, bigisubPlanId: e.target.value, dirty: true }
                              : r
                          ))}
                          className="w-full bg-slate-900 border border-amber-500/40 text-amber-300 text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-slate-600 font-mono"
                        />
                      )}
                    </div>

                    {/* Status */}
                    <div className="text-center">
                      {row.saving ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400">
                          <Loader2 size={10} className="animate-spin" /> Saving
                        </span>
                      ) : row.saved && !row.dirty ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          <CheckCircle size={9} /> Live
                        </span>
                      ) : row.dirty ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold">
                          Edited
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-700/50 border border-slate-600 text-slate-400 text-[10px]">
                          Draft
                        </span>
                      )}
                    </div>

                    {/* Action */}
                    <div className="text-center">
                      <button
                        onClick={() => publishRow(row.planId)}
                        disabled={row.saving || isBelowCost}
                        className={`flex items-center gap-1 mx-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 ${
                          row.saved && !row.dirty
                            ? 'bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/30'
                        }`}
                      >
                        {row.saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                        {row.saved && !row.dirty ? 'Re-save' : 'Publish'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table footer summary */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-t border-slate-700/50 text-xs text-slate-500">
              <span>Showing {filtered.length} of {rows.length} plans</span>
              <span>
                {stats.published} live · {stats.unpublished} pending · avg {stats.avgMarkup.toFixed(1)}% margin
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Info banner ── */}
      {fetched && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-700/40 bg-slate-900/30 p-4 text-xs text-slate-400">
          <Settings size={15} className="shrink-0 mt-0.5 text-slate-500" />
          <div>
            <span className="font-semibold text-slate-300">How this works: </span>
            Plans are fetched live from Mozosubz. Set your markup % per plan (or apply globally), then click
            {' '}<strong className="text-white">Publish</strong> — the plan goes into <code className="bg-slate-800 px-1 rounded">services_config</code> and
            instantly appears in your user data store at your set price. Users always see the selling price, never the cost.
          </div>
        </div>
      )}
    </div>
  );
}
