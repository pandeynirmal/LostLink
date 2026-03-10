"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";

interface ContactRequest {
  _id: string;
  itemId: {
    _id: string;
    description: string;
    rewardAmount?: number;
  } | null;
  requesterId: {
    _id: string;
    fullName: string;
    email: string;
  };
  status: string;
  proposedAmount?: number;
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch("/api/contact-request?status=all&limit=50", {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (res.ok) {
          setRequests(data.requests || []);
        } else {
          setMessage(data.error || "Failed to load requests");
        }
      } catch (err) {
        console.error(err);
        setMessage("Something went wrong.");
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
    const interval = setInterval(fetchRequests, 5000);
    const handleFocus = () => {
      fetchRequests();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const verifyClaim = async (requestId: string): Promise<boolean> => {
    const res = await fetch("/api/contact-request/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requestId, action: "verify_claim" }),
      credentials: "include",
    });

    const data = await res.json();

    if (res.ok) {
      return true;
    }

    if (typeof data.error === "string" && data.error.toLowerCase().includes("already processed")) {
      return true;
    }

    setMessage(data.error || "Approval failed");
    return false;
  };

  const openChatOnly = async (requestId: string): Promise<boolean> => {
    const res = await fetch("/api/contact-request/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requestId, action: "chat_only" }),
      credentials: "include",
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to open chat.");
      return false;
    }
    return true;
  };

  const handleVerifyClaim = async (request: ContactRequest) => {
    try {
      setProcessingId(request._id);
      setMessage(null);

      const approved = await verifyClaim(request._id);
      if (!approved) return;

      setRequests((prev) =>
        prev.map((r) => (r._id === request._id ? { ...r, status: "approved" } : r))
      );
      setMessage("Claim verified. Auto-transfer permission enabled.");
      window.dispatchEvent(new Event("app:refresh-badges"));
    } catch {
      setMessage("Something went wrong.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenChatOnly = async (request: ContactRequest) => {
    try {
      setProcessingId(request._id);
      setMessage(null);
      const opened = await openChatOnly(request._id);
      if (!opened) return;
      setMessage("Chat opened. You can now discuss details.");
      window.dispatchEvent(new Event("app:refresh-badges"));
    } catch {
      setMessage("Something went wrong.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveAndPay = async (request: ContactRequest) => {
    try {
      if (!request.itemId?._id) {
        setMessage("Linked item is unavailable for this request.");
        return;
      }

      setProcessingId(request._id);
      setMessage(null);

      if (request.status === "pending") {
        const approved = await verifyClaim(request._id);
        if (!approved) return;
      }

      const proposedAmount = Number(request.proposedAmount || 0);
      const rewardAmount = Number(request.itemId?.rewardAmount || 0);
      const payoutAmount = proposedAmount > 0 ? proposedAmount : rewardAmount;

      if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
        setMessage("No valid payout amount available for this claim.");
        return;
      }

      const payRes = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          itemId: request.itemId._id,
          requestId: request._id,
          paymentMethod: "onchain",
          rewardAmount: payoutAmount,
          allowOwnerDirectApproval: true,
        }),
      });

      const payData = await payRes.json();

      if (!payRes.ok) {
        setMessage(payData.error || "Approval succeeded but payout failed.");
        return;
      }

      setRequests((prev) => prev.filter((r) => r._id !== request._id));
      setMessage("Claim approved and payout completed.");
      window.dispatchEvent(new Event("app:refresh-badges"));
    } catch {
      setMessage("Something went wrong.");
    } finally {
      setProcessingId(null);
    }
  };

  const deleteClaim = async (requestId: string): Promise<boolean> => {
    const res = await fetch("/api/contact-request", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        scope: "owner",
        requestId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to delete claim.");
      return false;
    }
    return true;
  };

  const handleDeleteClaim = async (request: ContactRequest) => {
    try {
      setProcessingId(request._id);
      setMessage(null);
      const deleted = await deleteClaim(request._id);
      if (!deleted) return;
      setRequests((prev) => prev.filter((r) => r._id !== request._id));
      setMessage("Claim deleted.");
      window.dispatchEvent(new Event("app:refresh-badges"));
    } catch {
      setMessage("Something went wrong.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteAllClaims = async () => {
    try {
      setDeletingAll(true);
      setMessage(null);
      const res = await fetch("/api/contact-request", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          scope: "owner",
          deleteAll: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Failed to delete all claims.");
        return;
      }
      setRequests([]);
      setMessage(`Deleted ${Number(data.deletedCount || 0)} claims.`);
      window.dispatchEvent(new Event("app:refresh-badges"));
    } catch {
      setMessage("Something went wrong.");
    } finally {
      setDeletingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="text-center py-20">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Claims</h1>
          <button
            type="button"
            onClick={handleDeleteAllClaims}
            disabled={deletingAll || requests.length === 0}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50 text-sm"
          >
            {deletingAll ? "Deleting..." : "Delete All Claims"}
          </button>
        </div>

        {message && <p className="text-red-600">{message}</p>}

        {requests.length === 0 ? (
          <p>No claims available.</p>
        ) : (
          requests
            .filter((request) => request?.itemId?._id)
            .map((request) => {
            const proposedAmount = Number(request.proposedAmount || 0);
            const rewardAmount = Number(request.itemId?.rewardAmount || 0);
            const payoutAmount = proposedAmount > 0 ? proposedAmount : rewardAmount;
            const isBusy = processingId === request._id;

            return (
              <div key={request._id} className="border rounded-lg p-4 space-y-4">
                <div className="grid md:grid-cols-2 gap-2 text-sm">
                  <p>
                    <strong>Item:</strong> {request.itemId?.description || "Item unavailable"}
                  </p>
                  <p>
                    <strong>Requested by:</strong> {request.requesterId.fullName} ({request.requesterId.email})
                  </p>
                  <p>
                    <strong>Proposed Claim:</strong> {proposedAmount} ETH
                  </p>
                  <p>
                    <strong>Item Reward:</strong> {rewardAmount} ETH
                  </p>
                  <p>
                    <strong>Payable Now:</strong> {payoutAmount} ETH
                  </p>
                  <p>
                    <strong>Claim Status:</strong> {request.status}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleVerifyClaim(request)}
                    disabled={isBusy || request.status === "approved"}
                    className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    {isBusy ? "Processing..." : request.status === "approved" ? "Claim Verified" : "Verify Claim"}
                  </button>
                  <button
                    onClick={() => handleOpenChatOnly(request)}
                    disabled={isBusy}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    {isBusy ? "Processing..." : "Open Chat Only"}
                  </button>
                  <button
                    onClick={() => handleApproveAndPay(request)}
                    disabled={isBusy}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    {isBusy ? "Processing..." : "Pay & Verify Now"}
                  </button>
                  <button
                    onClick={() => handleDeleteClaim(request)}
                    disabled={isBusy}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    {isBusy ? "Processing..." : "Delete Claim"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
