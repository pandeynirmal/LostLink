"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Truck, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  User,
  Users,
  Lock,
  Unlock,
  MessageSquare
} from "lucide-react";

type EscrowState = 
  | "funded"
  | "claim_assigned"
  | "awaiting_delivery"
  | "item_delivered"
  | "awaiting_confirmation"
  | "disputed"
  | "released"
  | "refunded";

type EscrowData = {
  _id: string;
  itemId: string;
  ownerId: {
    _id: string;
    fullName: string;
    email: string;
    walletAddress?: string;
  };
  finderId?: {
    _id: string;
    fullName: string;
    email: string;
    walletAddress?: string;
  };
  amountEth: number;
  state: EscrowState;
  holdSource: string;
  holdTxHash?: string;
  paymentMethod?: "offchain" | "onchain";
  
  // Layer 2: Delivery
  deliveryMethod?: "in_person" | "shipping" | "drop_off";
  deliveryTrackingId?: string;
  deliveryNotes?: string;
  deliveryPhotos?: string[];
  itemDeliveredAt?: string;
  
  // Confirmations
  ownerItemReceived: boolean;
  ownerItemReceivedAt?: string;
  finderFundReceived: boolean;
  finderFundReceivedAt?: string;
  
  // Layer 3: Multi-sig
  ownerReleaseApproved: boolean;
  ownerReleaseApprovedAt?: string;
  finderReleaseApproved: boolean;
  finderReleaseApprovedAt?: string;
  adminReleaseApproved: boolean;
  adminReleaseApprovedAt?: string;
  
  // Time-lock
  autoReleaseAt?: string;
  autoReleaseTriggered: boolean;
  
  // Transaction hashes
  releaseTxHash?: string;
  refundTxHash?: string;
  
  // Dispute
  disputeReason?: string;
  disputeRaisedBy?: string;
  disputeRaisedAt?: string;
  disputeResolution?: string;
  
  createdAt: string;
  updatedAt: string;
};

type EscrowMeta = {
  isOwner: boolean;
  isFinder: boolean;
  isAdmin: boolean;
  releaseVotes: number;
  releaseReady: boolean;
  autoReleaseAvailable: boolean;
  timeUntilAutoRelease: number | null;
  canRaiseDispute: boolean;
};

const STATE_CONFIG: Record<EscrowState, { 
  label: string; 
  color: string; 
  icon: React.ReactNode;
  layer: number;
}> = {
  funded: { 
    label: "Funded", 
    color: "bg-emerald-500", 
    icon: <Lock className="w-4 h-4" />,
    layer: 1
  },
  claim_assigned: { 
    label: "Finder Assigned", 
    color: "bg-blue-500", 
    icon: <User className="w-4 h-4" />,
    layer: 1
  },
  awaiting_delivery: { 
    label: "Awaiting Delivery", 
    color: "bg-amber-500", 
    icon: <Truck className="w-4 h-4" />,
    layer: 2
  },
  item_delivered: { 
    label: "Item Delivered", 
    color: "bg-cyan-500", 
    icon: <CheckCircle className="w-4 h-4" />,
    layer: 2
  },
  awaiting_confirmation: { 
    label: "Awaiting Confirmation", 
    color: "bg-purple-500", 
    icon: <Clock className="w-4 h-4" />,
    layer: 2
  },
  disputed: { 
    label: "Disputed", 
    color: "bg-red-500", 
    icon: <AlertTriangle className="w-4 h-4" />,
    layer: 3
  },
  released: { 
    label: "Released", 
    color: "bg-green-500", 
    icon: <Unlock className="w-4 h-4" />,
    layer: 3
  },
  refunded: { 
    label: "Refunded", 
    color: "bg-gray-500", 
    icon: <XCircle className="w-4 h-4" />,
    layer: 3
  },
};

const LAYER_NAMES: Record<number, string> = {
  1: "Layer 1: Funding",
  2: "Layer 2: Verification",
  3: "Layer 3: Resolution",
};

interface EscrowPanelProps {
  itemId: string;
}

