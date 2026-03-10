import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import ContactRequest from "@/lib/models/ContactRequest";
import { requireAdmin } from "@/lib/adminAuth";
import { anchorClaimDecision } from "@/lib/blockchain";

function isValidTxHash(hash: string | unknown): boolean {
  return typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    await dbConnect();

    const { id } = await context.params;
    const { decision, notes = "" } = await request.json();

    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    const claim = await ContactRequest.findById(id);
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    if (
      (claim.adminStatus === "approved" || claim.adminStatus === "rejected") &&
      isValidTxHash(claim.adminDecisionTxHash)
    ) {
      return NextResponse.json(
        { error: "Claim decision is already finalized on blockchain and cannot be modified." },
        { status: 409 }
      );
    }

    const anchor = await anchorClaimDecision({
      contactRequestId: claim._id.toString(),
      itemId: claim.itemId.toString(),
      ownerId: claim.ownerId.toString(),
      requesterId: claim.requesterId.toString(),
      aiMatchScore: Number(claim.aiMatchScore || 0),
      adminId: admin._id.toString(),
      decision,
      notes,
    });

    if (!anchor?.txHash || !isValidTxHash(anchor.txHash)) {
      return NextResponse.json(
        { error: "Claim decision was not recorded on blockchain. Decision not saved." },
        { status: 503 }
      );
    }

    claim.adminStatus = decision;
    claim.adminReviewNotes = notes;
    claim.adminReviewedBy = admin._id;
    claim.adminReviewedAt = new Date();
    claim.adminDecisionTxHash = anchor.txHash;
    await claim.save();

    return NextResponse.json({
      success: true,
      message: `Claim ${decision}`,
      txHash: claim.adminDecisionTxHash || "",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}
