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
  MessageSquare,
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

  deliveryMethod?: "in_person" | "shipping" | "drop_off";
  deliveryTrackingId?: string;
  deliveryNotes?: string;
  deliveryPhotos?: string[];
  itemDeliveredAt?: string;

  ownerItemReceived: boolean;
  ownerItemReceivedAt?: string;
  finderFundReceived: boolean;
  finderFundReceivedAt?: string;

  ownerReleaseApproved: boolean;
  ownerReleaseApprovedAt?: string;
  finderReleaseApproved: boolean;
  finderReleaseApprovedAt?: string;
  adminReleaseApproved: boolean;
  adminReleaseApprovedAt?: string;

  autoReleaseAt?: string;
  autoReleaseTriggered: boolean;

  releaseTxHash?: string;
  refundTxHash?: string;

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

const STATE_CONFIG: Record<
  EscrowState,
  {
    label: string;
    color: string;
    icon: React.ReactNode;
    layer: number;
  }
> = {
  funded: {
    label: "Funded",
    color: "bg-emerald-500",
    icon: <Lock className="w-4 h-4" />,
    layer: 1,
  },
  claim_assigned: {
    label: "Finder Assigned",
    color: "bg-blue-500",
    icon: <User className="w-4 h-4" />,
    layer: 1,
  },
  awaiting_delivery: {
    label: "Awaiting Delivery",
    color: "bg-amber-500",
    icon: <Truck className="w-4 h-4" />,
    layer: 2,
  },
  item_delivered: {
    label: "Item Delivered",
    color: "bg-cyan-500",
    icon: <CheckCircle className="w-4 h-4" />,
    layer: 2,
  },
  awaiting_confirmation: {
    label: "Awaiting Confirmation",
    color: "bg-purple-500",
    icon: <Clock className="w-4 h-4" />,
    layer: 2,
  },
  disputed: {
    label: "Disputed",
    color: "bg-red-500",
    icon: <AlertTriangle className="w-4 h-4" />,
    layer: 3,
  },
  released: {
    label: "Released",
    color: "bg-green-500",
    icon: <Unlock className="w-4 h-4" />,
    layer: 3,
  },
  refunded: {
    label: "Refunded",
    color: "bg-gray-500",
    icon: <XCircle className="w-4 h-4" />,
    layer: 3,
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

// ─── Helper: load contract data from public folder ───────────────────────────
async function loadContractData() {
  const res = await fetch("/contract_data.json");
  if (!res.ok)
    throw new Error(
      "Contract data not found. Run 'npm run deploy' in the blockchain folder."
    );
  return res.json();
}

// ─── Helper: get provider + signer ───────────────────────────────────────────
async function getSigner() {
  if (!(window as any).ethereum)
    throw new Error(
      "MetaMask is required for on-chain operations. Please install or enable MetaMask."
    );
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
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
  const [paymentMethod, setPaymentMethod] = useState<"offchain" | "onchain">(
    "onchain"
  );

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

  // ─── On-chain escrow creation ─────────────────────────────────────────────
  // Registers the item on-chain (if not already registered) and funds the escrow
  // in one flow before calling the backend create_escrow action.
  const createOnchainEscrow = async (): Promise<{
    holdTxHash: string;
    amountEth: number;
  }> => {
    const contractData = await loadContractData();
    const signer = await getSigner();
    const signerAddress = await signer.getAddress();
    const contract = new ethers.Contract(
      contractData.address,
      contractData.abi,
      signer
    );

    // ── Step 1: Fetch item details from your API to get reward amount ──────
    const itemRes = await fetch(`/api/items/${itemId}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!itemRes.ok)
      throw new Error("Could not fetch item details for on-chain registration.");
    const itemData = await itemRes.json();
    const item = itemData.item || itemData;

    const rewardEth: number = item.rewardAmount ?? 0;
    const rewardWei = ethers.parseEther(rewardEth.toString());

    // ── Step 2: Check if item is already registered on-chain ──────────────
    const onChainItem = await contract.items(itemId);
    const alreadyRegistered =
      onChainItem.reporterAddress &&
      onChainItem.reporterAddress !== ethers.ZeroAddress;

    if (alreadyRegistered) {
      // Confirm the signer IS the on-chain reporter
      if (
        signerAddress.toLowerCase() !==
        onChainItem.reporterAddress.toLowerCase()
      ) {
        throw new Error(
          `Wallet mismatch. Connected: ${signerAddress.slice(0, 6)}...${signerAddress.slice(-4)}, ` +
            `expected: ${onChainItem.reporterAddress.slice(0, 6)}...${onChainItem.reporterAddress.slice(-4)}. ` +
            `Switch to the correct account in MetaMask.`
        );
      }

      // Item already on-chain; just deposit the reward
      if (rewardWei > BigInt(0)) {
        const depositTx = await contract.depositReward(itemId, {
          value: rewardWei,
        });
        setError("Depositing reward on-chain… waiting for confirmation.");
        const receipt = await depositTx.wait();
        return { holdTxHash: receipt.hash, amountEth: rewardEth };
      }

      // No reward to deposit — escrow will be off-chain funded, return placeholder
      return { holdTxHash: "", amountEth: rewardEth };
    }

    // ── Step 3: Register the item on-chain for the first time ─────────────
    // Build minimal on-chain metadata
    const qrCodeHash = item.qrCodeHash || ethers.keccak256(ethers.toUtf8Bytes(itemId));
    const latitude = Math.round((item.latitude ?? 0) * 1e6);
    const longitude = Math.round((item.longitude ?? 0) * 1e6);
    const description = item.description ?? "";
    const metadataURI = item.metadataURI ?? "";
    const secretHash = item.secretHash
      ? item.secretHash
      : ethers.ZeroHash;

    const registerTx = await contract.registerItem(
      itemId,
      item.type ?? "lost",
      qrCodeHash,
      latitude,
      longitude,
      description,
      metadataURI,
      secretHash,
      { value: rewardWei }
    );

    setError(
      "Registering item on-chain and locking reward… waiting for confirmation."
    );
    const receipt = await registerTx.wait();
    return { holdTxHash: receipt.hash, amountEth: rewardEth };
  };

  // ─── On-chain release (approve_release) ──────────────────────────────────
  const executeOnchainRelease = async (): Promise<string> => {
    const contractData = await loadContractData();
    const signer = await getSigner();
    const signerAddress = await signer.getAddress();
    const contract = new ethers.Contract(
      contractData.address,
      contractData.abi,
      signer
    );

    // Verify on-chain item exists
    const onChainItem = await contract.items(itemId);
    if (
      !onChainItem.reporterAddress ||
      onChainItem.reporterAddress === ethers.ZeroAddress
    ) {
      throw new Error(
        "This item is not registered on-chain. It may have been created before blockchain integration was enabled. " +
          "Please use the off-chain release path or contact support."
      );
    }

    // Verify signer is the on-chain reporter
    if (
      signerAddress.toLowerCase() !==
      onChainItem.reporterAddress.toLowerCase()
    ) {
      throw new Error(
        `Wallet mismatch. Connected: ${signerAddress.slice(0, 6)}...${signerAddress.slice(-4)}, ` +
          `expected reporter: ${onChainItem.reporterAddress.slice(0, 6)}...${onChainItem.reporterAddress.slice(-4)}. ` +
          `Switch to the correct account in MetaMask and try again.`
      );
    }

    if (!escrow?.finderId?.walletAddress) {
      throw new Error(
        "Finder's wallet address is missing. They must connect MetaMask before you can release on-chain."
      );
    }

    const tx = await contract.verifyAndPay(
      itemId,
      escrow.finderId.walletAddress,
      ""
    );
    setError("Transaction sent. Waiting for confirmation…");
    const receipt = await tx.wait();
    return receipt.hash;
  };

  const handleAction = async (
    action: string,
    extraData: Record<string, unknown> = {}
  ) => {
    setActionLoading(action);
    setError("");

    try {
      let releaseTxHash: string | undefined;
      let onchainCreationData: { holdTxHash?: string; amountEth?: number } = {};

      // ── ON-CHAIN CREATE ESCROW ──────────────────────────────────────────
      if (action === "create_escrow" && paymentMethod === "onchain") {
        try {
          const result = await createOnchainEscrow();
          onchainCreationData = {
            holdTxHash: result.holdTxHash,
            amountEth: result.amountEth,
          };
        } catch (err: any) {
          setError(err.message || "On-chain escrow creation failed.");
          setActionLoading(null);
          return;
        }
      }

      // ── ON-CHAIN RELEASE ────────────────────────────────────────────────
      if (
        action === "approve_release" &&
        escrow?.paymentMethod === "onchain" &&
        meta?.isOwner
      ) {
        try {
          releaseTxHash = await executeOnchainRelease();
        } catch (err: any) {
          setError(err.message || "Blockchain transaction failed.");
          setActionLoading(null);
          return;
        }
      }

      // ── POST to backend ─────────────────────────────────────────────────
      const response = await fetch("/api/escrow/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          itemId,
          action,
          paymentMethod,
          releaseTxHash,
          ...onchainCreationData,
          ...extraData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Action failed");
        return;
      }

      if (action === "allow_chat" && data.conversationId) {
        router.push(`/chat/${data.conversationId}`);
        return;
      }

      if (data.released === true) {
        setEscrow((prev) =>
          prev ? { ...prev, state: "released", finderFundReceived: true } : prev
        );
      }

      await fetchEscrow();
      setTimeout(() => {
        void fetchEscrow();
      }, 1000);
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
    const hours = Math.floor(
      (ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
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
            <p className="text-slate-400">
              No escrow has been set up for this item yet. The item owner will
              create one once a claim is approved.
            </p>
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
          <p className="text-slate-400">
            No escrow has been set up for this item yet.
          </p>

          <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <label className="text-sm font-medium text-slate-300">
              Escrow Payout Method
            </label>
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
                  <p className="text-sm text-white">
                    Off-chain (System Wallet)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Uses your internal system balance. Fast and gas-free.
                  </p>
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
                  <p className="text-sm text-white">
                    On-chain (Smart Contract)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Registers item &amp; locks reward on Ethereum. Requires
                    MetaMask and gas fees.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={() => handleAction("create_escrow", { paymentMethod })}
            disabled={actionLoading === "create_escrow"}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {actionLoading === "create_escrow"
              ? paymentMethod === "onchain"
                ? "Registering on-chain & creating escrow…"
                : "Creating…"
              : paymentMethod === "onchain"
              ? "Register on Blockchain & Create Escrow"
              : "Create Escrow"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stateConfig = STATE_CONFIG[escrow.state];
  const isClosed =
    escrow.state === "released" || escrow.state === "refunded";
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
          <Badge
            className={`${stateConfig.color} text-white flex items-center gap-1`}
          >
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

        {escrow.state === "released" && (
          <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400 shrink-0" />
            <div>
              <p className="text-green-200 font-semibold">Escrow Released</p>
              <p className="text-green-300 text-xs mt-0.5">
                Funds have been transferred to the finder. This case is closed.
              </p>
            </div>
          </div>
        )}

        {escrow.state === "refunded" && (
          <div className="p-4 bg-slate-500/20 border border-slate-500/50 rounded-lg flex items-center gap-3">
            <XCircle className="w-6 h-6 text-slate-400 shrink-0" />
            <div>
              <p className="text-slate-200 font-semibold">Escrow Refunded</p>
              <p className="text-slate-400 text-xs mt-0.5">
                Funds were returned to the owner. This case is closed.
              </p>
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
              <p className="text-white">
                {escrow.finderId?.fullName || "Not assigned"}
              </p>
            </div>
          </div>

          {meta?.isOwner && escrow.state === "funded" && (
            <Button
              onClick={() => handleAction("assign_finder")}
              disabled={actionLoading === "assign_finder"}
              className="w-full bg-blue-500 hover:bg-blue-400"
            >
              {actionLoading === "assign_finder"
                ? "Assigning..."
                : "Assign Finder"}
            </Button>
          )}

          {meta?.isOwner && escrow.state === "claim_assigned" && (
            <div className="p-3 bg-blue-500/20 border border-blue-500/40 rounded space-y-2">
              <p className="text-blue-200 text-sm">
                Finder assigned:{" "}
                <strong>{escrow.finderId?.fullName}</strong>
              </p>
              <p className="text-slate-400 text-xs">
                Click below to notify the finder to begin delivery.
              </p>
              <Button
                onClick={() => handleAction("proceed_to_delivery")}
                disabled={actionLoading === "proceed_to_delivery"}
                className="w-full bg-amber-500 hover:bg-amber-400"
              >
                {actionLoading === "proceed_to_delivery"
                  ? "Notifying..."
                  : "Notify Finder to Deliver"}
              </Button>
            </div>
          )}

          {meta?.isFinder && escrow.state === "claim_assigned" && (
            <div className="p-3 bg-slate-800 rounded">
              <p className="text-slate-300 text-sm">
                You have been assigned as the finder.
              </p>
              <p className="text-slate-400 text-xs mt-1">
                Waiting for owner to initiate delivery phase...
              </p>
            </div>
          )}
        </div>

        {/* Layer 2: Delivery & Verification */}
        {(
          [
            "claim_assigned",
            "awaiting_delivery",
            "item_delivered",
            "awaiting_confirmation",
          ] as EscrowState[]
        ).includes(escrow.state) && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Layer 2: Delivery & Verification
            </h3>

            {escrow.state === "awaiting_delivery" && meta?.isFinder && (
              <div className="space-y-3 p-3 bg-slate-800 rounded">
                <p className="text-sm text-slate-300">Initiate Delivery</p>
                <select
                  value={deliveryForm.method}
                  onChange={(e) =>
                    setDeliveryForm({
                      ...deliveryForm,
                      method: e.target.value as
                        | "in_person"
                        | "shipping"
                        | "drop_off",
                    })
                  }
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
                    onChange={(e) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        trackingId: e.target.value,
                      })
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  />
                )}
                <textarea
                  placeholder="Delivery notes (optional)"
                  value={deliveryForm.notes}
                  onChange={(e) =>
                    setDeliveryForm({
                      ...deliveryForm,
                      notes: e.target.value,
                    })
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  rows={2}
                />
                <Button
                  onClick={() =>
                    handleAction("initiate_delivery", {
                      deliveryMethod: deliveryForm.method,
                      deliveryTrackingId: deliveryForm.trackingId,
                      deliveryNotes: deliveryForm.notes,
                    })
                  }
                  disabled={actionLoading === "initiate_delivery"}
                  className="w-full bg-amber-500 hover:bg-amber-400"
                >
                  {actionLoading === "initiate_delivery"
                    ? "Initiating..."
                    : "Initiate Delivery"}
                </Button>
              </div>
            )}

            {escrow.state === "awaiting_delivery" && meta?.isFinder && (
              <Button
                onClick={() => handleAction("mark_item_delivered")}
                disabled={actionLoading === "mark_item_delivered"}
                className="w-full bg-cyan-500 hover:bg-cyan-400"
              >
                {actionLoading === "mark_item_delivered"
                  ? "Marking..."
                  : "Mark Item Delivered"}
              </Button>
            )}

            {escrow.state === "item_delivered" &&
              meta?.isOwner &&
              !escrow.ownerItemReceived && (
                <Button
                  onClick={() => handleAction("confirm_item_received")}
                  disabled={actionLoading === "confirm_item_received"}
                  className="w-full bg-green-500 hover:bg-green-400"
                >
                  {actionLoading === "confirm_item_received"
                    ? "Confirming..."
                    : "Confirm Item Received"}
                </Button>
              )}

            {escrow.deliveryMethod && (
              <div className="p-3 bg-slate-700 rounded text-sm space-y-1 border border-slate-500">
                <p className="text-white">
                  <span className="text-slate-300 font-medium">Method:</span>{" "}
                  {escrow.deliveryMethod.replace("_", " ")}
                </p>
                {escrow.deliveryTrackingId && (
                  <p className="text-white">
                    <span className="text-slate-300 font-medium">
                      Tracking:
                    </span>{" "}
                    {escrow.deliveryTrackingId}
                  </p>
                )}
                {escrow.deliveryNotes && (
                  <p className="text-white">
                    <span className="text-slate-300 font-medium">Notes:</span>{" "}
                    {escrow.deliveryNotes}
                  </p>
                )}
                {escrow.itemDeliveredAt && (
                  <p className="text-white">
                    <span className="text-slate-300 font-medium">
                      Delivered:
                    </span>{" "}
                    {new Date(escrow.itemDeliveredAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {escrow.ownerItemReceived && (
              <div className="p-3 bg-green-500/20 border border-green-500/50 rounded">
                <p className="text-green-200 text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Owner confirmed item received
                </p>
                {!isClosed && (
                  <p className="text-slate-300 text-xs mt-1">
                    Both parties approving release will transfer funds
                    immediately.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Layer 3: Multi-sig Release */}
        {(escrow.state === "awaiting_confirmation" ||
          escrow.state === "item_delivered") && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Layer 3: Multi-sig Release (2-of-3)
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <div
                className={`p-2 rounded text-center text-xs ${
                  escrow.ownerReleaseApproved
                    ? "bg-green-500/30 text-green-200"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                <p>Owner</p>
                <p>{escrow.ownerReleaseApproved ? "✓" : "○"}</p>
              </div>
              <div
                className={`p-2 rounded text-center text-xs ${
                  escrow.finderReleaseApproved
                    ? "bg-green-500/30 text-green-200"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                <p>Finder</p>
                <p>{escrow.finderReleaseApproved ? "✓" : "○"}</p>
              </div>
              <div
                className={`p-2 rounded text-center text-xs ${
                  escrow.adminReleaseApproved
                    ? "bg-green-500/30 text-green-200"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                <p>Admin</p>
                <p>{escrow.adminReleaseApproved ? "✓" : "○"}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
              {meta?.releaseVotes}/3 approvals •{" "}
              {meta?.releaseReady
                ? "Releasing now!"
                : "Both parties approving = instant release"}
            </p>

            {!isClosed && (meta?.isOwner || meta?.isFinder) && (
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
                  ? escrow.paymentMethod === "onchain" && meta?.isOwner
                    ? "Sending on-chain transaction…"
                    : "Approving..."
                  : (meta?.isOwner && escrow.ownerReleaseApproved) ||
                    (meta?.isFinder && escrow.finderReleaseApproved)
                  ? "✓ You have approved release"
                  : escrow.paymentMethod === "onchain" && meta?.isOwner
                  ? "Approve & Release On-Chain"
                  : "Approve Release"}
              </Button>
            )}

            {!isClosed &&
              meta?.isOwner &&
              meta?.releaseReady &&
              escrow.ownerReleaseApproved &&
              escrow.finderReleaseApproved && (
                <Button
                  onClick={() => handleAction("approve_release")}
                  disabled={actionLoading === "approve_release"}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 font-semibold"
                >
                  {actionLoading === "approve_release"
                    ? "Releasing..."
                    : "Finalize & Release Funds"}
                </Button>
              )}

            {meta?.autoReleaseAvailable && (
              <Button
                onClick={() => handleAction("trigger_auto_release")}
                disabled={actionLoading === "trigger_auto_release"}
                className="w-full bg-emerald-500 hover:bg-emerald-400"
              >
                {actionLoading === "trigger_auto_release"
                  ? "Releasing..."
                  : "Trigger Auto-Release"}
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
                  onClick={() =>
                    handleAction("raise_dispute", { disputeReason })
                  }
                  disabled={actionLoading === "raise_dispute"}
                  variant="destructive"
                  className="w-full"
                >
                  {actionLoading === "raise_dispute"
                    ? "Raising..."
                    : "Raise Dispute"}
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
                <p className="text-red-200 text-sm">
                  Dispute raised:{" "}
                  {escrow.disputeReason || "No reason provided"}
                </p>
                <p className="text-red-300 text-xs mt-1">
                  Waiting for admin resolution...
                </p>
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
                Release Tx:{" "}
                <span className="text-cyan-400 font-mono">
                  {escrow.releaseTxHash.slice(0, 20)}...
                </span>
              </p>
            )}
            {escrow.refundTxHash && (
              <p className="text-slate-400">
                Refund Tx:{" "}
                <span className="text-cyan-400 font-mono">
                  {escrow.refundTxHash.slice(0, 20)}...
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
