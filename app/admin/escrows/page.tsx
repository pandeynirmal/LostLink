"use client";

import { useState, useEffect } from "react";
import { Shield, AlertTriangle, CheckCircle, XCircle, Clock, Eye, Lock, Unlock } from "lucide-react";
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
  itemId: {
    _id: string;
    description: string;
    type: string;
  };
  ownerId: {
    fullName: string;
    email: string;
  };
  finderId?: {
    fullName: string;
    email: string;
  };
  amountEth: number;
  state: EscrowState;
  ownerItemReceived: boolean;
  finderFundReceived: boolean;
  ownerReleaseApproved: boolean;
  finderReleaseApproved: boolean;
  adminReleaseApproved: boolean;
  disputeReason?: string;
  disputeRaisedAt?: string;
  disputeRaisedBy?: string;
  createdAt: string;
  updatedAt: string;
}

const STATE_CONFIG: Record<EscrowState, { label: string; color: string; icon: React.ReactNode }> = {
  funded: { label: "Funded", color: "bg-emerald-500", icon: <Lock className="w-4 h-4" /> },
  claim_assigned: { label: "Finder Assigned", color: "bg-blue-500", icon: <CheckCircle className="w-4 h-4" /> },
  awaiting_delivery: { label: "Awaiting Delivery", color: "bg-amber-500", icon: <Clock className="w-4 h-4" /> },
  item_delivered: { label: "Item Delivered", color: "bg-cyan-500", icon: <CheckCircle className="w-4 h-4" /> },
  awaiting_confirmation: { label: "Awaiting Confirmation", color: "bg-purple-500", icon: <Clock className="w-4 h-4" /> },
  disputed: { label: "Disputed", color: "bg-red-500", icon: <AlertTriangle className="w-4 h-4" /> },
  released: { label: "Released", color: "bg-green-500", icon: <Unlock className="w-4 h-4" /> },
  refunded: { label: "Refunded", color: "bg-gray-500", icon: <XCircle className="w-4 h-4" /> },
};

