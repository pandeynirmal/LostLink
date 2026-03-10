import { NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import Item from '@/lib/models/Item'
import ContactRequest from '@/lib/models/ContactRequest'
import '@/lib/models/User'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    await connectDB();
    const { id } = await context.params;
    const item = await Item.findById(id);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check permissions: Only owner or admin can delete
    const isOwner = item.userId?.toString() === decoded.userId;
    const isAdmin = decoded.role === "admin";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Perform deletion logic
    // 1. Delete the image file from public/uploads if it exists
    if (item.imageUrl && item.imageUrl.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), 'public', item.imageUrl);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[DELETE] Image file removed: ${filePath}`);
        } catch (err) {
          console.error(`[DELETE] Error removing file: ${err}`);
        }
      }
    }

    // 2. Remove the document from MongoDB
    await Item.findByIdAndDelete(id);

    // 3. Clean up associated contact requests
    await ContactRequest.deleteMany({ itemId: id });

    return NextResponse.json({ 
      success: true, 
      message: "Item and associated files deleted successfully. Note: Blockchain records remain immutable." 
    });

  } catch (error) {
    console.error('DELETE ERROR:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB()

    const { id } = await context.params

    const item = await Item.findById(id).populate('userId')

    if (!item || item.removedByAdmin) {
      return NextResponse.json(
        { success: false, error: 'Item not found' },
        { status: 404 }
      )
    }

    const user = item.userId as any
    const normalizeScore = (score: unknown): number => {
      if (typeof score !== "number" || !Number.isFinite(score)) return 0
      return score <= 1 ? score * 100 : score
    }

    let normalizedMatchScore = normalizeScore(item.matchScore)

    // Fallback to counterpart score when this side has empty/zero score.
    if (normalizedMatchScore <= 0) {
      const counterpartByMatchedId = item.matchedItemId
        ? await Item.findById(item.matchedItemId).select("matchScore")
        : null
      normalizedMatchScore = normalizeScore(counterpartByMatchedId?.matchScore)
    }

    if (normalizedMatchScore <= 0) {
      const counterpartByReverseLink = await Item.findOne({ matchedItemId: item._id })
        .sort({ matchScore: -1 })
        .select("matchScore")
      normalizedMatchScore = normalizeScore(counterpartByReverseLink?.matchScore)
    }

    const claimCount = await ContactRequest.countDocuments({
      itemId: item._id,
      status: "pending"
    })

    return NextResponse.json({
      success: true,
      item: {
        id: item._id,
        ownerId: item.userId?._id?.toString() || item.userId?.toString() || "",
        description: item.description,
        imageUrl: item.imageUrl,
        type: item.type,
        status: item.status,
        rewardAmount: item.rewardAmount,
        contactPhone: item.contactPhone || "",
        isClaimed: item.isClaimed,
        claimCount,
        createdAt: item.createdAt,
        matchScore: Math.round(normalizedMatchScore * 100) / 100,

        //  Blockchain Info
        blockchain: item.blockchain
          ? {
              txHash: item.blockchain.txHash,
              network: item.blockchain.network,
              contractAddress: item.blockchain.contractAddress,
              action: item.blockchain.action,
              verifiedAt: item.blockchain.verifiedAt,
            }
          : null,

        user: {
          fullName: user?.fullName || 'Unknown',
          email: user?.email || 'Not available',
          organization: user?.organization || '',
          walletAddress: user?.walletAddress || ''
        }
      }
    })

  } catch (error) {
    console.error('FULL ERROR:', error)

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    )
  }
}

