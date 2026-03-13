"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EscrowPanel } from "@/components/escrow-panel";
import Image from "next/image";

const CLAIM_REQUEST_MIN_SCORE = 50;

interface ItemDetails {
  id: string;
  ownerId: string;
  description: string;
  imageUrl: string;
  type: "lost" | "found";
  status: "pending" | "matched" | "resolved";
  createdAt: string;
  rewardAmount?: number;
  contactPhone?: string;
  matchScore?: number;
  isClaimed?: boolean;
  claimCount?: number;
  user: {
    fullName: string;
    email: string;
    organization?: string;
  };
}

export default function ItemDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [item, setItem] = useState<ItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [proposedAmount, setProposedAmount] = useState("");

  const normalizedMatchScore =
    typeof item?.matchScore === "number"
      ? item.matchScore <= 1
        ? item.matchScore * 100
        : item.matchScore
      : 0;

  useEffect(() => {
    if (!id) return;

    const fetchAll = async () => {
      try {
        const [itemRes, meRes] = await Promise.all([
          fetch(`/api/item/${id}`),
          fetch("/api/auth/me", { credentials: "include" }),
        ]);

        const itemData = await itemRes.json();
        if (itemData.success) {
          setItem(itemData.item);
          setProposedAmount(String(Number(itemData.item?.rewardAmount || 0)));
        } else {
          setError(itemData.error || "Failed to fetch item");
        }

        if (meRes.ok) {
          const meData = await meRes.json();
          // Force string comparison — _id may be an ObjectId object or a string
          const uid = String(meData.user?._id || meData._id || "");
          setCurrentUserId(uid);

          if (uid && itemData.success) {
            // Check both ownerId and the ID inside the user object from the API
            const itemOwnerId = String(itemData.item.ownerId || "");
            const itemUserId = String(itemData.item.userId || "");

            // If the current user's ID matches the item's owner ID
            if (uid === itemOwnerId || uid === itemUserId) {
              setIsOwner(true);
            } else {
              setIsOwner(false);
            }
          }
        }
      } catch {
        setError("Server error");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [id]);

  const handleRequestContact = async () => {
    if (!id) return;

    const parsedAmount = Number(proposedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setRequestStatus("Enter a valid proposed amount (0 or greater).");
      return;
    }

    try {
      setIsRequesting(true);
      setRequestStatus(null);

      const response = await fetch("/api/contact-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId: id, proposedAmount: parsedAmount }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        setRequestStatus(data.error || "Request failed");
        return;
      }

      setRequestStatus("Claim request sent successfully.");
      window.dispatchEvent(new Event("app:refresh-badges"));
    } catch (requestError) {
      console.error("Request error:", requestError);
      setRequestStatus("Something went wrong.");
    } finally {
      setIsRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="text-center py-20 text-red-500">
          {error || "Item not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Item Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full h-64 rounded-lg overflow-hidden bg-muted">
              <Image
                src={item.imageUrl}
                alt={item.description}
                fill
                className="object-cover"
              />
            </div>

            <Badge variant="outline" className="capitalize">
              {item.type}
            </Badge>

            <p className="text-lg font-medium">{item.description}</p>

            <p className="text-sm text-muted-foreground">
              Uploaded on: {new Date(item.createdAt).toLocaleString()}
            </p>

            {item.matchScore !== undefined && (
              <p className="text-sm text-green-600 font-medium">
                Match Score: {Math.round(normalizedMatchScore * 100) / 100}%
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {item.isClaimed && (
                <Badge
                  variant="secondary"
                  className="bg-green-500/10 text-green-600 border-green-500/20"
                >
                  Claimed & Resolved
                </Badge>
              )}
              {item.status === "matched" && !item.isClaimed && (
                <Badge
                  variant="secondary"
                  className="bg-amber-500/10 text-amber-600 border-amber-500/20"
                >
                  Match Found
                </Badge>
              )}
              {item.claimCount !== undefined && item.claimCount > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-blue-500/10 text-blue-600 border-blue-500/20"
                >
                  {item.claimCount} Pending Claim
                  {item.claimCount > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Three-Layer Escrow Panel */}
        <EscrowPanel itemId={id} />

        <Card>
          <CardHeader>
            <CardTitle>
              {isOwner ? "Owner Information" : "Claim Item"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isOwner ? (
              <div className="bg-violet-500/10 p-4 rounded-lg border border-violet-500/20 mb-4">
                <p className="text-sm text-violet-600 dark:text-violet-400 font-medium">
                  You are viewing your own item upload.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                To claim this item, please verify your identity and contact the
                owner.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">
                  Uploader Name
                </p>
                <p className="font-medium">{item.user.fullName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">
                  Uploader Email
                </p>
                <p className="font-medium">{item.user.email}</p>
              </div>
              {item.user.organization && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">
                    Organization
                  </p>
                  <p className="font-medium">{item.user.organization}</p>
                </div>
              )}
              {item.contactPhone && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">
                    Mobile
                  </p>
                  <p className="font-medium">{item.contactPhone}</p>
                </div>
              )}
            </div>

            {/* Only show claim request to non-owners */}
            {!isOwner ? (
              <div className="pt-6 border-t border-border mt-6 space-y-4">
                {item.isClaimed ? (
                  <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                      This item has already been successfully claimed and
                      resolved.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Proposed Claim Amount (ETH)
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Enter the reward amount you expect or want to propose.
                      </p>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={proposedAmount}
                        onChange={(e) => setProposedAmount(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      />
                    </div>

                    <button
                      onClick={handleRequestContact}
                      disabled={isRequesting}
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isRequesting ? "Sending..." : "Submit Claim Request"}
                    </button>

                    {item.claimCount !== undefined && item.claimCount > 0 && (
                      <p className="text-xs text-amber-600 mt-2 italic text-center">
                        Note: {item.claimCount} person(s) have already submitted
                        claims for this item. You can still submit yours if you
                        believe you are the rightful owner/finder.
                      </p>
                    )}
                  </>
                )}

                {requestStatus && (
                  <p
                    className={`mt-2 text-sm font-medium ${
                      requestStatus.includes("success")
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {requestStatus}
                  </p>
                )}
              </div>
            ) : (
              <div className="pt-6 border-t border-border mt-6">
                <button
                  onClick={() => router.push("/my-uploads")}
                  className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold py-2.5 rounded-lg transition-colors"
                >
                  Manage Item in My Uploads
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
