"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Search, Eye, CheckCircle2, Clock, AlertCircle, Trash2, XCircle, Shield, MessageSquare } from "lucide-react";

interface Upload {
  _id: string;
  type: "lost" | "found";
  description: string;
  imageUrl: string;
  status: "pending" | "matched" | "resolved";
  matchScore: number | null;
  rewardAmount?: number;
  isClaimed?: boolean;
  txHash: string | null;
  createdAt: string;
  matchedItem: {
    id: string;
    description: string;
    imageUrl: string;
    type: string;
    matchScore?: number | null;
  } | null;
}

type UploadHistoryClaim = {
  id: string;
  status: string;
  adminStatus: string;
  proposedAmount: number;
  aiMatchScore: number;
  requester: {
    fullName: string;
    email: string;
    walletAddress: string;
  };
  owner: {
    fullName: string;
    email: string;
    walletAddress: string;
  };
  createdAt: string;
  adminReviewedAt?: string | null;
  adminReviewNotes?: string;
};

type UploadHistoryTx = {
  id: string;
  paymentMethod: "onchain" | "razorpay" | "metamask";
  amountEth: number;
  status: string;
  txHash: string;
  anchorTxHash?: string;
  settlementProofTxHash?: string;
  network?: string;
  from: {
    fullName: string;
    email: string;
    walletAddress: string;
  };
  to: {
    fullName: string;
    email: string;
    walletAddress: string;
  };
  createdAt: string;
};

type UploadHistoryData = {
  item: {
    id: string;
    type: "lost" | "found";
    description: string;
    status: string;
    matchScore?: number;
    rewardAmount: number;
    isClaimed: boolean;
    rewardTxHash?: string;
    createdAt: string;
    matchedItem?: {
      id: string;
      description: string;
      type: "lost" | "found";
      matchScore?: number;
    } | null;
  };
  claims: UploadHistoryClaim[];
  transactions: UploadHistoryTx[];
};

type VerifyContext = {
  receiverName: string;
  receiverWalletAddress: string;
  rewardAmount: number;
  itemDescription: string;
};
type VerifyReviewState = "ready" | "pending_admin" | "missing";

