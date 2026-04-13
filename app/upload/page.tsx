"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { UploadForm } from "@/components/upload-form";
import Loading from "./loading";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Search,
  Eye,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function useAuthGuard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          router.push("/signin");
          return;
        }
        setIsAuthenticated(true);
      } catch {
        router.push("/signin");
      }
    };
    checkAuth();
  }, [router]);

  return isAuthenticated;
}

interface DuplicateWarning {
  error: string;
  existingItemId: string;
  existingItemType: string;
  existingDescription: string;
  matchScore: number;
}

interface RecentUpload {
  _id: string;
  type: "lost" | "found";
  description: string;
  imageUrl: string;
  status: "pending" | "matched" | "resolved";
  matchScore: number | null;
  createdAt: string;
}

function RecentUploads() {
  const [uploads, setUploads] = useState<RecentUpload[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecent = async () => {
    try {
      const res = await fetch("/api/uploads/my?limit=3", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setUploads(data.items.slice(0, 3));
      }
    } catch (err) {
      console.error("Error fetching recent uploads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecent();
    const interval = setInterval(fetchRecent, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && uploads.length === 0) return null;
  if (uploads.length === 0) return null;

  return (
    <div className="mt-16 w-full max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Your Recent Activity
        </h2>
        <Link
          href="/my-uploads"
          className="text-sm text-violet-600 hover:underline font-medium"
        >
          View all uploads →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {uploads.map((upload) => (
          <Card
            key={upload._id}
            className="overflow-hidden hover:shadow-md transition-shadow group"
          >
            <Link href={`/item/${upload._id}`}>
              <div className="relative aspect-video bg-muted">
                <Image
                  src={upload.imageUrl}
                  alt={upload.description}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 left-2">
                  <Badge className="bg-black/60 text-white backdrop-blur-md border-white/20">
                    {upload.type === "lost" ? (
                      <Search className="w-3 h-3 mr-1" />
                    ) : (
                      <Eye className="w-3 h-3 mr-1" />
                    )}
                    <span className="capitalize">{upload.type}</span>
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <p className="font-medium text-sm line-clamp-1 mb-2">
                  {upload.description}
                </p>
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      upload.status === "matched" ? "default" : "secondary"
                    }
                    className={
                      upload.status === "matched"
                        ? "bg-green-500 hover:bg-green-600"
                        : ""
                    }
                  >
                    {upload.status === "matched" ? (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    ) : (
                      <Clock className="w-3 h-3 mr-1" />
                    )}
                    <span className="capitalize">{upload.status}</span>
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(upload.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

type HandleSubmitParams = [
  file: File,
  type: string,
  description: string,
  rewardAmount?: number,
  location?: { lat: number; lng: number },
  contactPhone?: string,
  rewardPaymentMethod?: "offchain" | "onchain"
];

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateWarning, setDuplicateWarning] =
    useState<DuplicateWarning | null>(null);
  const bypassDuplicateRef = useRef(false);
  const pendingSubmitRef = useRef<HandleSubmitParams | null>(null);
  const isAuthenticated = useAuthGuard();

  const itemType = searchParams.get("type") || "lost";

  if (isAuthenticated === null) return <Loading />;

  const handleSubmit = async (
    file: File,
    type: string,
    description: string,
    rewardAmount?: number,
    location?: { lat: number; lng: number },
    contactPhone?: string,
    rewardPaymentMethod?: "offchain" | "onchain"
  ) => {
    setIsLoading(true);
    setDuplicateWarning(null);

    const bypassDuplicate = bypassDuplicateRef.current;
    bypassDuplicateRef.current = false;

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("description", description);
        formData.append("type", type);
        if (rewardAmount)
          formData.append("rewardAmount", rewardAmount.toString());
        if (rewardPaymentMethod)
          formData.append("rewardPaymentMethod", rewardPaymentMethod);
        if (contactPhone && contactPhone.trim())
          formData.append("contactPhone", contactPhone.trim());
        if (location) {
          formData.append("latitude", location.lat.toString());
          formData.append("longitude", location.lng.toString());
        }
        if (bypassDuplicate) formData.append("bypassDuplicate", "true");

        try {
          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
            credentials: "include",
          });

          const result = await response.json();

          if (!response.ok) {
            if (response.status === 409) {
              pendingSubmitRef.current = [
                file,
                type,
                description,
                rewardAmount,
                location,
                contactPhone,
                rewardPaymentMethod,
              ];
              bypassDuplicateRef.current = true;
              await handleSubmit(...(pendingSubmitRef.current || []));
              return;
            }
            throw new Error(result.error || "Upload failed");
          }

          sessionStorage.setItem(
            "analysisResult",
            JSON.stringify({
              ...result,
              imagePreview: result.imageUrl || "",
              timestamp: new Date().toISOString(),
              type: type,
            })
          );

          router.push("/result");
        } catch (error) {
          console.error("Upload error:", error);
          alert(`Error: ${(error as Error).message}`);
          setIsLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing image:", error);
      setIsLoading(false);
    }
  };

  const handleUploadAnyway = () => {
    if (pendingSubmitRef.current) {
      bypassDuplicateRef.current = true;
      setDuplicateWarning(null);
      handleSubmit(...pendingSubmitRef.current);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Duplicate Warning Popup Modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-amber-950 border border-amber-500/60 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <h3 className="text-amber-300 font-semibold text-lg">
                Similar Item Already Registered
              </h3>
            </div>
            <p className="text-amber-200 text-sm mb-1">
              {duplicateWarning.error}
            </p>
            <p className="text-amber-400 text-xs mb-4">
              Match confidence: {duplicateWarning.matchScore}%
            </p>
            <div className="bg-amber-900/40 border border-amber-700/40 rounded-lg p-3 mb-5">
              <p className="text-amber-300 text-xs font-semibold uppercase mb-1">
                Existing Item ({duplicateWarning.existingItemType})
              </p>
              <p className="text-amber-100 text-sm">
                {duplicateWarning.existingDescription}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-medium gap-1"
                onClick={() =>
                  router.push(`/item/${duplicateWarning.existingItemId}`)
                }
              >
                <ExternalLink className="w-3 h-3" />
                View Existing Item
              </Button>
              <Button
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium"
                onClick={handleUploadAnyway}
              >
                Upload Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-8 sm:py-16">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {itemType === "lost" ? "Report Lost Item" : "Report Found Item"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {itemType === "lost"
              ? "Upload a clear photo of your lost item"
              : "Upload a photo of the item you found"}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setDuplicateWarning(null);
                router.push("/upload?type=lost");
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium border ${
                itemType === "lost"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-black border-gray-300"
              }`}
            >
              I Lost an Item
            </button>
            <button
              type="button"
              onClick={() => {
                setDuplicateWarning(null);
                router.push("/upload?type=found");
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium border ${
                itemType === "found"
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-black border-gray-300"
              }`}
            >
              I Found an Item
            </button>
          </div>
        </div>

        <UploadForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          initialItemType={itemType === "found" ? "found" : "lost"}
        />

        <RecentUploads />
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<Loading />}>
      <UploadPageContent />
    </Suspense>
  );
}
