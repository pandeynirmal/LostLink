import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Item from "@/lib/models/Item";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(buffer: Buffer, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "lostlink",
        public_id: `${Date.now()}-${filename.replace(/\.[^/.]+$/, "")}`,
        resource_type: "image",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      }
    );
    stream.end(buffer);
  });
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized. Please login first." }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token." }, { status: 401 });
    }

    const userId = decoded.userId;
    const formData = await request.formData();

    const image = formData.get("image") as File;
    const description = formData.get("description") as string;
    const itemType = formData.get("type") as "lost" | "found";
    const rawRewardAmount = formData.get("rewardAmount");
    const parsedRewardAmount =
      typeof rawRewardAmount === "string" && rawRewardAmount.trim() !== ""
        ? Number(rawRewardAmount) : 0;
    const rewardAmount = Number.isFinite(parsedRewardAmount) ? parsedRewardAmount : 0;
    const rawContactPhone = formData.get("contactPhone");
    const contactPhone = typeof rawContactPhone === "string" ? rawContactPhone.trim() : "";
    const rewardPaymentMethod =
      (formData.get("rewardPaymentMethod") as "offchain" | "onchain") || "offchain";
    const latitude = parseFloat(formData.get("latitude") as string);
    const longitude = parseFloat(formData.get("longitude") as string);

    if (!image || !description || !itemType) {
      return NextResponse.json(
        { error: "Missing required fields: image, description, and type" },
        { status: 400 }
      );
    }

    if (!["lost", "found"].includes(itemType)) {
      return NextResponse.json({ error: 'Invalid type. Must be "lost" or "found"' }, { status: 400 });
    }

    if (rewardAmount < 0) {
      return NextResponse.json({ error: "Reward amount must be greater than or equal to 0" }, { status: 400 });
    }

    if (itemType === "lost" && contactPhone) {
      const phonePattern = /^[+\d][\d\s-]{7,19}$/;
      if (!phonePattern.test(contactPhone)) {
        return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
      }
    }

    await connectDB();

    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    let imageUrl = "";

    try {
      imageUrl = await uploadToCloudinary(buffer, image.name);
    } catch (error) {
      return NextResponse.json(
        { error: "Image upload failed", details: (error as Error).message },
        { status: 500 }
      );
    }

    let embedding: number[] = [];
    let detectedItem = description.split(" ")[0] || "Item";

    try {
      const { getEmbedding } = await import("@/lib/ai-service");
      embedding = await getEmbedding(buffer, image.name);
    } catch (error) {
      console.warn("AI service unavailable, skipping embedding:", (error as Error).message);
    }

    if (embedding.length > 0) {
      const myExistingItems = await Item.find({
        userId: userId,
        status: { $ne: "resolved" },
        removedByAdmin: { $ne: true },
      });

      for (const existing of myExistingItems) {
        if (!existing.embedding?.length) continue;
        try {
          const { getMatchScore } = await import("@/lib/ai-service");
          const matchResult = await getMatchScore(existing.embedding, embedding);
          if (matchResult.match_score >= 0.95) {
            const sameType = existing.type === itemType;
            return NextResponse.json(
              {
                error: sameType
                  ? `You have already uploaded this item as ${itemType}.`
                  : `You have already uploaded this item as ${existing.type}.`,
                existingItemId: existing._id,
                details: "Duplicate detection prevented this upload.",
              },
              { status: 409 }
            );
          }
        } catch {
          // Skip duplicate check if AI unavailable
        }
      }
    }

    const newItem = await Item.create({
      type: itemType,
      description,
      imageUrl,
      embedding,
      userId,
      status: "pending",
      rewardAmount: itemType === "lost" ? rewardAmount : 0,
      rewardPaymentMethod: itemType === "lost" ? rewardPaymentMethod : "offchain",
      contactPhone: itemType === "lost" ? contactPhone : "",
      latitude: !isNaN(latitude) ? latitude : undefined,
      longitude: !isNaN(longitude) ? longitude : undefined,
    });

    if (itemType === "lost") {
      try {
        const { registerItem } = await import("@/lib/blockchain");
        const mockCid = `Qm${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
        const metadataURI = `ipfs://${mockCid}`;
        const blockchainData = await registerItem(
          newItem._id.toString(), itemType,
          `QR-${newItem._id.toString().substring(0, 8)}`,
          latitude || 0, longitude || 0,
          description.substring(0, 32), rewardAmount, metadataURI
        );
        if (blockchainData) {
          await Item.findByIdAndUpdate(newItem._id, {
            blockchain: { ...blockchainData, action: "register", metadataURI },
          });
        }
      } catch (error) {
        console.warn("Blockchain registration skipped:", (error as Error).message);
      }
    }

    let bestMatch = null;
    let highestScore = 0;
    let allMatches: Array<{ id: string; score: number; description: string; imageUrl: string }> = [];

    if (embedding.length > 0) {
      console.log('[Upload] Starting AI matching with embedding length:', embedding.length);
      try {
        const { getMatchScore, getTextEmbedding, getCombinedMatchScore } = await import("@/lib/ai-service");
        const oppositeType = itemType === "lost" ? "found" : "lost";
        const potentialMatches = await Item.find({
          type: oppositeType,
          status: "pending",
          removedByAdmin: { $ne: true },
        });

        let newItemTextEmbedding: number[] | null = null;
        try {
          newItemTextEmbedding = await getTextEmbedding(description);
        } catch {
          console.warn("Text embedding failed");
        }

        for (const candidateItem of potentialMatches) {
          if (!candidateItem.embedding?.length) continue;

          let score = 0;

          if (newItemTextEmbedding && candidateItem.description) {
            try {
              const candidateTextEmb = await getTextEmbedding(candidateItem.description);
              const combinedResult = await getCombinedMatchScore(
                candidateItem.embedding, embedding,
                candidateTextEmb, newItemTextEmbedding,
                { image: 0.6, text: 0.4 }
              );
              score = combinedResult.combined_match_score;
              console.log(`[Upload] Combined match score for ${candidateItem._id}:`, {
                combined: score,
                image: combinedResult.image_match_score,
                text: combinedResult.text_match_score,
                description: candidateItem.description.substring(0, 50)
              });
            } catch (err) {
              console.warn('Combined match failed, falling back to image-only:', (err as Error).message);
              const matchResult = await getMatchScore(candidateItem.embedding, embedding);
              score = matchResult.match_score;
              console.log(`[Upload] Image-only match score for ${candidateItem._id}:`, score);
            }
          } else {
            const matchResult = await getMatchScore(candidateItem.embedding, embedding);
            score = matchResult.match_score;
            console.log(`[Upload] Basic image match score for ${candidateItem._id}:`, score);
          }

          if (score > 0.2) {
            allMatches.push({
              id: candidateItem._id.toString(),
              score: Math.round(score * 100),
              description: candidateItem.description,
              imageUrl: candidateItem.imageUrl,
            });
          }

          // Lowered threshold to 0.3 for lightweight AI
          if (score > 0.15 && score > highestScore) {
            highestScore = score;
            bestMatch = candidateItem;
          }
        }

        allMatches.sort((a, b) => b.score - a.score);
      } catch (error) {
        console.warn("AI matching skipped:", (error as Error).message);
      }
    }

    let status = "No Match Found";
    let blockchainData: any = null;
    const matchScorePercent = Math.round(highestScore * 100);

    if (bestMatch && highestScore >= 0.15) {
      status = highestScore >= 0.4 ? "High Match Found" : "Possible Match";

      if (highestScore >= 0.4) {
        try {
          const { recordMatch } = await import("@/lib/blockchain");
          blockchainData = await recordMatch(
            itemType === "found" ? (bestMatch as any)._id.toString() : newItem._id.toString(),
            itemType === "found" ? newItem._id.toString() : (bestMatch as any)._id.toString(),
            highestScore
          );
        } catch (error) {
          console.warn("Blockchain match recording skipped:", (error as Error).message);
        }
      }

      await Item.findByIdAndUpdate(newItem._id, {
        status: "matched",
        matchedItemId: (bestMatch as any)._id,
        matchScore: highestScore,
        ...(blockchainData && { blockchain: { ...blockchainData, action: "match" } }),
      });
      console.log(`[Upload] Stored match for newItem ${newItem._id}:`, { 
        matchedTo: (bestMatch as any)._id, 
        score: highestScore, 
        scorePercent: Math.round(highestScore * 100) 
      });

      await Item.findByIdAndUpdate((bestMatch as any)._id, {
        status: "matched",
        matchedItemId: newItem._id,
        matchScore: highestScore,
        ...(blockchainData && { blockchain: { ...blockchainData, action: "match" } }),
      });
      console.log(`[Upload] Stored match for bestMatch ${(bestMatch as any)._id}:`, { 
        matchedTo: newItem._id, 
        score: highestScore, 
        scorePercent: Math.round(highestScore * 100) 
      });
    }

    return NextResponse.json({
      success: true,
      itemId: newItem._id,
      detected_item: detectedItem,
      match_score: matchScorePercent,
      status,
      tx_hash: blockchainData?.txHash || `pending-${newItem._id}`,
      blockchain: blockchainData || null,
      matchFound: bestMatch !== null && highestScore >= 0.2,
      matchDetails: bestMatch
        ? {
            matchedItemId: (bestMatch as any)._id,
            matchedDescription: (bestMatch as any).description,
            matchedImageUrl: (bestMatch as any).imageUrl,
            matchScore: matchScorePercent,
          }
        : null,
      similarItems: allMatches.slice(0, 5),
      message:
        status === "No Match Found"
          ? `${itemType === "lost" ? "Lost" : "Found"} item registered.`
          : `${status}! ${matchScorePercent}% similarity detected.`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