export default function MyUploadsPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "lost" | "found">("all");
  const [verifyTarget, setVerifyTarget] = useState<Upload | null>(null);
  const [verifyMethod, setVerifyMethod] = useState<"onchain" | "razorpay" | "metamask">("onchain");
  const [verifyRewardAmount, setVerifyRewardAmount] = useState<string>("");
  const [verifyReference, setVerifyReference] = useState<string>("");
  const [verifyMessage, setVerifyMessage] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyContext, setVerifyContext] = useState<VerifyContext | null>(null);
  const [loadingVerifyContext, setLoadingVerifyContext] = useState(false);
  const [verifyReviewState, setVerifyReviewState] = useState<VerifyReviewState>("ready");
  const [pageNotice, setPageNotice] = useState<string>("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string>("");
  const [historyData, setHistoryData] = useState<UploadHistoryData | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Upload | null>(null);
  const [hasMetaMask, setHasMetaMask] = useState(false);
  const [requestingClaimId, setRequestingClaimId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [claimStatusByItemId, setClaimStatusByItemId] = useState<Record<string, "pending" | "approved">>({});

  useEffect(() => {
    fetchUploads();
    setHasMetaMask(typeof window !== "undefined" && Boolean((window as any).ethereum));
  }, []);

  const fetchUploads = async () => {
    try {
      const [response, pendingReqResponse] = await Promise.all([
        fetch("/api/uploads/my", {
          credentials: "include",
        }),
        fetch("/api/contact-request?scope=requester&status=all&limit=200", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      if (response.status === 401) {
        router.push("/signin");
        return;
      }

      const data = await response.json();

      if (data.success) {
        setUploads(data.items);
      } else {
        setError(data.error || "Failed to fetch uploads");
      }

      if (pendingReqResponse.ok) {
        const pendingData = await pendingReqResponse.json();
        const statusMap: Record<string, "pending" | "approved"> = {};
        for (const req of pendingData.requests || []) {
          const linkedItemId = req?.itemId?._id?.toString?.() || req?.itemId?.toString?.();
          const reqStatus = req?.status === "approved" ? "approved" : "pending";
          if (linkedItemId && !statusMap[linkedItemId]) {
            statusMap[linkedItemId] = reqStatus;
          }
        }
        setClaimStatusByItemId(statusMap);
      } else {
        setClaimStatusByItemId({});
      }
    } catch {
      setError("Failed to load uploads. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string, matchScore: number | null) => {
    const normalizedScore =
      typeof matchScore === "number"
        ? matchScore <= 1
          ? matchScore * 100
          : matchScore
        : null;

    switch (status) {
      case "matched":
        return (
          <Badge className="bg-black/85 text-white border-green-300/70 backdrop-blur-md shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Matched{" "}
            {normalizedScore !== null
              ? `(${Math.round(normalizedScore * 100) / 100}%)`
              : ""}
          </Badge>
        );
      case "resolved":
        return (
          <Badge className="bg-black/85 text-white border-blue-300/70 backdrop-blur-md shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Resolved
          </Badge>
        );
      default:
        return (
          <Badge className="bg-black/85 text-white border-amber-300/70 backdrop-blur-md shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: "lost" | "found") =>
    type === "lost" ? (
      <Badge className="bg-black/85 text-white border-red-300/70 backdrop-blur-md shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        <Search className="w-3 h-3 mr-1" />
        Lost
      </Badge>
    ) : (
      <Badge className="bg-black/85 text-white border-emerald-300/70 backdrop-blur-md shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        <Eye className="w-3 h-3 mr-1" />
        Found
      </Badge>
    );

  const filteredUploads =
    filter === "all" ? uploads : uploads.filter((u) => u.type === filter);

  const openVerifyModal = async (upload: Upload) => {
    setVerifyTarget(upload);
    setVerifyMethod("onchain");
    setVerifyReference("");
    setVerifyContext(null);
    setLoadingVerifyContext(true);
    setVerifyReviewState("ready");
    setVerifyRewardAmount(
      Number(upload.rewardAmount || 0) > 0 ? String(upload.rewardAmount) : ""
    );
    setVerifyMessage("");

    try {
      const res = await fetch(`/api/verify?itemId=${upload._id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorText = String(data.error || "Could not load receiver details.");
        if (errorText.toLowerCase().includes("pending admin review")) {
          setVerifyReviewState("pending_admin");
          setVerifyMessage(
            "Claim is in review queue. Your reward will transfer automatically after admin verification."
          );
        } else {
          setVerifyReviewState("missing");
          setVerifyMessage(errorText);
        }
        return;
      }

      setVerifyContext(data.context);
      if ((!upload.rewardAmount || Number(upload.rewardAmount) <= 0) && Number(data.context.rewardAmount) > 0) {
        setVerifyRewardAmount(String(data.context.rewardAmount));
      }
    } catch {
      setVerifyMessage("Could not load verify context.");
    } finally {
      setLoadingVerifyContext(false);
    }
  };

  const closeVerifyModal = () => {
    setVerifyTarget(null);
    setVerifyReference("");
    setVerifyRewardAmount("");
    setVerifyMessage("");
    setIsVerifying(false);
    setVerifyContext(null);
    setLoadingVerifyContext(false);
    setVerifyReviewState("ready");
  };

  const openHistoryModal = async (upload: Upload) => {
    setHistoryTarget(upload);
    setHistoryData(null);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/uploads/my/${upload._id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setHistoryError(data.error || "Failed to load history.");
        return;
      }
      setHistoryData(data);
    } catch {
      setHistoryError("Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setHistoryTarget(null);
    setHistoryData(null);
    setHistoryError("");
    setHistoryLoading(false);
  };

  const handleVerify = async () => {
    if (!verifyTarget) return;

    if (verifyReviewState === "pending_admin") {
      setPageNotice(
        "Claim queued for verification. Your reward will be transferred automatically once admin approval is completed."
      );
      closeVerifyModal();
      return;
    }

    const amount = Number(verifyRewardAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setVerifyMessage("Enter a reward amount greater than 0.");
      return;
    }

    if (verifyMethod === "razorpay" && !verifyReference.trim()) {
      setVerifyMessage("Enter Razorpay payment reference ID.");
      return;
    }

    setIsVerifying(true);
    setVerifyMessage("");

    try {
      if (verifyMethod === "metamask") {
        if (!verifyContext?.receiverWalletAddress) {
          setVerifyMessage("Receiver wallet address not available.");
          setIsVerifying(false);
          return;
        }

        const eth = (window as any).ethereum;
        if (!eth) {
          setVerifyMessage("MetaMask not detected.");
          setIsVerifying(false);
          return;
        }

        const provider = new ethers.BrowserProvider(eth);
        const signer = await provider.getSigner();
        const fromAddress = await signer.getAddress();

        const tx = await signer.sendTransaction({
          to: verifyContext.receiverWalletAddress,
          value: ethers.parseEther(amount.toString()),
        });

        await tx.wait();

        const recordRes = await fetch("/api/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            itemId: verifyTarget._id,
            paymentMethod: "metamask",
            rewardAmount: amount,
            txHash: tx.hash,
            fromAddress,
          }),
        });

        const recordData = await recordRes.json();
        if (!recordRes.ok || !recordData.success) {
          setVerifyMessage(recordData.error || "Failed to verify MetaMask transaction.");
          setIsVerifying(false);
          return;
        }

        setVerifyMessage(recordData.message || "MetaMask payment verified.");
        await fetchUploads();
        setTimeout(() => closeVerifyModal(), 700);
        return;
      }

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          itemId: verifyTarget._id,
          paymentMethod: verifyMethod,
          externalPaymentId: verifyReference.trim(),
          rewardAmount: amount,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setVerifyMessage(data.error || "Verification failed.");
        setIsVerifying(false);
        return;
      }

      setVerifyMessage(data.message || "Verification successful.");
      await fetchUploads();
      setTimeout(() => {
        closeVerifyModal();
      }, 700);
    } catch {
      setVerifyMessage("Failed to connect to server.");
      setIsVerifying(false);
    }
  };

  const handleSendClaimRequest = async (upload: Upload) => {
    if (!upload.matchedItem?.id) {
      setPageNotice("Matched item details are not available yet. Please try again.");
      return;
    }

    try {
      setRequestingClaimId(upload._id);
      setPageNotice("");
      const currentClaimStatus = claimStatusByItemId[upload.matchedItem.id] || "";
      const isPendingRequest = currentClaimStatus === "pending";
      const isApprovedRequest = currentClaimStatus === "approved";

      if (isApprovedRequest) {
        setPageNotice("Request already sent and approved.");
        return;
      }

      const response = await fetch("/api/contact-request", {
        method: isPendingRequest ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(
          isPendingRequest
            ? { itemId: upload.matchedItem.id }
            : {
                itemId: upload.matchedItem.id,
                proposedAmount: 0,
              }
        ),
      });

      const data = await response.json();
      if (!response.ok) {
        if (
          !isPendingRequest &&
          typeof data.error === "string" &&
          (data.error.toLowerCase().includes("already sent") ||
            data.error.toLowerCase().includes("already claimed"))
        ) {
          setPageNotice(data.error);
          await fetchUploads();
          return;
        }
        setPageNotice(data.error || "Failed to update claim request.");
        return;
      }

      if (isPendingRequest) {
        setClaimStatusByItemId((prev) => {
          const next = { ...prev };
          delete next[upload.matchedItem!.id];
          return next;
        });
        setPageNotice("Claim request canceled.");
      } else {
        setClaimStatusByItemId((prev) => ({
          ...prev,
          [upload.matchedItem!.id]: "pending",
        }));
        setPageNotice("Claim request sent. Owner will review it.");
      }
      window.dispatchEvent(new Event("app:refresh-badges"));
      await fetchUploads();
    } catch {
      setPageNotice("Failed to update claim request.");
    } finally {
      setRequestingClaimId(null);
    }
  };

  const handleDeleteUpload = async (e: React.MouseEvent, upload: Upload) => {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete this upload? \n\nThis will permanently remove the item from our database and delete the associated image to save space. \n\nNote: Any existing blockchain records associated with this item ID (${upload._id}) will remain immutable and permanent on the network.`)) {
      return;
    }

    setIsDeletingId(upload._id);
    setPageNotice("");

    try {
      const response = await fetch(`/api/item/${upload._id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        setPageNotice(data.error || "Failed to delete item.");
        return;
      }

      setPageNotice("Item deleted successfully.");
      await fetchUploads();
    } catch {
      setPageNotice("Failed to connect to server.");
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`WARNING: Are you sure you want to delete ALL your uploads? \n\nThis will permanently remove all items and images from our database to save space. \n\nBlockchain records will remain immutable.`)) {
      return;
    }

    setIsDeletingAll(true);
    setPageNotice("");

    try {
      const response = await fetch("/api/uploads/my", {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        setPageNotice(data.error || "Failed to delete items.");
        return;
      }

      setPageNotice("All items deleted successfully.");
      await fetchUploads();
    } catch {
      setPageNotice("Failed to connect to server.");
    } finally {
      setIsDeletingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-16">
          <LoadingSpinner />
          <p className="mt-4 text-muted-foreground">Loading your uploads...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold">My Uploads</h1>
          {uploads.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              disabled={isDeletingAll}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {isDeletingAll ? "Deleting All..." : "Delete All Uploads"}
            </Button>
          )}
        </div>
        {pageNotice && (
          <Card className="mb-6 border-blue-300 bg-blue-50">
            <CardContent className="py-3 text-blue-800 text-sm">{pageNotice}</CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive bg-destructive/5 mb-6">
            <CardContent className="py-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {filteredUploads.length === 0 ? (
          <p className="text-muted-foreground">No uploads yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUploads.map((upload) => (
              <Card
                key={upload._id}
                className="overflow-hidden cursor-pointer hover:shadow-md transition group"
                onClick={() => void openHistoryModal(upload)}
              >
                <div className="relative aspect-video bg-muted">
                  <Image
                    src={upload.imageUrl}
                    alt={upload.description}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-2 left-2">{getTypeBadge(upload.type)}</div>
                  <div className="absolute top-2 right-2 flex gap-2">
                    {getStatusBadge(upload.status, upload.matchScore)}
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-6 w-6 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteUpload(e, upload)}
                      disabled={isDeletingId === upload._id}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2 line-clamp-1">{upload.description}</h3>

                  {/* Link to item page with escrow panel */}
                  <Link
                    href={`/item/${upload._id}`}
                    className="block text-xs text-cyan-600 hover:underline mb-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Item &amp; Escrow Panel →
                  </Link>

                  {upload.type === "lost" && upload.status === "matched" && !upload.isClaimed && (
                      <Button
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openVerifyModal(upload);
                        }}
                      >
                        Verify & Pay Reward
                      </Button>
                    )}

                  {upload.type === "lost" && upload.status === "matched" && upload.isClaimed && (
                      <Button
                        size="sm"
                        className="w-full bg-gray-400 cursor-not-allowed text-white"
                        disabled
                      >
                        Reward Already Paid
                      </Button>
                    )}

                  {upload.type === "found" &&
                    upload.matchedItem &&
                    (upload.status === "matched" || Number(upload.matchScore || 0) >= 50) &&
                    !upload.isClaimed && (
                    <Button
                      size="sm"
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white mt-2"
                      disabled={
                        requestingClaimId === upload._id ||
                        claimStatusByItemId[upload.matchedItem?.id || ""] === "approved"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleSendClaimRequest(upload);
                      }}
                    >
                      {requestingClaimId === upload._id
                        ? "Updating..."
                        : claimStatusByItemId[upload.matchedItem?.id || ""] === "approved"
                        ? "Request Already Sent"
                        : claimStatusByItemId[upload.matchedItem?.id || ""] === "pending"
                        ? "Claim Requested (Cancel)"
                        : "Send Claim Request"}
                    </Button>
                  )}

                  {upload.isClaimed && (
                    <p className="text-xs text-green-700 mt-2 font-medium">Claimed / Resolved</p>
                  )}

                  {upload.txHash && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      Tx: {upload.txHash}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {verifyTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-700 p-6 space-y-6 shadow-2xl">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Verify & Pay
              </h2>
              <p className="text-sm text-slate-400 italic">Item: {verifyTarget.description}</p>
            </div>

            {loadingVerifyContext ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <LoadingSpinner />
                <span>Loading receiver details...</span>
              </div>
            ) : verifyContext ? (
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Receiver</p>
                <p className="text-sm text-white font-medium">{verifyContext.receiverName}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">{verifyContext.receiverWalletAddress}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Reward Amount (ETH)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={verifyRewardAmount}
                onChange={(e) => setVerifyRewardAmount(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-green-500 outline-none transition"
                placeholder="e.g. 0.05"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setVerifyMethod("onchain")}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                    verifyMethod === "onchain"
                      ? "bg-green-600 text-white border-green-600 shadow-lg shadow-green-900/20"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"
                  }`}
                >
                  On-chain
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyMethod("razorpay")}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                    verifyMethod === "razorpay"
                      ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-900/20"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"
                  }`}
                >
                  Razorpay
                </button>
                {hasMetaMask && (
                  <button
                    type="button"
                    onClick={() => setVerifyMethod("metamask")}
                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                      verifyMethod === "metamask"
                        ? "bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-900/20"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"
                    }`}
                  >
                    MetaMask
                  </button>
                )}
              </div>
            </div>

            {verifyMethod === "razorpay" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">
                  Razorpay Payment Reference
                </label>
                <input
                  type="text"
                  value={verifyReference}
                  onChange={(e) => setVerifyReference(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="pay_xxx"
                />
              </div>
            )}

            {verifyMethod === "metamask" && (
              <p className="text-[10px] text-slate-500 italic">
                Direct on-chain payment from your MetaMask wallet to the receiver.
              </p>
            )}
            {!hasMetaMask && (
              <p className="text-[10px] text-amber-500/80 italic">
                MetaMask not detected. Use On-chain or Razorpay.
              </p>
            )}

            {verifyMessage && (
              <div className={`p-3 rounded-lg text-xs flex gap-2 items-start ${
                verifyMessage.includes("locked in an active Escrow") || verifyMessage.includes("must be approved")
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                  : verifyReviewState === "pending_admin" 
                    ? "bg-blue-500/10 border border-blue-500/20 text-blue-400" 
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{verifyMessage}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeVerifyModal}
                className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:bg-slate-800 transition"
                disabled={isVerifying}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerify}
                className={`px-6 py-2 rounded-lg font-bold text-sm text-white transition disabled:opacity-50 ${
                  verifyReviewState === "pending_admin" ? "bg-blue-600 hover:bg-blue-500" : "bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/20"
                }`}
                disabled={isVerifying || loadingVerifyContext}
              >
                {isVerifying
                  ? "Processing..."
                  : verifyReviewState === "pending_admin"
                  ? "Pool for Verification"
                  : "Confirm Verify & Pay"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl bg-slate-900 border border-slate-700 p-6 space-y-6 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Item History</h2>
                <p className="text-sm text-slate-400">{historyTarget.description}</p>
              </div>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {historyLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <LoadingSpinner />
                <p className="text-sm text-slate-500">Retrieving full history...</p>
              </div>
            )}
            {!historyLoading && historyError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {historyError}
              </div>
            )}

            {!historyLoading && historyData && (
              <div className="space-y-6">
                {/* Quick link to full item page with escrow panel */}
                <Link
                  href={`/item/${historyTarget._id}`}
                  className="flex items-center gap-2 w-full justify-center px-4 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-lg shadow-cyan-900/20 transition group"
                  onClick={closeHistoryModal}
                >
                  <Shield className="w-4 h-4 group-hover:scale-110 transition" />
                  View Full Item Page & Escrow Panel
                </Link>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-2">
                    <p className="text-xs text-slate-500 uppercase font-bold">Item Status</p>
                    <div className="flex justify-between items-center">
                      <span className="text-white text-sm capitalize">{historyData.item.status}</span>
                      {historyData.item.isClaimed && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Claimed</Badge>}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-2">
                    <p className="text-xs text-slate-500 uppercase font-bold">Reward Pool</p>
                    <p className="text-white text-sm font-mono">{historyData.item.rewardAmount} ETH</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-violet-400" />
                    Claim Requests
                  </h3>
                  {historyData.claims.length === 0 ? (
                    <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-800 text-center">
                      <p className="text-slate-500 text-sm italic">No claim requests yet.</p>
                      {historyData.item.status === "pending" && (
                        <p className="text-[10px] text-amber-500/60 mt-2">
                          Claims appear after a valid AI match is found.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {historyData.claims.map((claim) => (
                        <div key={claim.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-white text-sm font-medium">{claim.requester.fullName}</p>
                              <p className="text-[10px] text-slate-500">{claim.requester.email}</p>
                            </div>
                            <Badge className={`${
                              claim.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                            }`}>
                              {claim.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-[10px]">
                            <div>
                              <p className="text-slate-500 uppercase font-bold">AI Match Score</p>
                              <p className="text-slate-300 font-mono">{claim.aiMatchScore}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500 uppercase font-bold">Proposed Amount</p>
                              <p className="text-slate-300 font-mono">{claim.proposedAmount} ETH</p>
                            </div>
                          </div>
                          {claim.adminReviewNotes && (
                            <div className="p-2 bg-slate-900 rounded border border-slate-800">
                              <p className="text-[10px] text-slate-400 italic">Admin Note: {claim.adminReviewNotes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    Payment & Settlement Proofs
                  </h3>
                  {historyData.transactions.length === 0 ? (
                    <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-800 text-center">
                      <p className="text-slate-500 text-sm italic">No payment transactions recorded.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {historyData.transactions.map((tx) => (
                        <div key={tx.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
                          <div className="flex justify-between items-center">
                            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-[10px]">
                              {tx.paymentMethod.toUpperCase()}
                            </Badge>
                            <p className="text-green-400 font-mono font-bold">{tx.amountEth} ETH</p>
                          </div>
                          <div className="space-y-1 text-[10px]">
                            <p className="text-slate-500 flex justify-between">
                              <span>From:</span>
                              <span className="text-slate-300 font-mono">{tx.from.walletAddress?.slice(0, 10)}...</span>
                            </p>
                            <p className="text-slate-500 flex justify-between">
                              <span>To:</span>
                              <span className="text-slate-300 font-mono">{tx.to.walletAddress?.slice(0, 10)}...</span>
                            </p>
                            <p className="text-slate-500 flex justify-between">
                              <span>Tx Hash:</span>
                              <span className="text-cyan-500 font-mono">{tx.txHash?.slice(0, 15)}...</span>
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 flex justify-between items-center border-t border-slate-700 pt-2">
                            <span>{new Date(tx.createdAt).toLocaleString()}</span>
                            <span className="text-emerald-500">✓ Completed</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
