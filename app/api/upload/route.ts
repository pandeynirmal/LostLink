import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import connectDB from "@/lib/db";
import Item from "@/lib/models/Item";
import { getEmbedding, getMatchScore, getTextEmbedding, getCombinedMatchScore } from "@/lib/ai-service";
import { recordMatch, registerItem } from "@/lib/blockchain";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

//  Helper: Extract user from token


export async function POST(request: NextRequest) {
  try {
    //  REQUIRE LOGIN
  const cookieStore = await cookies();
const token = cookieStore.get("token")?.value;

if (!token) {
  return NextResponse.json(
    { error: "Unauthorized. Please login first." },
    { status: 401 }
  );
}

const decoded = verifyToken(token);
if (!decoded) {
  return NextResponse.json(
    { error: "Invalid token." },
    { status: 401 }
  );
}

const userId = decoded.userId;

    const formData = await request.formData();

    const image = formData.get("image") as File;
    const description = formData.get("description") as string;
    const itemType = formData.get("type") as "lost" | "found";
    const rawRewardAmount = formData.get("rewardAmount");
    const parsedRewardAmount =
      typeof rawRewardAmount === "string" && rawRewardAmount.trim() !== ""
        ? Number(rawRewardAmount)
        : 0;
    const rewardAmount = Number.isFinite(parsedRewardAmount)
      ? parsedRewardAmount
      : 0;
    const rawContactPhone = formData.get("contactPhone");
    const contactPhone =
      typeof rawContactPhone === "string" ? rawContactPhone.trim() : "";
    const rewardPaymentMethod = (formData.get("rewardPaymentMethod") as "offchain" | "onchain") || "offchain";
    const latitude = parseFloat(formData.get("latitude") as string);
    const longitude = parseFloat(formData.get("longitude") as string);

    if (!image || !description || !itemType) {
      return NextResponse.json(
        { error: "Missing required fields: image, description, and type" },
        { status: 400 }
      );
    }

    if (!["lost", "found"].includes(itemType)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "lost" or "found"' },
        { status: 400 }
      );
    }

    if (rewardAmount < 0) {
      return NextResponse.json(
        { error: "Reward amount must be greater than or equal to 0" },
        { status: 400 }
      );
    }

    if (itemType === "lost" && contactPhone) {
      const phonePattern = /^[+\d][\d\s-]{7,19}$/;
      if (!phonePattern.test(contactPhone)) {
        return NextResponse.json(
          { error: "Enter a valid mobile number." },
          { status: 400 }
        );
      }
    }

    await connectDB();

    //  Ensure upload directory exists
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    //  Save image
    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}-${image.name}`;
    const filepath = path.join(uploadsDir, filename);

    await writeFile(filepath, buffer);

    const imageUrl = `/uploads/${filename}`;

    console.log(` Processing ${itemType} item by user ${userId}`);

    let embedding: number[];
    let detectedItem = description.split(" ")[0] || "Item";

    try {
      embedding = await getEmbedding(buffer, image.name);
      console.log(" AI embedding generated successfully");
    } catch (error) {
      return NextResponse.json(
        {
          error: "AI service unavailable",
          details: (error as Error).message,
        },
        { status: 503 }
      );
    }

    //  PREVENT DUPLICATE UPLOADS BY SAME USER
    const myExistingItems = await Item.find({
      userId: userId,
      status: { $ne: "resolved" },
      removedByAdmin: { $ne: true },
    });

    for (const existing of myExistingItems) {
      if (!existing.embedding?.length) continue;
      
      const matchResult = await getMatchScore(existing.embedding, embedding);
      if (matchResult.match_score >= 0.95) {
        // Very high similarity - likely the same image or very similar item
        const sameType = existing.type === itemType;
        return NextResponse.json(
          { 
            error: sameType 
              ? `You have already uploaded this item as ${itemType}.` 
              : `You have already uploaded this item as ${existing.type}.`,
            existingItemId: existing._id,
            details: "Duplicate detection prevented this upload to keep your history clean."
          },
          { status: 409 }
        );
      }
    }

    //  CREATE ITEM WITH USER ID (CRITICAL FIX)
    const newItem = await Item.create({
      type: itemType,
      description,
      imageUrl,
      embedding,
      userId, //  THIS WAS THE ROOT PROBLEM
      status: "pending",
      rewardAmount: itemType === "lost" ? rewardAmount : 0,
      rewardPaymentMethod: itemType === "lost" ? rewardPaymentMethod : "offchain",
      contactPhone: itemType === "lost" ? contactPhone : "",
      latitude: !isNaN(latitude) ? latitude : undefined,
      longitude: !isNaN(longitude) ? longitude : undefined,
    });

    console.log(` Item saved: ${newItem._id}`);

    //  Blockchain registration (lost items only)
    if (itemType === "lost") {
      try {
        // Generate mock metadata URI for IPFS representation
        // In a real production app, we would upload the JSON to Pinata/IPFS here
        const mockCid = `Qm${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
        const metadataURI = `ipfs://${mockCid}`;

        const blockchainData = await registerItem(
          newItem._id.toString(),
          itemType,
          `QR-${newItem._id.toString().substring(0, 8)}`, // Mock QR hash if not available
          latitude || 0,
          longitude || 0,
          description.substring(0, 32), // Short description for chain
          rewardAmount,
          metadataURI
        );

        if (blockchainData) {
          await Item.findByIdAndUpdate(newItem._id, {
            blockchain: {
              ...blockchainData,
              action: "register",
              metadataURI, // Store the URI in MongoDB too
            },
          });
        }
      } catch (error) {
        console.error("Blockchain registration failed:", error);
      }
    }

  
    const oppositeType = itemType === "lost" ? "found" : "lost";
    const potentialMatches = await Item.find({
      type: oppositeType,
      status: "pending",
      removedByAdmin: { $ne: true },
    });

    let bestMatch = null;
    let highestScore = 0;
    let allMatches: Array<{
      id: string;
      score: number;
      description: string;
      imageUrl: string;
    }> = [];

    // Get text embedding for the new item description
    let newItemTextEmbedding: number[] | null = null;
    try {
      newItemTextEmbedding = await getTextEmbedding(description);
    } catch {
      console.warn("Text embedding failed, falling back to image-only matching");
    }

    for (const candidateItem of potentialMatches) {
      if (!candidateItem.embedding?.length) continue;

      let score = 0;

      // Try combined image + text matching
      if (newItemTextEmbedding && candidateItem.description) {
        try {
          const candidateTextEmb = await getTextEmbedding(candidateItem.description);
          const combinedResult = await getCombinedMatchScore(
            candidateItem.embedding,
            embedding,
            candidateTextEmb,
            newItemTextEmbedding,
            { image: 0.6, text: 0.4 }
          );
          score = combinedResult.combined_match_score;
        } catch {
          // Fallback to image-only
          const matchResult = await getMatchScore(candidateItem.embedding, embedding);
          score = matchResult.match_score;
        }
      } else {
        const matchResult = await getMatchScore(candidateItem.embedding, embedding);
        score = matchResult.match_score;
      }

      if (score > 0.3) {
        allMatches.push({
          id: candidateItem._id.toString(),
          score: Math.round(score * 100),
          description: candidateItem.description,
          imageUrl: candidateItem.imageUrl,
        });
      }

      if (score > 0.8 && score > highestScore) {
        highestScore = score;
        bestMatch = candidateItem;
      }
    }

    allMatches.sort((a, b) => b.score - a.score);

    let status = "No Match Found";
    let blockchainData: any = null;
    const matchScorePercent = Math.round(highestScore * 100);

    if (bestMatch && highestScore >= 0.5) {
      status = highestScore >= 0.7 ? "High Match Found" : "Possible Match";

      // Keep on-chain match anchoring for high-confidence matches only.
      if (highestScore >= 0.7) {
        try {
          blockchainData = await recordMatch(
            itemType === "found"
              ? bestMatch._id.toString()
              : newItem._id.toString(),
            itemType === "found"
              ? newItem._id.toString()
              : bestMatch._id.toString(),
            highestScore
          );
        } catch (error) {
          console.error("Blockchain recording failed:", error);
        }
      }

      await Item.findByIdAndUpdate(newItem._id, {
        status: "matched",
        matchedItemId: bestMatch._id,
        matchScore: highestScore,
        ...(blockchainData && {
          blockchain: {
            ...blockchainData,
            action: "match",
          },
        }),
      });

      await Item.findByIdAndUpdate(bestMatch._id, {
        status: "matched",
        matchedItemId: newItem._id,
        matchScore: highestScore,
        ...(blockchainData && {
          blockchain: {
            ...blockchainData,
            action: "match",
          },
        }),
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
      matchFound: bestMatch !== null && highestScore >= 0.5,
      matchDetails: bestMatch
        ? {
            matchedItemId: bestMatch._id,
            matchedDescription: bestMatch.description,
            matchedImageUrl: bestMatch.imageUrl,
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
      {
        error: "Internal server error",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

