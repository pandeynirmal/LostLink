"use client";

import { useEffect, useState } from "react";

type Claim = {
  _id: string;
  status: string;
  adminStatus?: "pending" | "approved" | "rejected";
  aiMatchScore?: number;
  adminReviewNotes?: string;
  adminDecisionTxHash?: string;
  createdAt: string;
  itemId?: {
    _id: string;
    description: string;
    type: "lost" | "found";
    rewardAmount?: number;
    matchScore?: number;
  };
  ownerId?: {
    _id: string;
    fullName: string;
    email: string;
    walletAddress?: string;
  };
  requesterId?: {
    _id: string;
    fullName: string;
    email: string;
    walletAddress?: string;
  };
};

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [threshold, setThreshold] = useState("90");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);
  const isPendingForReview = (claim: Claim) =>
    !claim.adminStatus || claim.adminStatus === "pending";
  const normalizeScore = (score?: number) => {
    if (typeof score !== "number" || !Number.isFinite(score)) return 0;
    return score <= 1 ? score * 100 : score;
  };

  const fetchClaims = async (status: "pending" | "approved" | "rejected") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/claims?status=${status}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setClaims(data.claims || []);
      } else {
        setMessage(data.error || "Failed to load claims");
      }
    } catch {
      setMessage("Failed to load claims");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims(activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    const fetchThreshold = async () => {
      try {
        const res = await fetch("/api/admin/settings/claim-threshold", {
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) {
          setThreshold(String(data.threshold ?? 90));
        }
      } catch {
        // no-op
      }
    };
    fetchThreshold();
  }, []);

  const decide = async (claimId: string, decision: "approved" | "rejected") => {
    setMessage("");
    try {
      const res = await fetch(`/api/admin/claims/${claimId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          decision,
          notes: notes[claimId] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Decision failed");
        return;
      }

      setMessage(data.message || "Decision saved");
      setClaims((prev) =>
        prev.filter((claim) => claim._id !== claimId)
      );
      fetchClaims(activeFilter);
    } catch {
      setMessage("Decision failed");
    }
  };

  const decideAll = async (decision: "approved" | "rejected") => {
    const pendingClaims = claims.filter(isPendingForReview);
    if (pendingClaims.length === 0) {
      setMessage("No pending claims to process.");
      return;
    }

    setBulkActing(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/claims", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          decision,
          notes: "Bulk decision from admin dashboard",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Bulk decision failed.");
        setBulkActing(false);
        return;
      }

      setMessage(
        data.message ||
          `${decision === "approved" ? "Approved" : "Rejected"} ${pendingClaims.length} claim(s).`
      );
      setClaims((prev) => prev.filter((claim) => !isPendingForReview(claim)));
      await fetchClaims(activeFilter);
    } catch {
      setMessage("Bulk decision failed.");
    } finally {
      setBulkActing(false);
    }
  };

  const saveThreshold = async () => {
    const value = Number(threshold);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setMessage("Threshold must be between 0 and 100.");
      return;
    }

    setSavingThreshold(true);
    try {
      const res = await fetch("/api/admin/settings/claim-threshold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ threshold: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Failed to save threshold.");
        setSavingThreshold(false);
        return;
      }
      setMessage(`Auto-approve threshold saved: ${value}%`);
    } catch {
      setMessage("Failed to save threshold.");
    } finally {
      setSavingThreshold(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white">
            Claims
          </div>
          <h1 className="mt-3 text-2xl font-bold text-white">Claim Review</h1>
          <p className="mt-1 text-sm text-neutral-300">
            Approve or reject ownership claims based on AI confidence and your review.
          </p>
        </div>
        {activeFilter === "pending" && claims.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void decideAll("approved")}
              disabled={bulkActing || loading}
              className="px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-60"
            >
              {bulkActing ? "Processing..." : "Approve All"}
            </button>
            <button
              type="button"
              onClick={() => void decideAll("rejected")}
              disabled={bulkActing || loading}
              className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm disabled:opacity-60"
            >
              {bulkActing ? "Processing..." : "Reject All"}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setActiveFilter(status)}
            className={`px-3 py-2 rounded border text-sm ${
              activeFilter === status
                ? "bg-yellow-500 text-black border-yellow-500"
                : "bg-black text-white border-neutral-600"
            }`}
          >
            {status[0].toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-black p-4 space-y-3">
        <h2 className="font-semibold text-white">Auto-Approval Rule</h2>
        <p className="text-sm text-neutral-300">
          Claims with AI confidence above this value are auto-approved by system governance.
        </p>
        <div className="flex items-center gap-2 max-w-sm">
          <input
            type="number"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-24 rounded border border-neutral-700 bg-black px-2 py-1 text-sm text-white"
          />
          <span className="text-sm text-white">%</span>
          <button
            onClick={saveThreshold}
            className="px-3 py-2 rounded bg-yellow-500 text-black text-sm disabled:opacity-60 hover:bg-yellow-400"
            disabled={savingThreshold}
          >
            {savingThreshold ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-yellow-400">{message}</p>}

      {loading ? (
        <p className="text-white">Loading claims...</p>
      ) : claims.length === 0 ? (
        <p className="text-neutral-200">No {activeFilter} claims.</p>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => (
            <div
              key={claim._id}
              className="rounded-2xl border border-neutral-800 bg-black p-4 space-y-2"
            >
              <p>
                <strong>Item:</strong>{" "}
                <span className="text-white">
                  {claim.itemId?.description || "-"} ({claim.itemId?.type || "-"})
                </span>
              </p>
              <p>
                <strong>Owner:</strong>{" "}
                <span className="text-neutral-200">
                  {claim.ownerId?.fullName || "-"} ({claim.ownerId?.email || "-"})
                </span>
              </p>
              <p>
                <strong>Claimant:</strong>{" "}
                <span className="text-neutral-200">
                  {claim.requesterId?.fullName || "-"} (
                  {claim.requesterId?.email || "-"})
                </span>
              </p>
              <p>
                <strong>AI Confidence:</strong>{" "}
                <span className="text-neutral-100">
                  {Math.round(normalizeScore(claim.aiMatchScore) * 100) / 100}%
                </span>
              </p>
              <p>
                <strong>Reward:</strong>{" "}
                <span className="text-neutral-100">
                  {Number(claim.itemId?.rewardAmount || 0)} ETH
                </span>
              </p>
              {claim.adminDecisionTxHash && (
                <p>
                  <strong>Decision Tx:</strong>{" "}
                  <span className="text-neutral-100">
                    {claim.adminDecisionTxHash}
                  </span>
                </p>
              )}
              {isPendingForReview(claim) && (
                <div className="space-y-2">
                  <textarea
                    value={notes[claim._id] || ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [claim._id]: e.target.value }))
                    }
                    placeholder="Add admin notes..."
                    className="w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide(claim._id, "approved")}
                      className="px-3 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-60 hover:bg-green-500"
                      disabled={bulkActing}
                    >
                      Approve Claim
                    </button>
                    <button
                      onClick={() => decide(claim._id, "rejected")}
                      className="px-3 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-60 hover:bg-red-500"
                      disabled={bulkActing}
                    >
                      Reject Claim
                    </button>
                  </div>
                </div>
              )}
              {!isPendingForReview(claim) && (
                <p className="text-neutral-100">
                  <strong>Decision:</strong> {claim.adminStatus}
                  {claim.adminReviewNotes ? ` (${claim.adminReviewNotes})` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
