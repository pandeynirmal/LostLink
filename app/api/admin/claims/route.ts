import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import ContactRequest from "@/lib/models/ContactRequest";
import { requireAdmin } from "@/lib/adminAuth";
import { anchorClaimDecision } from "@/lib/blockchain";

function isValidTxHash(hash: string | unknown): boolean {
  return typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    await dbConnect();

    const status = request.nextUrl.searchParams.get("status") || "pending";
    const filter: any = {};

    if (status === "pending") {
      filter.status = "approved";
      filter.$or = [{ adminStatus: "pending" }, { adminStatus: { $exists: false } }];
    } else if (status === "approved") {
      filter.status = "approved";
      filter.adminStatus = "approved";
      filter.adminDecisionTxHash = { $regex: /^0x[a-fA-F0-9]{64}$/ };
    } else if (status === "rejected") {
      filter.status = "approved";
      filter.adminStatus = "rejected";
      filter.adminDecisionTxHash = { $regex: /^0x[a-fA-F0-9]{64}$/ };
    }

    const claims = await ContactRequest.find(filter)
      .populate("itemId", "description type rewardAmount matchScore")
      .populate("requesterId", "fullName email walletAddress")
      .populate("ownerId", "fullName email walletAddress")
      .sort({ createdAt: -1 })
      .limit(200);

    const normalizeScore = (score: unknown): number => {
      if (typeof score !== "number" || !Number.isFinite(score)) return 0;
      return score <= 1 ? score * 100 : score;
    };

    const claimsWithConfidence = claims.map((claim: any) => {
      const fallbackItemScore = normalizeScore(claim?.itemId?.matchScore);
      const resolvedScore = normalizeScore(claim?.aiMatchScore) || fallbackItemScore;
      return {
        ...claim.toObject(),
        aiMatchScore: Math.round(resolvedScore * 100) / 100,
      };
    });

    return NextResponse.json({ claims: claimsWithConfidence });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    await dbConnect();

    const { decision, notes = "" } = await request.json();
    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    const pendingFilter = {
      status: "approved",
      $or: [{ adminStatus: "pending" }, { adminStatus: { $exists: false } }],
    };

    const pendingClaims = await ContactRequest.find(pendingFilter)
      .select("_id itemId ownerId requesterId aiMatchScore")
      .sort({ createdAt: 1 })
      .limit(500);

    const pendingIds = pendingClaims.map((claim) => claim._id);
    if (pendingIds.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        failed: 0,
        message: "No pending claims to process.",
      });
    }

    const now = new Date();
    let processed = 0;
    let failed = 0;
    let anchorFailed = 0;

    for (const claim of pendingClaims) {
      try {
        const anchor = await anchorClaimDecision({
          contactRequestId: claim._id.toString(),
          itemId: claim.itemId.toString(),
          ownerId: claim.ownerId.toString(),
          requesterId: claim.requesterId.toString(),
          aiMatchScore: Number((claim as any).aiMatchScore || 0),
          adminId: admin._id.toString(),
          decision,
          notes: notes || `Bulk ${decision} by admin`,
        });

        if (!anchor?.txHash || !isValidTxHash(anchor.txHash)) {
          anchorFailed += 1;
          failed += 1;
          continue;
        }

        await ContactRequest.findByIdAndUpdate(claim._id, {
          adminStatus: decision,
          adminReviewNotes: notes || `Bulk ${decision} by admin`,
          adminReviewedBy: admin._id,
          adminReviewedAt: now,
          adminDecisionTxHash: anchor.txHash,
        });
        processed += 1;
      } catch (anchorError) {
        anchorFailed += 1;
        failed += 1;
        console.error("Bulk claim anchor failed:", anchorError);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      failed,
      anchorFailed,
      counts: {
        pending: await ContactRequest.countDocuments({
          status: "approved",
          $or: [{ adminStatus: "pending" }, { adminStatus: { $exists: false } }],
        }),
        approved: await ContactRequest.countDocuments({
          status: "approved",
          adminStatus: "approved",
          adminDecisionTxHash: { $regex: /^0x[a-fA-F0-9]{64}$/ },
        }),
        rejected: await ContactRequest.countDocuments({
          status: "approved",
          adminStatus: "rejected",
          adminDecisionTxHash: { $regex: /^0x[a-fA-F0-9]{64}$/ },
        }),
      },
      message: `${decision === "approved" ? "Approved" : "Rejected"} ${processed} claim(s)${
        failed > 0 ? `, failed ${failed}` : ""
      }.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}
