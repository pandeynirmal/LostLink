"use client";

import { useState, useEffect } from "react";
import { Shield, Package, CheckCircle, Search } from "lucide-react";
import Link from "next/link";
import axios from "axios";

interface ItemType {
  id: string;
  type: "lost" | "found";
  description: string;
  latitude?: number;
  longitude?: number;
  rewardAmount: number;
  isClaimed: boolean;
  claimReviewStatus?: "pending" | "approved" | "rejected" | null;
}

interface StatsType {
  totalItems: number;
  totalLost: number;
  totalFound: number;
  claims: number;
  pendingClaims: number;
}

function shortId(id: string) {
  if (!id) return "-";
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export default function AdminPage() {
  const [stats, setStats] = useState<StatsType>({
    totalItems: 0,
    totalLost: 0,
    totalFound: 0,
    claims: 0,
    pendingClaims: 0,
  });

  const [items, setItems] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [statsRes, itemsRes] = await Promise.all([
        axios.get("/api/admin/stats"),
        axios.get("/api/admin/items"),
      ]);

      setStats(statsRes.data || {});
      setItems(Array.isArray(itemsRes.data?.payload) ? itemsRes.data.payload : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white">
            <Shield className="h-3 w-3" />
            <span>Admin overview</span>
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-neutral-200">
            High-level view of items, claims and reward activity across the platform.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Items"
          value={stats.totalItems}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          title="Lost Items"
          value={stats.totalLost}
          icon={<Search className="h-4 w-4" />}
        />
        <StatCard
          title="Found Items"
          value={stats.totalFound}
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <StatCard
          title="Claims Processed"
          value={stats.claims}
          icon={<Shield className="h-4 w-4" />}
        />
        <Link href="/admin/claims" className="block">
          <StatCard
            title="Claims Pending"
            value={stats.pendingClaims}
            icon={<Shield className="h-4 w-4" />}
            accent="amber"
          />
        </Link>
        <Link href="/admin/escrows" className="block">
          <StatCard
            title="Escrow Management"
            value={0}
            icon={<Shield className="h-4 w-4" />}
            accent="cyan"
          />
        </Link>
      </div>

      {/* Items Table */}
      <div className="rounded-2xl border border-neutral-800 bg-black shadow-xl shadow-black/60">
        <div className="flex flex-col gap-3 border-b border-neutral-800 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Registered Items
            </h2>
            <p className="text-xs text-neutral-200">
              All on-chain and off-chain items tracked by the system.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-300">
            <span className="rounded-full bg-neutral-800 px-3 py-1">
              Total: {stats.totalItems}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-violet-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-neutral-200">
            No items registered yet. Once users start reporting lost and found items,
            they will appear here for review.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-900 text-white border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4 font-medium">ID</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium min-w-[260px]">
                    Description
                  </th>
                  <th className="py-3 px-4 font-medium">Coordinates</th>
                  <th className="py-3 px-4 font-medium">Reward</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`border-b border-neutral-800 ${
                      index % 2 === 0 ? "bg-black" : "bg-neutral-900"
                    } hover:bg-neutral-800 transition-colors align-top`}
                  >
                    <td className="py-3 px-4 align-middle">
                      <code
                        className="font-mono text-[11px] bg-neutral-900 px-2 py-1 rounded border border-neutral-700 text-neutral-200"
                        title={item.id}
                      >
                        {shortId(item.id)}
                      </code>
                    </td>
                    <td className="py-3 px-4 align-middle">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          item.type === "lost"
                            ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/60"
                            : "bg-green-500/20 text-green-300 ring-1 ring-green-500/60"
                        }`}
                      >
                        {item.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-normal break-words text-white">
                      {item.description}
                    </td>
                    <td className="py-3 px-4 text-neutral-200">
                      {item.latitude && item.longitude
                        ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(
                            4
                          )}`
                        : "-"}
                    </td>
                    <td className="py-3 px-4 text-white">
                      {item.rewardAmount > 0 ? `${item.rewardAmount} ETH` : "-"}
                    </td>
                    <td className="py-3 px-4">
                      {item.isClaimed ? (
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/40">
                          Claimed
                        </span>
                      ) : item.claimReviewStatus === "approved" ? (
                        <span className="inline-flex rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-sky-500/40">
                          Approved • Awaiting payout
                        </span>
                      ) : item.claimReviewStatus === "rejected" ? (
                        <span className="inline-flex rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-medium text-rose-300 ring-1 ring-rose-500/40">
                          Claim rejected
                        </span>
                      ) : item.claimReviewStatus === "pending" ? (
                        <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/40">
                          Pending review
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-700/40 px-2.5 py-0.5 text-[11px] font-medium text-slate-200 ring-1 ring-slate-600/70">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  accent?: "amber" | "cyan";
}) {
  const accentClasses =
    accent === "amber"
      ? "from-amber-500/80 to-orange-500/80 text-amber-50"
      : accent === "cyan"
      ? "from-cyan-500/80 to-sky-500/80 text-cyan-50"
      : "from-violet-500/80 to-purple-500/80 text-violet-50";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/30">
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-br opacity-70 blur-3xl ${accentClasses}`}
      />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {title}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-50">
            {value}
          </h3>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accentClasses}`}
        >
          <span className="text-slate-950">{icon}</span>
        </div>
      </div>
    </div>
  );
}