export default function AdminEscrowsPage() {
  const [escrows, setEscrows] = useState<EscrowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowItem | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolution, setResolution] = useState<"release" | "refund" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "disputed" | "closed">("all");

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

  const handleResolveDispute = async () => {
    if (!selectedEscrow || !resolution) return;

    setActionLoading(true);
    try {
      const action = resolution === "release" ? "resolve_dispute_release" : "resolve_dispute_refund";
      await axios.post(
        "/api/escrow/action",
        {
          itemId: selectedEscrow.itemId._id,
          action,
        },
        { withCredentials: true }
      );

      setResolveDialogOpen(false);
      setSelectedEscrow(null);
      setResolution(null);
      await fetchEscrows();
    } catch (error) {
      console.error("Failed to resolve dispute:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredEscrows = escrows.filter((escrow) => {
    if (filter === "all") return true;
    if (filter === "active") return !["released", "refunded"].includes(escrow.state);
    if (filter === "disputed") return escrow.state === "disputed";
    if (filter === "closed") return ["released", "refunded"].includes(escrow.state);
    return true;
  });

  const disputedCount = escrows.filter((e) => e.state === "disputed").length;
  const activeCount = escrows.filter((e) => !["released", "refunded"].includes(e.state)).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-purple-600" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Escrow Management
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Escrows</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-700">{escrows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Disputed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{disputedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">
              {escrows.reduce((sum, e) => sum + e.amountEth, 0).toFixed(3)} ETH
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "active", "disputed", "closed"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className={filter === f ? "bg-purple-600" : ""}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "disputed" && disputedCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {disputedCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Escrows Table */}
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
                  <th className="py-3 px-3">Approvals</th>
                  <th className="py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEscrows.map((escrow) => {
                  const stateConfig = STATE_CONFIG[escrow.state];
                  const approvalCount =
                    (escrow.ownerReleaseApproved ? 1 : 0) +
                    (escrow.finderReleaseApproved ? 1 : 0) +
                    (escrow.adminReleaseApproved ? 1 : 0);

                  return (
                    <tr
                      key={escrow._id}
                      className="border-b hover:bg-purple-50 transition align-top"
                    >
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-medium">{escrow.itemId.description.slice(0, 40)}...</p>
                          <p className="text-xs text-gray-500">
                            {new Date(escrow.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold">{escrow.amountEth} ETH</span>
                      </td>
                      <td className="py-3 px-3">
                        <Badge className={`${stateConfig.color} text-white flex items-center gap-1 w-fit`}>
                          {stateConfig.icon}
                          {stateConfig.label}
                        </Badge>
                        {escrow.state === "disputed" && escrow.disputeReason && (
                          <p className="text-xs text-red-600 mt-1 max-w-[200px]">
                            {escrow.disputeReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-medium">{escrow.ownerId.fullName}</p>
                          <p className="text-xs text-gray-500">{escrow.ownerId.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {escrow.finderId ? (
                          <div>
                            <p className="font-medium">{escrow.finderId.fullName}</p>
                            <p className="text-xs text-gray-500">{escrow.finderId.email}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not assigned</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {escrow.state === "awaiting_confirmation" || escrow.state === "item_delivered" ? (
                          <div className="text-xs">
                            <div className="flex items-center gap-1">
                              <span className={escrow.ownerReleaseApproved ? "text-green-600" : "text-gray-400"}>
                                {escrow.ownerReleaseApproved ? "✓" : "○"} Owner
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={escrow.finderReleaseApproved ? "text-green-600" : "text-gray-400"}>
                                {escrow.finderReleaseApproved ? "✓" : "○"} Finder
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={escrow.adminReleaseApproved ? "text-green-600" : "text-gray-400"}>
                                {escrow.adminReleaseApproved ? "✓" : "○"} Admin
                              </span>
                            </div>
                            <p className="mt-1 font-medium">{approvalCount}/3</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-2">
                          <Link href={`/item/${escrow.itemId._id}`}>
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
                          {(escrow.state === "awaiting_confirmation" || escrow.state === "item_delivered") && !escrow.adminReleaseApproved && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={async () => {
                                await axios.post(
                                  "/api/escrow/action",
                                  {
                                    itemId: escrow.itemId._id,
                                    action: "approve_release",
                                  },
                                  { withCredentials: true }
                                );
                                await fetchEscrows();
                              }}
                            >
                              Approve
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredEscrows.length === 0 && (
              <p className="text-center py-8 text-gray-500">No escrows found.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resolve Dispute Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Choose how to resolve this dispute. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {selectedEscrow && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 p-4 rounded">
                <p><strong>Item:</strong> {selectedEscrow.itemId.description}</p>
                <p><strong>Amount:</strong> {selectedEscrow.amountEth} ETH</p>
                <p><strong>Owner:</strong> {selectedEscrow.ownerId.fullName}</p>
                <p><strong>Finder:</strong> {selectedEscrow.finderId?.fullName || "N/A"}</p>
                {selectedEscrow.disputeReason && (
                  <p><strong>Dispute Reason:</strong> {selectedEscrow.disputeReason}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant={resolution === "release" ? "default" : "outline"}
                  className={resolution === "release" ? "bg-green-600" : ""}
                  onClick={() => setResolution("release")}
                >
                  <Unlock className="w-4 h-4 mr-2" />
                  Release to Finder
                </Button>
                <Button
                  variant={resolution === "refund" ? "default" : "outline"}
                  className={resolution === "refund" ? "bg-red-600" : ""}
                  onClick={() => setResolution("refund")}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Refund to Owner
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleResolveDispute}
              disabled={!resolution || actionLoading}
              className={resolution === "release" ? "bg-green-600" : resolution === "refund" ? "bg-red-600" : ""}
            >
              {actionLoading ? "Processing..." : "Confirm Resolution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
