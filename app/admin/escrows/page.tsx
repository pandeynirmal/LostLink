"use client";

import { useState, useEffect } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Lock,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type EscrowState =
  | "funded"
  | "claim_assigned"
  | "awaiting_delivery"
  | "item_delivered"
  | "awaiting_confirmation"
  | "disputed"
  | "released"
  | "refunded";

interface EscrowItem {
  _id: string;
  itemId?: {
    _id: string;
    description: string;
    type: string;
  } | null;
  ownerId: {
    fullName: string;
    email: string;
  };
  finderId?: {
    fullName: string;
    email: string;
  } | null;
  amountEth: number;
  state: EscrowState;
  ownerItemReceived: boolean;
  finderFundReceived: boolean;
  ownerReleaseApproved: boolean;
  finderReleaseApproved: boolean;
  adminReleaseApproved: boolean;
  disputeReason?: string;
  createdAt: string;
}

const STATE_CONFIG: Record<
  EscrowState,
  { label: string; color: string; icon: React.ReactNode }
> = {
  funded: {
    label: "Funded",
    color: "bg-emerald-500",
    icon: <Lock className="w-4 h-4" />,
  },
  claim_assigned: {
    label: "Finder Assigned",
    color: "bg-blue-500",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  awaiting_delivery: {
    label: "Awaiting Delivery",
    color: "bg-amber-500",
    icon: <Clock className="w-4 h-4" />,
  },
  item_delivered: {
    label: "Item Delivered",
    color: "bg-cyan-500",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  awaiting_confirmation: {
    label: "Awaiting Confirmation",
    color: "bg-purple-500",
    icon: <Clock className="w-4 h-4" />,
  },
  disputed: {
    label: "Disputed",
    color: "bg-red-500",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  released: {
    label: "Released",
    color: "bg-green-500",
    icon: <Unlock className="w-4 h-4" />,
  },
  refunded: {
    label: "Refunded",
    color: "bg-gray-500",
    icon: <XCircle className="w-4 h-4" />,
  },
};

export default function AdminEscrowsPage() {
  const [escrows, setEscrows] = useState<EscrowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowItem | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolution, setResolution] = useState<"release" | "refund" | null>(
    null
  );
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchEscrows();
  }, []);

  const fetchEscrows = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/admin/escrows", {
        withCredentials: true,
      });
      setEscrows(response.data.escrows || []);
    } catch (error) {
      console.error("Failed to fetch escrows:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-purple-600" />
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Escrow Management
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escrow Cases</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-600 border-b bg-gray-50">
                <tr>
                  <th className="py-3 px-3">Item</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Owner</th>
                  <th className="py-3 px-3">Finder</th>
                  <th className="py-3 px-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {escrows.map((escrow) => {
                  const stateConfig = STATE_CONFIG[escrow.state];

                  return (
                    <tr
                      key={escrow._id}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      {/* ITEM */}
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-medium">
                            {escrow.itemId?.description
                              ? escrow.itemId.description.slice(0, 40) + "..."
                              : "Item unavailable"}
                          </p>

                          <p className="text-xs text-gray-500">
                            {new Date(escrow.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </td>

                      {/* AMOUNT */}
                      <td className="py-3 px-3 font-semibold">
                        {escrow.amountEth} ETH
                      </td>

                      {/* STATUS */}
                      <td className="py-3 px-3">
                        <Badge
                          className={`${stateConfig.color} text-white flex items-center gap-1 w-fit`}
                        >
                          {stateConfig.icon}
                          {stateConfig.label}
                        </Badge>

                        {escrow.state === "disputed" &&
                          escrow.disputeReason && (
                            <p className="text-xs text-red-600 mt-1">
                              {escrow.disputeReason}
                            </p>
                          )}
                      </td>

                      {/* OWNER */}
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-medium">
                            {escrow.ownerId?.fullName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {escrow.ownerId?.email}
                          </p>
                        </div>
                      </td>

                      {/* FINDER */}
                      <td className="py-3 px-3">
                        {escrow.finderId ? (
                          <>
                            <p className="font-medium">
                              {escrow.finderId.fullName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {escrow.finderId.email}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-400">Not assigned</span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3 px-3">
                        <div className="flex gap-2">
                          <Link
                            href={
                              escrow.itemId?._id
                                ? `/item/${escrow.itemId._id}`
                                : "#"
                            }
                          >
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>

                          {escrow.state === "disputed" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setSelectedEscrow(escrow);
                                setResolveDialogOpen(true);
                              }}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {escrows.length === 0 && (
              <p className="text-center py-8 text-gray-500">
                No escrows found.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resolve Dialog */}

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Choose how to resolve this dispute.
            </DialogDescription>
          </DialogHeader>

          {selectedEscrow && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded">
                <p>
                  <strong>Item:</strong>{" "}
                  {selectedEscrow.itemId?.description || "Item unavailable"}
                </p>
                <p>
                  <strong>Amount:</strong> {selectedEscrow.amountEth} ETH
                </p>
                <p>
                  <strong>Owner:</strong> {selectedEscrow.ownerId?.fullName}
                </p>
                <p>
                  <strong>Finder:</strong>{" "}
                  {selectedEscrow.finderId?.fullName || "N/A"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => setResolution("release")}
                  className="bg-green-600"
                >
                  <Unlock className="w-4 h-4 mr-2" />
                  Release to Finder
                </Button>

                <Button
                  onClick={() => setResolution("refund")}
                  className="bg-red-600"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Refund to Owner
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
            >
              Cancel
            </Button>

            <Button disabled={!resolution || actionLoading}>
              {actionLoading ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
