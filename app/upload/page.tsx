"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { UploadForm } from "@/components/upload-form";
import Loading from "./loading"; // Import the new Loading component
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Search, Eye } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

// Auth guard hook
function useAuthGuard() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include'
        })

        if (!res.ok) {
          router.push('/signin')
          return
        }

        setIsAuthenticated(true)
      } catch {
        router.push('/signin')
      }
    }

    checkAuth()
  }, [router])

  return isAuthenticated
}

// Mock API function for backend integration
async function analyzeImage(file: File, itemType: string) {
  // In production, replace with actual API endpoint
  const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("itemType", itemType);

    const response = await fetch(`${apiUrl}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Upload failed");
    }

    return await response.json();
  } catch (error) {
    // Mock response for development/testing
    console.warn(
      "Backend unavailable, using mock data. Connect your backend via NEXT_PUBLIC_BACKEND_URL"
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      detected_item: ["wallet", "phone", "keys", "backpack"][
        Math.floor(Math.random() * 4)
      ],
      match_score: Math.floor(Math.random() * 40) + 60, // 60-100%
      status: ["High Match Found", "Possible Match", "No Match Found"][
        Math.floor(Math.random() * 3)
      ],
      tx_hash: `0x${Array.from({ length: 40 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("")}`,
    };
  }
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
        if (data.success) {
          setUploads(data.items.slice(0, 3));
        }
      }
    } catch (err) {
      console.error("Error fetching recent uploads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecent();
    const interval = setInterval(fetchRecent, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading && uploads.length === 0) return null;
  if (uploads.length === 0) return null;

  return (
    <div className="mt-16 w-full max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Your Recent Activity</h2>
        <Link href="/my-uploads" className="text-sm text-violet-600 hover:underline font-medium">
          View all uploads →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {uploads.map((upload) => (
          <Card key={upload._id} className="overflow-hidden hover:shadow-md transition-shadow group">
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
                    {upload.type === "lost" ? <Search className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    <span className="capitalize">{upload.type}</span>
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <p className="font-medium text-sm line-clamp-1 mb-2">{upload.description}</p>
                <div className="flex items-center justify-between">
                  <Badge variant={upload.status === "matched" ? "default" : "secondary"} 
                    className={upload.status === "matched" ? "bg-green-500 hover:bg-green-600" : ""}>
                    {upload.status === "matched" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
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

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const isAuthenticated = useAuthGuard();

  const itemType = searchParams.get("type") || "lost";

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return <Loading />;
  }

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
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        setImagePreview(reader.result as string);

        // Call real API
        const formData = new FormData();
        formData.append("image", file);
        formData.append("description", description);
        formData.append("type", type);
        if (rewardAmount) {
          formData.append("rewardAmount", rewardAmount.toString());
        }
        if (rewardPaymentMethod) {
          formData.append("rewardPaymentMethod", rewardPaymentMethod);
        }
        if (contactPhone && contactPhone.trim()) {
          formData.append("contactPhone", contactPhone.trim());
        }
        if (location) {
          formData.append("latitude", location.lat.toString());
          formData.append("longitude", location.lng.toString());
        } formData.append("latitude", location.lat.toString());
          formData.append("longitude", location.lng.toString());
        }

        try {
          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
            credentials: "include", //  IMPORTANT
          });

          const result = await response.json();

          if (!response.ok) {
            if (response.status === 409) {
              // Custom handling for duplicates
              if (confirm(`${result.error}\n\nWould you like to view the existing item instead?`)) {
                router.push(`/item/${result.existingItemId}`);
                return;
              }
              setIsLoading(false);
              return;
            }
            throw new Error(result.error || "Upload failed");
          }

          // Store result in session storage for result page
          sessionStorage.setItem(
            "analysisResult",
            JSON.stringify({
              ...result,
              imagePreview: reader.result,
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
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
              onClick={() => router.push("/upload?type=lost")}
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
              onClick={() => router.push("/upload?type=found")}
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
      {" "}
      {/* Use the new Loading component */}
      <UploadPageContent />
    </Suspense>
  );
}

