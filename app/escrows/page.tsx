"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Shield, Clock, CheckCircle2, AlertTriangle, User, UserCheck } from "lucide-react";

interface Escrow {
  _id: string;
  itemId: {
    _id: string;
    description: string;
    imageUrl: string;
    type: string;
    status: string;
    rewardAmount: number;
  } | null;
  ownerId: {
    _id: string;
    fullName: string;
    email: string;
  } | null;
  finderId: {
    _id: string;
    fullName: string;
    email: string;
  } | null;
  amountEth: number;
  state: string;
  createdAt: string;
}

export default function MyEscrowsPage() {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"as_owner" | "as_finder">("as_finder");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [meRes, escrowsRes] = await Promise.all([
          fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
          fetch("/api/my-escrows", { credentials: "include", cache: "no-store" })
        ]);

        if (meRes.ok) {
          const meData = await meRes.json();
          setCurrentUserId(meData.user?._id || meData._id || null);
        }

        if (escrowsRes.ok) {
          const data = await escrowsRes.json();
          if (data.success) {
            setEscrows(data.escrows || []);
          } else {
            setError(data.error || "Failed to fetch escrows");
          }
        } else {
          setError("Failed to fetch escrows");
        }
      } catch (err) {
        setError("Something went wrong");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const getStatusBadge = (state: string) => {
    switch (state) {
      case "released":
        return <Badge className="bg-green-500 text-white"><CheckCircle2 className="w-3 h-3 mr-1"/> Released</Badge>;
      case "refunded":
        return <Badge className="bg-gray-500 text-white">Refunded</Badge>;
      case "disputed":
        return <Badge className="bg-red-500 text-white"><AlertTriangle className="w-3 h-3 mr-1"/> Disputed</Badge>;
      default:
        return <Badge className="bg-blue-500 text-white"><Clock className="w-3 h-3 mr-1"/> {state.replace(/_/g, " ")}</Badge>;
    }
  };

  const ownerEscrows = escrows.filter(e => e.ownerId?._id === currentUserId);
  const finderEscrows = escrows.filter(e => e.finderId?._id === currentUserId);

  const displayedEscrows = activeTab === "as_owner" ? ownerEscrows : finderEscrows;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-16">
          <LoadingSpinner />
          <p className="mt-4 text-muted-foreground">Loading your escrows...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-cyan-600" />
          <h1 className="text-3xl font-bold">My Escrows</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        <div className="flex gap-4 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("as_finder")}
            className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "as_finder" ? "border-cyan-600 text-cyan-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <UserCheck className="w-4 h-4" />
            As Finder ({finderEscrows.length})
          </button>
          <button
            onClick={() => setActiveTab("as_owner")}
            className={`pb-3 px-2 font-medium text-sm transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "as_owner" ? "border-cyan-600 text-cyan-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <User className="w-4 h-4" />
            As Owner ({ownerEscrows.length})
          </button>
        </div>

        {displayedEscrows.length === 0 ? (
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              {activeTab === "as_finder" 
                ? "You have not been assigned as a finder for any escrows yet." 
                : "You have not created any escrows for your lost items."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedEscrows.map(escrow => (
              <Card key={escrow._id} className="overflow-hidden hover:shadow-md transition">
                <div className="flex flex-col sm:flex-row h-full">
                  {escrow.itemId?.imageUrl && (
                    <div className="relative w-full sm:w-32 h-40 sm:h-auto shrink-0 bg-muted">
                      <Image 
                        src={escrow.itemId.imageUrl} 
                        alt="Item" 
                        fill 
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold line-clamp-1 flex-1 pr-2">
                        {escrow.itemId?.description || "Unknown Item"}
                      </h3>
                      <div className="shrink-0">{getStatusBadge(escrow.state)}</div>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1 mb-4 flex-1">
                      <p>
                        <span className="font-medium text-gray-900">{escrow.amountEth} ETH</span> Reward
                      </p>
                      {activeTab === "as_finder" && escrow.ownerId && (
                        <p>Owner: {escrow.ownerId.fullName}</p>
                      )}
                      {activeTab === "as_owner" && (
                        <p>Finder: {escrow.finderId?.fullName || "Not assigned"}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Created {new Date(escrow.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <Link
                      href={escrow.itemId ? `/item/${escrow.itemId._id}` : "#"}
                      className="block w-full text-center bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-4 rounded text-sm font-medium transition"
                    >
                      Open Escrow Panel
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
