import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import EscrowCase from "@/lib/models/EscrowCase";
import Item from "@/lib/models/Item";
import User from "@/lib/models/User";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  return decoded.userId;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const itemId = request.nextUrl.searchParams.get("itemId") || "";
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    await connectDB();
    const me = await User.findById(userId).select("role");

    // First try to find escrow directly by itemId
    let escrow = await EscrowCase.findOne({ itemId })
      .sort({ createdAt: -1 })
      .populate("ownerId", "fullName email walletAddress")
      .populate("finderId", "fullName email walletAddress")
      .lean();

    // If not found, check if this item has a matchedItemId and look up escrow by that
    if (!escrow) {
      const item = await Item.findById(itemId).select("matchedItemId").lean();
      if (item?.matchedItemId) {
        escrow = await EscrowCase.findOne({ itemId: item.matchedItemId })
          .sort({ createdAt: -1 })
          .populate("ownerId", "fullName email walletAddress")
          .populate("finderId", "fullName email walletAddress")
          .lean();
      }
    }

    if (!escrow) {
      return NextResponse.json(
        { success: true, escrow: null },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    const isAdmin = me?.role === "admin";
    const isOwner = escrow.ownerId?._id?.toString?.() === userId;
    const isFinder = escrow.finderId?._id?.toString?.() === userId;

    const now = Date.now();
    const autoReleaseAvailable =
      escrow.ownerItemReceived &&
      escrow.autoReleaseAt &&
      !escrow.autoReleaseTriggered &&
      now >= new Date(escrow.autoReleaseAt).getTime();

    const timeUntilAutoRelease =
      escrow.autoReleaseAt && !escrow.autoReleaseTriggered
        ? Math.max(0, new Date(escrow.autoReleaseAt).getTime() - now)
        : null;

    const releaseVotes =
      (escrow.ownerReleaseApproved ? 1 : 0) +
      (escrow.finderReleaseApproved ? 1 : 0) +
      (escrow.adminReleaseApproved ? 1 : 0);

    return NextResponse.json(
      {
        success: true,
        escrow,
        meta: {
          isOwner,
          isFinder,
          isAdmin,
          releaseVotes,
          releaseReady:
            (escrow.ownerReleaseApproved && escrow.finderReleaseApproved) ||
            (escrow.ownerItemReceived && releaseVotes >= 2),
          autoReleaseAvailable,
          timeUntilAutoRelease,
          canRaiseDispute:
            ["awaiting_delivery", "item_delivered", "awaiting_confirmation"].includes(
              escrow.state
            ) &&
            (isOwner || isFinder || isAdmin),
        },
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("Escrow GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId, amountEth, holdTxHash = "", holdSource = "project_wallet" } =
      await request.json();
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    await connectDB();

    const item = await Item.findById(itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const me = await User.findById(userId).select("role");
    const isAdmin = me?.role === "admin";
    const isOwner = item.userId?.toString() === userId;
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Only owner/admin can setup escrow" },
        { status: 403 }
      );
    }

    const baseAmount = Number(item.rewardAmount || 0);
    const requestedAmount =
      Number.isFinite(Number(amountEth)) && Number(amountEth) > 0
        ? Number(amountEth)
        : baseAmount;
  

    const existing = await EscrowCase.findOne({ itemId: item._id }).sort({
      createdAt: -1,
    });

    if (existing && !["released", "refunded"].includes(existing.state)) {
      existing.amountEth = requestedAmount;
      existing.holdSource = holdSource;
      if (holdTxHash) existing.holdTxHash = holdTxHash;
      if (!existing.finderId) {
        existing.state = "funded";
      }
      await existing.save();
      return NextResponse.json({
        success: true,
        escrow: existing,
        message: "Escrow updated.",
      });
    }

    const escrow = await EscrowCase.create({
      itemId: item._id,
      ownerId: item.userId,
      amountEth: requestedAmount,
      holdSource,
      holdTxHash: holdTxHash || undefined,
      state: "funded",
    });

    return NextResponse.json({ success: true, escrow, message: "Escrow created." });
  } catch (error) {
    console.error("Escrow POST error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}