export function EscrowPanel({ itemId }: EscrowPanelProps) {
  const router = useRouter();
  const [escrow, setEscrow] = useState<EscrowData | null>(null);
  const [meta, setMeta] = useState<EscrowMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<{
    method: "in_person" | "shipping" | "drop_off";
    trackingId: string;
    notes: string;
  }>({
    method: "in_person",
    trackingId: "",
    notes: "",
  });
  const [disputeReason, setDisputeReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"offchain" | "onchain">("offchain");

  const fetchEscrow = useCallback(async () => {
    try {
      const response = await fetch(`/api/escrow?itemId=${itemId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to load escrow");
        return;
      }

      setEscrow(data.escrow);
      setMeta(data.meta);
      setError("");
    } catch {
      setError("Failed to load escrow");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchEscrow();
    const interval = setInterval(fetchEscrow, 10000);
    return () => clearInterval(interval);
  }, [fetchEscrow]);

  const handleAction = async (action: string, extraData: Record<string, unknown> = {}) => {
    setActionLoading(action);
    try {
      // ON-CHAIN RELEASE LOGIC (CLIENT-SIDE)
      if (action === "approve_release" && escrow?.paymentMethod === "onchain" && meta?.isOwner) {
        try {
          // Check if MetaMask is available
          if (!(window as any).ethereum) {
            setError("MetaMask is required for on-chain payments.");
            return;
          }

          // Fetch contract data
          let contractData;
          try {
            const contractRes = await fetch("/contract_data.json");
            if (!contractRes.ok) throw new Error("Contract data not found. Please run 'npm run deploy' in the blockchain folder.");
            contractData = await contractRes.json();
          } catch (err) {
            setError("Blockchain configuration missing. Run deployment script first.");
            return;
          }

          const provider = new ethers.BrowserProvider((window as any).ethereum);
          const signer = await provider.getSigner();
          const signerAddress = await signer.getAddress();
          
          const contract = new ethers.Contract(contractData.address, contractData.abi, signer);

          // IMPORTANT: Check if the current MetaMask address matches the item's on-chain reporter
          try {
            const onChainItem = await contract.items(itemId);
            const reporterAddress = onChainItem.reporterAddress;
            
            if (signerAddress.toLowerCase() !== reporterAddress.toLowerCase()) {
              setError(`Wallet Mismatch: You are connected as ${signerAddress.slice(0, 6)}...${signerAddress.slice(-4)}, but the item was registered by ${reporterAddress.slice(0, 6)}...${reporterAddress.slice(-4)}. Please switch to the correct account in MetaMask.`);
              return;
            }
          } catch (err) {
            console.error("Failed to verify on-chain owner:", err);
          }

          // We need the finder's address for on-chain verifyAndPay
          const finderAddress = escrow.finderId?.walletAddress;
          if (!finderAddress) {
            setError("Finder's wallet address is missing. They must connect MetaMask first.");
            return;
          }

          console.log(`[On-chain] Releasing reward for item ${itemId} to ${finderAddress}`);
          const tx = await contract.verifyAndPay(itemId, finderAddress, "");
          
          setError("Transaction sent. Waiting for confirmation...");
          await tx.wait();
          
          // Once confirmed on-chain, notify backend to update state
          extraData.releaseTxHash = tx.hash;
        } catch (onchainErr) {
          console.error("On-chain release failed:", onchainErr);
          setError(`Blockchain transaction failed: ${(onchainErr as any).reason || (onchainErr as any).message}`);
          return;
        }
      }

      const response = await fetch("/api/escrow/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemId, action, ...extraData }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Action failed");
        return;
      }

      // Redirect to chat if allow_chat returns a conversationId
      if (action === "allow_chat" && data.conversationId) {
        router.push(`/chat/${data.conversationId}`);
        return;
      }

      // If the API confirmed a release, update local state immediately
      if (data.released === true) {
        setEscrow((prev) => prev ? { ...prev, state: "released", finderFundReceived: true } : prev);
      }

      await fetchEscrow();
      // Force second refetch to ensure DB write is visible
      setTimeout(() => { void fetchEscrow(); }, 1000);
      setError("");
    } catch {
      setError("Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimeRemaining = (ms: number | null) => {
    if (ms === null) return "N/A";
    if (ms <= 0) return "Available now";
    
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="p-6">
          <p className="text-slate-400">Loading escrow...</p>
        </CardContent>
      </Card>
    );
  }

  if (!escrow) {
    // Owner sees create button; finder/others see info message
    if (meta !== null && !meta?.isOwner) {
      return (
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-cyan-400" />
              <CardTitle className="text-white">Three-Layer Escrow</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-slate-400">No escrow has been set up for this item yet. The item owner will create one once a claim is approved.</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="border-slate-700 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-cyan-400" />
            <CardTitle className="text-white">Three-Layer Escrow</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <p className="text-slate-400">No escrow has been set up for this item yet.</p>
          <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <label className="text-sm font-medium text-slate-300">Escrow Payout Method</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="escrowPaymentMethod"
                  value="offchain"
                  checked={paymentMethod === "offchain"}
                  onChange={() => setPaymentMethod("offchain")}
                  disabled={actionLoading === "create_escrow"}
                  className="accent-cyan-500"
                />
                <div>
                  <p className="text-sm text-white">Off-chain (System Wallet)</p>
                  <p className="text-[10px] text-slate-400">Uses your internal system balance. Fast and gas-free.</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="escrowPaymentMethod"
                  value="onchain"
                  checked={paymentMethod === "onchain"}
                  onChange={() => setPaymentMethod("onchain")}
                  disabled={actionLoading === "create_escrow"}
                  className="accent-cyan-500"
                />
                <div>
                  <p className="text-sm text-white">On-chain (Smart Contract)</p>
                  <p className="text-[10px] text-slate-400">Funds held on Ethereum. Requires MetaMask and gas fees.</p>
                </div>
              </label>
            </div>
          </div>
          <Button
            onClick={() => handleAction("create_escrow", { paymentMethod })}
            disabled={actionLoading === "create_escrow"}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {actionLoading === "create_escrow" ? "Creating..." : "Create Escrow"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stateConfig = STATE_CONFIG[escrow.state];
  const isClosed = escrow.state === "released" || escrow.state === "refunded";
  const isDisputed = escrow.state === "disputed";

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-cyan-400" />
            <div>
              <CardTitle className="text-white">Three-Layer Escrow</CardTitle>
              <p className="text-sm text-slate-400">
                {LAYER_NAMES[stateConfig.layer]} • {escrow.amountEth} ETH
              </p>
            </div>
          </div>
          <Badge className={`${stateConfig.color} text-white flex items-center gap-1`}>
            {stateConfig.icon}
            {stateConfig.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Released banner */}
        {escrow.state === "released" && (
          <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400 shrink-0" />
            <div>
              <p className="text-green-200 font-semibold">Escrow Released</p>
              <p className="text-green-300 text-xs mt-0.5">Funds have been transferred to the finder. This case is closed.</p>
            </div>
          </div>
        )}

        {/* Refunded banner */}
        {escrow.state === "refunded" && (
          <div className="p-4 bg-slate-500/20 border border-slate-500/50 rounded-lg flex items-center gap-3">
            <XCircle className="w-6 h-6 text-slate-400 shrink-0" />
            <div>
              <p className="text-slate-200 font-semibold">Escrow Refunded</p>
              <p className="text-slate-400 text-xs mt-0.5">Funds were returned to the owner. This case is closed.</p>
            </div>
          </div>
        )}

        {/* Layer 1: Funding Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Layer 1: Funding
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-slate-800 rounded">
              <p className="text-slate-400">Owner</p>
              <p className="text-white">{escrow.ownerId.fullName}</p>
            </div>
            <div className="p-3 bg-slate-800 rounded">
              <p className="text-slate-400">Finder</p>
              <p className="text-white">{escrow.finderId?.fullName || "Not assigned"}</p>
            </div>
          </div>
          
          {/* Assign Finder Button */}
          {meta?.isOwner && escrow.state === "funded" && (
            <Button
              onClick={() => handleAction("assign_finder")}
              disabled={actionLoading === "assign_finder"}
              className="w-full bg-blue-500 hover:bg-blue-400"
            >
              {actionLoading === "assign_finder" ? "Assigning..." : "Assign Finder"}
            </Button>
          )}

          {/* Proceed to Delivery - owner moves from claim_assigned → awaiting_delivery */}
          {meta?.isOwner && escrow.state === "claim_assigned" && (
            <div className="p-3 bg-blue-500/20 border border-blue-500/40 rounded space-y-2">
              <p className="text-blue-200 text-sm">Finder assigned: <strong>{escrow.finderId?.fullName}</strong></p>
              <p className="text-slate-400 text-xs">Click below to notify the finder to begin delivery.</p>
              <Button
                onClick={() => handleAction("proceed_to_delivery")}
                disabled={actionLoading === "proceed_to_delivery"}
                className="w-full bg-amber-500 hover:bg-amber-400"
              >
                {actionLoading === "proceed_to_delivery" ? "Notifying..." : "Notify Finder to Deliver"}
              </Button>
            </div>
          )}

          {/* Finder sees - waiting for owner to proceed */}
          {meta?.isFinder && escrow.state === "claim_assigned" && (
            <div className="p-3 bg-slate-800 rounded">
              <p className="text-slate-300 text-sm">You have been assigned as the finder.</p>
              <p className="text-slate-400 text-xs mt-1">Waiting for owner to initiate delivery phase...</p>
            </div>
          )}
        </div>

        {/* Layer 2: Delivery & Verification */}
        {(["claim_assigned", "awaiting_delivery", "item_delivered", "awaiting_confirmation"] as EscrowState[]).includes(escrow.state) && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Layer 2: Delivery & Verification
            </h3>

            {/* Delivery Actions */}
            {escrow.state === "awaiting_delivery" && meta?.isFinder && (
              <div className="space-y-3 p-3 bg-slate-800 rounded">
                <p className="text-sm text-slate-300">Initiate Delivery</p>
                <select
                  value={deliveryForm.method}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, method: e.target.value as "in_person" | "shipping" | "drop_off" })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="in_person">In Person</option>
                  <option value="shipping">Shipping</option>
                  <option value="drop_off">Drop Off</option>
                </select>
                {deliveryForm.method === "shipping" && (
                  <input
                    type="text"
                    placeholder="Tracking ID"
                    value={deliveryForm.trackingId}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, trackingId: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  />
                )}
                <textarea
                  placeholder="Delivery notes (optional)"
                  value={deliveryForm.notes}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  rows={2}
                />
                <Button
                  onClick={() => handleAction("initiate_delivery", {
                    deliveryMethod: deliveryForm.method,
                    deliveryTrackingId: deliveryForm.trackingId,
                    deliveryNotes: deliveryForm.notes,
                  })}
                  disabled={actionLoading === "initiate_delivery"}
                  className="w-full bg-amber-500 hover:bg-amber-400"
                >
                  {actionLoading === "initiate_delivery" ? "Initiating..." : "Initiate Delivery"}
                </Button>
              </div>
            )}

            {/* Mark Delivered */}
            {escrow.state === "awaiting_delivery" && meta?.isFinder && (
              <Button
                onClick={() => handleAction("mark_item_delivered")}
                disabled={actionLoading === "mark_item_delivered"}
                className="w-full bg-cyan-500 hover:bg-cyan-400"
              >
                {actionLoading === "mark_item_delivered" ? "Marking..." : "Mark Item Delivered"}
              </Button>
            )}

            {/* Confirm Item Received */}
            {escrow.state === "item_delivered" && meta?.isOwner && !escrow.ownerItemReceived && (
              <Button
                onClick={() => handleAction("confirm_item_received")}
                disabled={actionLoading === "confirm_item_received"}
                className="w-full bg-green-500 hover:bg-green-400"
              >
                {actionLoading === "confirm_item_received" ? "Confirming..." : "Confirm Item Received"}
              </Button>
            )}

            {/* Delivery Status */}
            {escrow.deliveryMethod && (
              <div className="p-3 bg-slate-700 rounded text-sm space-y-1 border border-slate-500">
                <p className="text-white"><span className="text-slate-300 font-medium">Method:</span> {escrow.deliveryMethod.replace("_", " ")}</p>
                {escrow.deliveryTrackingId && (
                  <p className="text-white"><span className="text-slate-300 font-medium">Tracking:</span> {escrow.deliveryTrackingId}</p>
                )}
                {escrow.deliveryNotes && (
                  <p className="text-white"><span className="text-slate-300 font-medium">Notes:</span> {escrow.deliveryNotes}</p>
                )}
                {escrow.itemDeliveredAt && (
                  <p className="text-white"><span className="text-slate-300 font-medium">Delivered:</span> {new Date(escrow.itemDeliveredAt).toLocaleString()}</p>
                )}
              </div>
            )}

            {/* Owner Confirmation Status */}
            {escrow.ownerItemReceived && (
              <div className="p-3 bg-green-500/20 border border-green-500/50 rounded">
                <p className="text-green-200 text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Owner confirmed item received
                </p>
                {!isClosed && (
                  <p className="text-slate-300 text-xs mt-1">
                    Both parties approving release will transfer funds immediately.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Layer 3: Multi-sig Release */}
        {(escrow.state === "awaiting_confirmation" || escrow.state === "item_delivered") && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Layer 3: Multi-sig Release (2-of-3)
            </h3>

            {/* Approval Status */}
            <div className="grid grid-cols-3 gap-2">
              <div className={`p-2 rounded text-center text-xs ${escrow.ownerReleaseApproved ? "bg-green-500/30 text-green-200" : "bg-slate-800 text-slate-400"}`}>
                <p>Owner</p>
                <p>{escrow.ownerReleaseApproved ? "✓" : "○"}</p>
              </div>
              <div className={`p-2 rounded text-center text-xs ${escrow.finderReleaseApproved ? "bg-green-500/30 text-green-200" : "bg-slate-800 text-slate-400"}`}>
                <p>Finder</p>
                <p>{escrow.finderReleaseApproved ? "✓" : "○"}</p>
              </div>
              <div className={`p-2 rounded text-center text-xs ${escrow.adminReleaseApproved ? "bg-green-500/30 text-green-200" : "bg-slate-800 text-slate-400"}`}>
                <p>Admin</p>
                <p>{escrow.adminReleaseApproved ? "✓" : "○"}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
              {meta?.releaseVotes}/3 approvals • {meta?.releaseReady ? "Releasing now!" : "Both parties approving = instant release"}
            </p>

            {/* Approve Release Button — only for owner or finder who hasn't approved yet */}
            {!isClosed && (meta?.isOwner || meta?.isFinder) && (
              <div className="space-y-3">
                <Button
                  onClick={() => handleAction("approve_release")}
                  disabled={
                    actionLoading === "approve_release" ||
                    (meta?.isOwner && escrow.ownerReleaseApproved) ||
                    (meta?.isFinder && escrow.finderReleaseApproved)
                  }
                  className="w-full bg-purple-500 hover:bg-purple-400"
                >
                  {actionLoading === "approve_release"
                    ? "Approving..."
                    : (meta?.isOwner && escrow.ownerReleaseApproved) || (meta?.isFinder && escrow.finderReleaseApproved)
                      ? "✓ You have approved release"
                      : "Approve Release"
                  }
                </Button>
              </div>
            )}

            {/* Owner-only: force-complete if both approved but stuck */}
            {!isClosed && meta?.isOwner && meta?.releaseReady && escrow.ownerReleaseApproved && escrow.finderReleaseApproved && (
              <Button
                onClick={() => handleAction("approve_release")}
                disabled={actionLoading === "approve_release"}
                className="w-full bg-emerald-500 hover:bg-emerald-400 font-semibold"
              >
                {actionLoading === "approve_release" ? "Releasing..." : "Finalize & Release Funds"}
              </Button>
            )}

            {/* Auto-release Button */}
            {meta?.autoReleaseAvailable && (
              <Button
                onClick={() => handleAction("trigger_auto_release")}
                disabled={actionLoading === "trigger_auto_release"}
                className="w-full bg-emerald-500 hover:bg-emerald-400"
              >
                {actionLoading === "trigger_auto_release" ? "Releasing..." : "Trigger Auto-Release"}
              </Button>
            )}
          </div>
        )}

        {/* Dispute Section */}
        {!isClosed && meta?.canRaiseDispute && (
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <h3 className="text-sm font-medium text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Dispute Resolution
            </h3>

            {!isDisputed ? (
              <div className="space-y-2">
                <textarea
                  placeholder="Reason for dispute (optional)"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full bg-slate-800 border border-red-500/30 rounded px-3 py-2 text-white text-sm"
                  rows={2}
                />
                <Button
                  onClick={() => handleAction("raise_dispute", { disputeReason })}
                  disabled={actionLoading === "raise_dispute"}
                  variant="destructive"
                  className="w-full"
                >
                  {actionLoading === "raise_dispute" ? "Raising..." : "Raise Dispute"}
                </Button>
              </div>
            ) : meta?.isAdmin ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleAction("resolve_dispute_release")}
                  disabled={actionLoading === "resolve_dispute_release"}
                  className="bg-green-500 hover:bg-green-400"
                >
                  Release to Finder
                </Button>
                <Button
                  onClick={() => handleAction("resolve_dispute_refund")}
                  disabled={actionLoading === "resolve_dispute_refund"}
                  variant="destructive"
                >
                  Refund Owner
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded">
                <p className="text-red-200 text-sm">Dispute raised: {escrow.disputeReason || "No reason provided"}</p>
                <p className="text-red-300 text-xs mt-1">Waiting for admin resolution...</p>
              </div>
            )}
          </div>
        )}

        {/* Chat Button */}
        {escrow.finderId && !isClosed && (
          <Button
            onClick={() => handleAction("allow_chat")}
            disabled={actionLoading === "allow_chat"}
            variant="outline"
            className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {actionLoading === "allow_chat" ? "Opening..." : "Open Chat"}
          </Button>
        )}

        {/* Transaction Hashes */}
        {(escrow.releaseTxHash || escrow.refundTxHash) && (
          <div className="pt-4 border-t border-slate-700 space-y-2 text-sm">
            {escrow.releaseTxHash && (
              <p className="text-slate-400">
                Release Tx: <span className="text-cyan-400 font-mono">{escrow.releaseTxHash.slice(0, 20)}...</span>
              </p>
            )}
            {escrow.refundTxHash && (
              <p className="text-slate-400">
                Refund Tx: <span className="text-cyan-400 font-mono">{escrow.refundTxHash.slice(0, 20)}...</span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
