"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";

interface SimilarItem {
  id: string;
  score: number;
  description: string;
  imageUrl: string;
}

interface AnalysisResult {
  success: boolean;
  itemId: string;
  detected_item: string;
  match_score: number;
  status: string;
  tx_hash: string;
  matchFound: boolean;
  matchDetails: {
    matchedItemId: string;
    matchedDescription: string;
    matchedImageUrl: string;
    matchScore: number;
  } | null;
  similarItems: SimilarItem[];
  message: string;
  imagePreview: string;
  timestamp: string;
  type: string;
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedResult = sessionStorage.getItem("analysisResult");
    if (storedResult) {
      try {
        const parsed = JSON.parse(storedResult);
        setResult(parsed);
      } catch (err) {
        setError("Failed to load analysis results");
      }
    } else {
      setError("No analysis results found. Please upload an image first.");
    }
    setIsLoading(false);
  }, []);

  // Ensure we have the matched item's image (sessionStorage can be stale/incomplete)
  useEffect(() => {
    const hydrateMatchedImage = async () => {
      if (!result?.matchDetails?.matchedItemId) return;
      if (result.matchDetails.matchedImageUrl?.trim()) return;

      try {
        const res = await fetch(`/api/item/${result.matchDetails.matchedItemId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const imageUrl = String(data?.item?.imageUrl || "").trim();
        if (!imageUrl) return;

        setResult((prev) => {
          if (!prev?.matchDetails) return prev;
          const next = {
            ...prev,
            matchDetails: {
              ...prev.matchDetails,
              matchedImageUrl: imageUrl,
            },
          };
          sessionStorage.setItem("analysisResult", JSON.stringify(next));
          return next;
        });
      } catch {
        // ignore
      }
    };

    void hydrateMatchedImage();
  }, [result?.matchDetails?.matchedItemId, result?.matchDetails?.matchedImageUrl]);

  // Polling for status updates (in case match is found later)
  useEffect(() => {
    if (!result || result.matchFound) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/uploads/my/${result.itemId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = await res.json();
        if (data.success && data.item.status === "matched" && data.item.matchedItem) {
          const updatedResult = {
            ...result,
            status: data.item.matchScore >= 70 ? "High Match Found" : "Possible Match",
            matchFound: true,
            match_score: data.item.matchScore,
            matchDetails: {
              matchedItemId: data.item.matchedItem.id,
              matchedDescription: data.item.matchedItem.description,
              matchedImageUrl: data.item.matchedItem.imageUrl,
              matchScore: data.item.matchScore,
            },
          };
          setResult(updatedResult);
          sessionStorage.setItem("analysisResult", JSON.stringify(updatedResult));
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [result]);

  const getStatusIcon = (status: string) => {
    if (status === "High Match Found") {
      return <CheckCircle className="h-8 w-8 text-green-500" />;
    }
    if (status === "Possible Match") {
      return <AlertCircle className="h-8 w-8 text-yellow-500" />;
    }
    return <XCircle className="h-8 w-8 text-muted-foreground" />;
  };

  const getStatusColor = (status: string) => {
    if (status === "High Match Found")
      return "text-green-600 dark:text-green-400";
    if (status === "Possible Match")
      return "text-yellow-600 dark:text-yellow-400";
    return "text-muted-foreground";
  };

  const getStatusBgColor = (status: string) => {
    if (status === "High Match Found")
      return "bg-green-500/10 border-green-500/20";
    if (status === "Possible Match")
      return "bg-yellow-500/10 border-yellow-500/20";
    return "bg-muted/50 border-border";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-16 sm:py-24">
          <LoadingSpinner />
        </main>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-16 sm:py-24">
          <div className="text-center space-y-4">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive/50" />
            <p className="text-lg text-destructive font-medium">
              {error || "No results available"}
            </p>
            <Link href="/upload">
              <Button>Upload an Image</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:py-16">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-4">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-medium text-violet-600 dark:text-violet-400">
              AI Analysis Complete
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {result.type === "lost"
              ? "Lost Item Registered"
              : "Found Item Analyzed"}
          </h1>
          <p className="mt-2 text-muted-foreground">{result.message}</p>
        </div>

        <div className="space-y-6">
          {/* Uploaded Image */}
          <Card>
            <CardHeader>
              <CardTitle>Your Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                {result.imagePreview && result.imagePreview.trim() !== "" ? (
                  <Image
                    src={result.imagePreview}
                    alt="Uploaded item"
                    fill
                    className="object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No image available
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {result.type}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Detected:{" "}
                  <span className="font-medium text-foreground capitalize">
                    {result.detected_item}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Match Status */}
          <Card className={`border ${getStatusBgColor(result.status)}`}>
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                {getStatusIcon(result.status)}
                <div className="flex-1">
                  <p
                    className={`text-xl font-semibold ${getStatusColor(
                      result.status
                    )}`}
                  >
                    {result.status}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {result.match_score > 0
                      ? `${result.match_score}% similarity with items in database`
                      : "Your item has been registered for future matching"}
                  </p>
                </div>
                {result.match_score > 0 && (
                  <div className="text-right">
                    <p className="text-3xl font-bold">{result.match_score}%</p>
                    <p className="text-xs text-muted-foreground">Match Score</p>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {result.match_score > 0 && (
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all duration-500 ${
                        result.match_score >= 70
                          ? "bg-gradient-to-r from-green-500 to-emerald-500"
                          : result.match_score >= 50
                          ? "bg-gradient-to-r from-yellow-500 to-amber-500"
                          : "bg-gradient-to-r from-gray-400 to-gray-500"
                      }`}
                      style={{ width: `${result.match_score}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matched Item Details */}
          {result.matchDetails && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <CardTitle className="text-green-600 dark:text-green-400">
                  Matched Item Found!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-muted shrink-0">
                    {result.matchDetails.matchedImageUrl &&
                    result.matchDetails.matchedImageUrl.trim() !== "" ? (
                      <Image
                        src={result.matchDetails.matchedImageUrl}
                        alt="Matched item"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium mb-1">
                      {result.matchDetails.matchedDescription}
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      Match confidence: {result.matchDetails.matchScore}%
                    </p>
                    <Link href={`/item/${result.matchDetails.matchedItemId}`}>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        View Details
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Similar Items */}
          {result.similarItems &&
            result.similarItems.length > 0 &&
            !result.matchDetails && (
              <Card>
                <CardHeader>
                  <CardTitle>Similar Items in Database</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {result.similarItems.map((item) => (
                      <Link
                        key={item.id}
                        href={`/item/${item.id}`}
                        className="relative group block"
                      >
                        <div className="aspect-square rounded-lg overflow-hidden bg-muted ring-offset-background group-hover:ring-2 group-hover:ring-violet-500 group-hover:ring-offset-2 transition-all">
                          {item.imageUrl && item.imageUrl.trim() !== "" ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.description}
                              fill
                              className="object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="absolute bottom-2 left-2 right-2">
                          <Badge className="bg-black/70 text-white backdrop-blur-sm border-white/20">
                            {item.score}% match
                          </Badge>
                        </div>
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                          <ExternalLink className="w-6 h-6 text-white" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Blockchain Details */}
          <Card>
            <CardHeader>
              <CardTitle>Blockchain Record</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Transaction Hash
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                    {result.tx_hash || "Pending..."}
                  </code>
                  {result.tx_hash && !result.tx_hash.startsWith("pending") && (
                    <Button size="sm" variant="ghost" className="shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {(!result.tx_hash || result.tx_hash.startsWith("pending")) && (
                  <p className="text-xs text-muted-foreground mt-1">
                     Waiting for match to record on blockchain
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Timestamp
                </p>
                <p className="text-sm">
                  {new Date(result.timestamp).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Item ID
                </p>
                <code className="font-mono text-sm">{result.itemId}</code>
              </div>
            </CardContent>
          </Card>

          {/* QR Code for Lost Items */}
          {result.type === "lost" && (
            <Card className="border-violet-500/20 bg-violet-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-1 rounded bg-violet-500/10">
                    {/* Icon placeholder if needed */}
                  </div>
                  Unique QR Code
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Download and print this code. Finders can scan it to view item
                  details.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border">
                  <QRCodeSVG
                    // Keep QR payload small to avoid "Data too long" errors.
                    // Encode a URL that the scanner (or any camera app) can open directly.
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/item/${result.itemId}`}
                    size={180}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-mono mb-2">
                    ID: {result.itemId}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                  >
                    Print / Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/upload" className="flex-1">
              <Button
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                size="lg"
              >
                Upload Another Item
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/my-uploads" className="flex-1">
              <Button className="w-full" variant="outline" size="lg">
                View My Uploads
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

