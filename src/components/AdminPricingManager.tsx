/**
 * AdminPricingManager.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin UI: Fetch live Mozosubs API prices → set selling price per plan →
 * publish to services_config (Supabase). Users see only the admin-set price.
 *
 * NOT WIRED TO LIVE BACKEND YET — all backend calls are stubbed with TODO markers.
 * Wire up by replacing the fetch() calls to the real /api/admin/* endpoints.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  RefreshCw, Save, DollarSign, Tag, Wifi, ChevronDown,
  CheckCircle, AlertTriangle, Loader2, Search, Filter,
  TrendingUp, Package, ArrowUpRight, Edit3, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

interface MozosubsPlan {
  id: number;
  network: number;         // 1=MTN 2=GLO 3=Airtel 4=9mobile
  name: string;
  plan?: string;
  price: number;           // Mozosubs cost price (₦)
  validity?: string;
  size?: string;
  planType?: string;       // 'SME' | 'GIFTING' | 'CG' | 'CORPORATE'
}

interface PricingRow {
  plan: MozosubsPlan;
  sellingPrice: string;    // admin-editable
  markup: number;          // derived: sellingPrice - plan.price
  markupPct: number;       // derived: markup / plan.price * 100
  saved: boolean;          // was this row published to DB?
  saving: boolean;
}

const NETWORKS: Record<number, { name: string; color: string }> = {
  1: { name: 'MTN',     color: 'text-yellow-400' },
  2: { name: 'GLO',     color: 'text-green-400'  },
  3: { name: 'Airtel',  color: 'text-red-400'    },
  4: { name: '9mobile', color: 'text-teal-400'   },
};

const PLAN_TYPE_OPTIONS = ['ALL', 'SME', 'GIFTING', 'CG', 'CORPORATE'] as const;
type PlanTypeFilter = typeof PLAN_TYPE_OPTIONS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

function applyBulkMarkup(rows: PricingRow[], pct: number): PricingRow[] {
  return rows.map(r => {
    const selling = Math.ceil(r.plan.price * (1 + pct / 100));
    const markup  = selling - r.plan.price;
    return { ...r, sellingPrice: String(selling), markup, markupPct: pct, saved: false };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPricingManager() {
  const [rows,        setRows]        = useState<PricingRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [savingAll,   setSavingAll]   = useState(false);
  const [fetched,     setFetched]     = useState(false);
  const [search,      setSearch]      = useState('');
  const [netFilter,   setNetFilter]   = useState<number | 'ALL'>('ALL');
  const [typeFilter,  setTypeFilter]  = useState<PlanTypeFilter>('ALL');
  const [bulkPct,     setBulkPct]     = useState('');
  const [showCost,    setShowCost]    = useState(true);

  // ── Fetch live plans from Mozosubs (via backend admin endpoint) ─────────────
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // ── TODO: wire to real backend endpoint ──────────────────────────────
      // The backend endpoint /api/admin/generate-plans already fetches Mozosubs
      // plans. We reuse it but only for reading — not publishing.
      // Replace this fetch() with your actual API base URL in production.
      // ────────────────────────────────────────────────────────────────────
      const res = await fetch('/api/admin/generate-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fetchOnly: true }),   // fetch but don't auto-publish
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `Server error ${res.status}`);
      }

      const data = await res.json();

      // data may be { plans: [...] } or just an array
      const rawPlans: MozosubsPlan[] = Array.isArray(data) ? data : (data.plans ?? []);

      if (!rawPlans.length) throw new Error('No plans returned from Mozosubs API.');

      // Also pull any existing selling prices from services_config
      const { data: existing } = await supabase
        .from('services_config')
        .select('bigisub_identifier_id, selling_price, retail_price');
      const existingMap: Record<string, number> = {};
      (existing || []).forEach((r: any) => {
        const key = String(r.bigisub_identifier_id);
        existingMap[key] = r.selling_price ?? r.retail_price ?? 0;
      });

      const newRows: PricingRow[] = rawPlans.map(plan => {
        const key       = String(plan.id);
        const existing  = existingMap[key] ?? 0;
        const selling   = existing > 0 ? existing : Math.ceil(plan.price * 1.05);
        const markup    = selling - plan.price;
        const markupPct = plan.price > 0 ? (markup / plan.price) * 100 : 0;
        return {
          plan,
          sellingPrice: String(selling),
          markup,
          markupPct,
          saved: existing > 0,
          saving: false,
        };
      });

      setRows(newRows);
      setFetched(true);
      toast.success(`Loaded ${newRows.length} plans from Mozosubs`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Update a single row's selling price ─────────────────────────────────────
  const updateSellingPrice = useCallback((planId: number, raw: string) => {
    setRows(prev => prev.map(r => {
      if (r.plan.id !== planId) return r;
      const selling   = parseFloat(raw) || 0;
      const markup    = selling - r.plan.price;
      const markupPct = r.plan.price > 0 ? (markup / r.plan.price) * 100 : 0;
      return { ...r, sellingPrice: raw, markup, markupPct, saved: false };
    }));
  }, []);

  // ── Save a single row ────────────────────────────────────────────────────────
  const saveRow = useCallback(async (planId: number) => {
    setRows(prev => prev.map(r => r.plan.id === planId ? { ...r, saving: true } : r));
    try {
      const row = rows.find(r => r.plan.id === planId);
      if (!row) return;
      const selling = parseFloat(row.sellingPrice);
      if (isNaN(selling) || selling <= 0) throw new Error('Invalid selling price');
      if (selling < row.plan.price) throw new Error('Selling price cannot be below cost price');

      // ── TODO: swap fetch() base URL to production API when ready ─────────
      const { data: { session } } = await supabase.auth.getSession();
      const payload = {
        id:              String(row.plan.id),
        name:            row.plan.name,
        network:         NETWORKS[row.plan.network]?.name || String(row.plan.network),
        type:            'data',
        price:           selling,              // admin selling price = what users pay
        cost_price:      row.plan.price,       // Mozosubs cost (stored for margin tracking)
        retail_price:    selling,
        selling_price:   selling,
        plan_category:   row.plan.planType || 'GIFTING',
        validity_days:   row.plan.validity || '',
        peyflex_variation_id: String(row.plan.id),
      };

      const res = await fetch('/api/admin/create-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `Server error ${res.status}`);
      }

      setRows(prev => prev.map(r => r.plan.id === planId ? { ...r, saved: true, saving: false } : r));
      toast.success(`Saved price for "${row.plan.name}"`);
    } catch (err: any) {
      setRows(prev => prev.map(r => r.plan.id === planId ? { ...r, saving: false } : r));
      toast.error(err.message || 'Failed to save');
    }
  }, [rows]);

  // ── Save ALL visible rows ────────────────────────────────────────────────────
  const saveAll = useCallback(async () => {
    setSavingAll(true);
    let ok = 0, fail = 0;
    for (const row of filtered) {
      const selling = parseFloat(row.sellingPrice);
      if (isNaN(selling) || selling <= 0 || selling < row.plan.price) { fail++; continue; }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const payload = {
          id:            String(row.plan.id),
          name:          row.plan.name,
          network:       NETWORKS[row.plan.network]?.name || String(row.plan.network),
          type:          'data',
          price:         selling,
          cost_price:    row.plan.price,
          retail_price:  selling,
          selling_price: selling,
          plan_category: row.plan.planType || 'GIFTING',
          validity_days: row.plan.validity || '',
          peyflex_variation_id: String(row.plan.id),
        };
        const res = await fetch('/api/admin/create-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          ok++;
          setRows(prev => prev.map(r => r.plan.id === row.plan.id ? { ...r, saved: true } : r));
        } else { fail++; }
      } catch { fail++; }
    }
    setSavingAll(false);
    if (ok > 0) toast.success(`Published ${ok} plan${ok > 1 ? 's' : ''} to user store`);
    if (fail > 0) toast.error(`${fail} plan${fail > 1 ? 's' : ''} failed`);
  }, [rows]);  // filtered is derived below, passed in via saveAll closure

  // ── Apply bulk markup ────────────────────────────────────────────────────────
  const applyBulk = useCallback(() => {
    const pct = parseFloat(bulkPct);
    if (isNaN(pct) || pct < 0) { toast.error('Enter a valid markup %'); return; }
    setRows(prev => applyBulkMarkup(prev, pct));
    toast.success(`Applied ${pct}% markup to all plans`);
  }, [bulkPct, rows]);

  // ── Filtered view ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      const matchNet  = netFilter === 'ALL' || r.plan.network === netFilter;
      const matchType = typeFilter === 'ALL' || (r.plan.planType?.toUpperCase() === typeFilter);
      const matchQ    = !search ||
        r.plan.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.plan.validity || '').toLowerCase().includes(search.toLowerCase());
      return matchNet && matchType && matchQ;
    });
  }, [rows, netFilter, typeFilter, search]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     rows.length,
    saved:     rows.filter(r => r.saved).length,
    unsaved:   rows.filter(r => !r.saved).length,
    avgMarkup: rows.length
      ? rows.reduce((a, r) => a + r.markupPct, 0) / rows.length
      : 0,
  }), [rows]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign size={22} className="text-emerald-400" />
            Pricing Manager
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pull live Mozosubs cost prices → set your selling prices → publish to user store.
            <span className="ml-1 text-amber-400 font-medium">Not wired to live backend yet.</span>
          </p>
        </div>
        <button
          onClick={fetchPlans}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500
                     text-white text-sm font-semibold transition disabled:opacity-50"
        >
          {loading
            ? <Loader2 size={16} className="animate-spin" />
            : <RefreshCw size={16} />}
          {fetched ? 'Refresh from Mozosubs' : 'Load Mozosubs Prices'}
        </button>
      </div>

      {/* ── Stats bar ── */}
      {fetched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Plans',    value: stats.total,                            icon: Package,    color: 'text-indigo-300' },
            { label: 'Published',      value: stats.saved,                            icon: CheckCircle,color: 'text-emerald-400'},
            { label: 'Unpublished',    value: stats.unsaved,                          icon: AlertTriangle, color: 'text-amber-400'},
            { label: 'Avg Markup',     value: stats.avgMarkup.toFixed(1) + '%',       icon: TrendingUp, color: 'text-sky-400'    },
          ].map(s => (
            <div key={s.label}
              className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40 flex items-center gap-3">
              <s.icon size={18} className={s.color} />
              <div>
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Bulk markup + filters ── */}
      {fetched && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/40 p-4 space-y-3">
          {/* Bulk markup */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                Bulk Markup %
              </label>
              <div className="flex gap-2">
                <input
                  type="number" min={0} step={0.5}
                  value={bulkPct}
                  onChange={e => setBulkPct(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-28 bg-slate-700 text-white text-sm rounded-lg px-3 py-2
                             border border-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={applyBulk}
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm
                             rounded-lg font-medium transition"
                >
                  Apply to All
                </button>
              </div>
            </div>
            <div className="flex gap-2 items-end">
              {[5, 8, 10, 15].map(p => (
                <button key={p}
                  onClick={() => { setBulkPct(String(p)); setRows(prev => applyBulkMarkup(prev, p)); }}
                  className="px-3 py-2 bg-indigo-700/40 hover:bg-indigo-700/70 text-indigo-300
                             text-xs rounded-lg font-medium transition"
                >
                  +{p}%
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowCost(v => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
              >
                {showCost ? <EyeOff size={14} /> : <Eye size={14} />}
                {showCost ? 'Hide' : 'Show'} cost price
              </button>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search plans…"
                className="pl-8 pr-3 py-2 bg-slate-700 text-white text-sm rounded-lg
                           border border-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>
            {/* Network filter */}
            <div className="flex gap-1">
              {(['ALL', 1, 2, 3, 4] as const).map(n => (
                <button key={n}
                  onClick={() => setNetFilter(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    netFilter === n
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {n === 'ALL' ? 'All Networks' : NETWORKS[n]?.name}
                </button>
              ))}
            </div>
            {/* Plan type filter */}
            <div className="flex gap-1">
              {PLAN_TYPE_OPTIONS.map(t => (
                <button key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    typeFilter === t
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Publish all button ── */}
      {fetched && stats.unsaved > 0 && (
        <div className="flex justify-end">
          <button
            onClick={saveAll}
            disabled={savingAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500
                       text-white text-sm font-bold transition disabled:opacity-50"
          >
            {savingAll ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Publish All ({stats.unsaved}) to User Store
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!fetched && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package size={48} className="text-slate-600 mb-4" />
          <p className="text-slate-400 text-sm max-w-xs">
            Click <strong className="text-white">Load Mozosubs Prices</strong> to pull the latest
            cost prices from the Mozosubs API. Then set your selling prices and publish.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-indigo-400" />
          <span className="ml-3 text-slate-400">Fetching from Mozosubs API…</span>
        </div>
      )}

      {/* ── Plans table ── */}
      {fetched && !loading && (
        <div className="overflow-x-auto rounded-xl border border-slate-700/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Network</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Validity</th>
                {showCost && <th className="px-4 py-3 text-right">Cost Price</th>}
                <th className="px-4 py-3 text-right">Selling Price (₦)</th>
                <th className="px-4 py-3 text-right">Markup</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No plans match your filters.
                  </td>
                </tr>
              )}
              {filtered.map(row => {
                const selling = parseFloat(row.sellingPrice) || 0;
                const belowCost = selling > 0 && selling < row.plan.price;
                const net = NETWORKS[row.plan.network];
                return (
                  <tr key={row.plan.id}
                    className="bg-slate-900/40 hover:bg-slate-800/60 transition">
                    <td className="px-4 py-3 text-white font-medium">{row.plan.name}</td>
                    <td className={`px-4 py-3 font-semibold ${net?.color || 'text-slate-300'}`}>
                      {net?.name || row.plan.network}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        row.plan.planType === 'SME'       ? 'bg-blue-800/50 text-blue-300'    :
                        row.plan.planType === 'GIFTING'   ? 'bg-purple-800/50 text-purple-300' :
                        row.plan.planType === 'CG'        ? 'bg-orange-800/50 text-orange-300' :
                        'bg-slate-700/50 text-slate-300'
                      }`}>
                        {row.plan.planType || 'GIFTING'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{row.plan.validity || '—'}</td>
                    {showCost && (
                      <td className="px-4 py-3 text-right text-slate-400">
                        {fmt(row.plan.price)}
                      </td>
                    )}
                    {/* Editable selling price */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400 text-xs">₦</span>
                        <input
                          type="number"
                          min={row.plan.price}
                          step={1}
                          value={row.sellingPrice}
                          onChange={e => updateSellingPrice(row.plan.id, e.target.value)}
                          className={`w-24 text-right bg-slate-700 text-white text-sm rounded-lg px-2 py-1
                                     border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                            belowCost ? 'border-red-500' : 'border-slate-600'
                          }`}
                        />
                      </div>
                      {belowCost && (
                        <p className="text-red-400 text-xs mt-0.5 text-right">Below cost!</p>
                      )}
                    </td>
                    {/* Markup */}
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${
                        row.markup >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {row.markupPct.toFixed(1)}%
                      </span>
                      <p className="text-slate-500 text-xs">{fmt(row.markup)}</p>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      {row.saved
                        ? <CheckCircle size={16} className="text-emerald-400 inline" />
                        : <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />}
                    </td>
                    {/* Save button */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => saveRow(row.plan.id)}
                        disabled={row.saving || belowCost}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500
                                   text-white text-xs font-semibold transition disabled:opacity-40
                                   flex items-center gap-1 mx-auto"
                      >
                        {row.saving
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Save size={12} />}
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Wire-up reminder ── */}
      <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/30
                      rounded-xl p-4 text-xs text-amber-300">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">Backend wiring pending</p>
          <p className="text-amber-400/80">
            This UI posts to <code>/api/admin/generate-plans</code> (fetch) and{' '}
            <code>/api/admin/create-plan</code> (save). The fetch endpoint returns the full
            Mozosubs plan list. The save endpoint writes to <code>services_config</code> in
            Supabase — users then see only the <strong>selling_price</strong> column from
            that table, never the cost_price.
          </p>
        </div>
      </div>
    </div>
  );
}
