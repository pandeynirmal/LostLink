"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface User {
  _id: string;
  fullName: string;
  email: string;
  role: string;
  organization?: string;
  isVerified?: boolean;
  createdAt?: string;
}

interface UserStats {
  totalItems: number;
  lostItems: number;
  foundItems: number;
  resolvedItems: number;
  claimedItems: number;
  totalRewardsGiven: number;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          credentials: "include",
        });

        const data = await res.json();

        if (res.ok) {
          setUser(data.user);
          setStats(data.stats);
          setItems(data.items || []);
        } else {
          console.error(data.message);
        }
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [id]);

  if (loading)
    return (
      <div className="p-6">
        <p>Loading user...</p>
      </div>
    );

  if (!user)
    return (
      <div className="p-6">
        <p>User not found.</p>
      </div>
    );

  return (
    <div className="space-y-6 p-6">
      <button
        onClick={() => router.back()}
        className="text-sm text-violet-300 hover:underline"
      >
         Back to Users
      </button>

      {/* User Profile Card */}
      <div className="rounded-xl p-6 space-y-4 border border-neutral-800 bg-neutral-900">
        <h1 className="text-3xl font-bold text-white">
          {user.fullName}
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Info label="Email" value={user.email} />
          <Info label="Role" value={user.role} capitalize />
          <Info label="Organization" value={user.organization || "N/A"} />
          <Info label="Verified" value={user.isVerified ? "Yes" : "No"} />
          <Info
            label="Joined"
            value={
              user.createdAt
                ? new Date(user.createdAt).toLocaleDateString()
                : "N/A"
            }
          />
        </div>
      </div>

      {/* Stats Section */}
      {stats && (
        <div className="rounded-xl p-6 border border-neutral-800 bg-neutral-900">
          <h2 className="text-xl font-bold text-white mb-4">
            User Activity
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Total Items" value={stats.totalItems} />
            <StatCard label="Lost Items" value={stats.lostItems} />
            <StatCard label="Found Items" value={stats.foundItems} />
            <StatCard label="Resolved Items" value={stats.resolvedItems} />
            <StatCard label="Claimed Items" value={stats.claimedItems} />
            <StatCard label="Total Rewards" value={stats.totalRewardsGiven} />
          </div>
        </div>
      )}

      {/* Items Section */}
      <div className="rounded-xl p-6 border border-neutral-800 bg-neutral-900">
        <h2 className="text-xl font-bold text-white mb-4">
          User Items
        </h2>

        {items.length === 0 ? (
          <p className="text-neutral-400">No items found.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item._id}
                className="border border-neutral-800 rounded-lg p-4 bg-black/60 space-y-2"
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold capitalize text-white">
                    {item.type} Item
                  </span>
                  <span className="text-sm text-neutral-400 capitalize">
                    Status: {item.status}
                  </span>
                </div>

                <p className="text-sm text-neutral-300">
                  {item.description}
                </p>

                {/* Blockchain Section */}
                {item.blockchain?.txHash && (
                  <div className="text-xs text-neutral-400 border-t border-neutral-800 pt-2">
                    <p className="font-semibold text-white">Blockchain Record</p>
                    <p>Action: {item.blockchain.action}</p>
                    <p>Network: {item.blockchain.network}</p>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${item.blockchain.txHash}`}
                      target="_blank"
                      className="text-violet-300 underline"
                    >
                      View Transaction
                    </a>
                  </div>
                )}

                {/* Delete Button */}
                <button
                  onClick={async () => {
                    if (!confirm("Delete this item?")) return;

                    await fetch(`/api/admin/items/${item._id}`, {
                      method: "DELETE",
                      credentials: "include",
                    });

                    setItems((prev) =>
                      prev.filter((i) => i._id !== item._id)
                    );
                  }}
                  className="text-red-400 text-sm hover:underline"
                >
                  Remove Item
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------ Components ------------------ */

function Info({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <p className="text-neutral-400 text-sm">{label}</p>
      <p className={`font-medium text-white ${capitalize ? "capitalize" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-black/60 border border-neutral-800 rounded-lg p-4 text-center">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="text-xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}
