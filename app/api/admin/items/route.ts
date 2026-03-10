import { NextResponse, NextRequest } from "next/server";
import dbConnect from "@/lib/db";
import Item from "@/lib/models/Item";
import ContactRequest from "@/lib/models/ContactRequest";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "20", 10));
    const skip = (page - 1) * limit;

    // Fetch page items + total first
    const [items, total] = await Promise.all([
      Item.find({ removedByAdmin: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("_id type description latitude longitude rewardAmount isClaimed")
        .lean(),
      Item.countDocuments({ removedByAdmin: { $ne: true } }),
    ]);

    const itemIds = items.map((item: any) => item._id);
    const relatedClaims = itemIds.length
      ? await ContactRequest.find({
          itemId: { $in: itemIds },
          status: "approved",
        })
          .select("itemId adminStatus status")
          .lean()
      : [];

    const claimMap = new Map<string, string>();
    
    relatedClaims.forEach((claim: any) => {
      const key = claim.itemId?.toString?.() || "";
      if (key && !claimMap.has(key)) {
        claimMap.set(
          key,
          claim.adminStatus === "approved" || claim.adminStatus === "rejected"
            ? claim.adminStatus
            : "pending"
        );
      }
    });

    const payload = items.map((item: any) => ({
      id: item._id.toString(),
      type: item.type,
      description: item.description,
      latitude: item.latitude,
      longitude: item.longitude,
      rewardAmount: Number(item.rewardAmount || 0),
      isClaimed: Boolean(item.isClaimed),
      claimReviewStatus: claimMap.get(item._id.toString()) || null,
    }));

    return NextResponse.json(
      {
        payload,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch items" },
      { status: 401 }
    );
  }
}
