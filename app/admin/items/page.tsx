"use client";

import { useEffect, useState } from "react";

type AdminItem = {
  id: string;
  type: "lost" | "found";
  description: string;
  latitude?: number;
  longitude?: number;
  rewardAmount: number;
  isClaimed: boolean;
  claimReviewStatus?: "pending" | "approved" | "rejected" | null;
};

function shortId(id: string) {
  if (!id) return "-";
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export default function AdminItemsPage() {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch("/api/admin/items", {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load items");
          return;
        }
        setItems(Array.isArray(data?.payload) ? data.payload : []);
      } catch {
        setError("Failed to load items");
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  if (loading)
    return (
      <p className="text-white py-8">Loading items...</p>
    );
  if (error)
    return (
      <p className="text-red-400 py-8">{error}</p>
    );

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white">
          Items
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">Items</h1>
        <p className="mt-1 text-sm text-neutral-300">
          Overview of all reported lost and found items.
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-black overflow-hidden shadow-xl shadow-black/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 border-b border-neutral-800 text-white">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold min-w-[320px]">
                  Description
                </th>
                <th className="px-4 py-3 font-semibold">Coordinates</th>
                <th className="px-4 py-3 font-semibold">Reward</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={item.id}
                  className={`border-b border-neutral-800 align-top ${
                    index % 2 === 0 ? "bg-black" : "bg-neutral-900"
                  } hover:bg-neutral-800 transition-colors`}
                >
                  <td className="px-4 py-3">
                    <code
                      className="font-mono text-xs bg-neutral-900 px-2 py-1 rounded border border-neutral-700 text-neutral-200"
                      title={item.id}
                    >
                      {shortId(item.id)}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        item.type === "lost"
                          ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/60"
                          : "bg-green-500/20 text-green-300 ring-1 ring-green-500/60"
                      }`}
                    >
                      {item.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-normal break-words text-white">
                    {item.description || "-"}
                  </td>
                  <td className="px-4 py-3 text-neutral-200">
                    {typeof item.latitude === "number" &&
                    typeof item.longitude === "number"
                      ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-white">
                    {item.rewardAmount > 0 ? `${item.rewardAmount} ETH` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {item.isClaimed ? (
                      <span className="text-green-400 font-medium">
                        Claimed
                      </span>
                    ) : item.claimReviewStatus === "approved" ? (
                      <span className="text-green-300 font-medium">
                        Approved - Awaiting Payout
                      </span>
                    ) : item.claimReviewStatus === "rejected" ? (
                      <span className="text-red-400 font-medium">
                        Claim Rejected
                      </span>
                    ) : item.claimReviewStatus === "pending" ? (
                      <span className="text-yellow-300 font-medium">
                        Pending Review
                      </span>
                    ) : (
                      <span className="text-neutral-300">Active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
