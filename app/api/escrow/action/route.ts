import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import connectDB from "@/lib/db";
import EscrowCase, { EscrowState } from "@/lib/models/EscrowCase";
import Item from "@/lib/models/Item";
import ContactRequest from "@/lib/models/ContactRequest";
import Conversation from "@/lib/models/Conversation";
import User from "@/lib/models/User";
import WalletTransaction from "@/lib/models/WalletTransaction";
import { verifyAndPay } from "@/lib/blockchain";
import { ensureUserWallet } from "@/lib/wallet";
import {
  notifyFinderAssigned,
  notifyDeliveryInitiated,
  notifyItemDelivered,
  notifyItemReceived,
  notifyReleaseApproved,
  notifyEscrowReleased,
  notifyEscrowRefunded,
  notifyDisputeRaised,
  notifyDisputeResolved,
} from "@/lib/escrow-notifications";

// Three-Layer Escrow Constants
const AUTO_RELEASE_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VALID_STATE_TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  funded: ["claim_assigned", "refunded"],
  claim_assigned: ["awaiting_delivery", "disputed", "refunded"],
  awaiting_delivery: ["item_delivered", "disputed"],
  item_delivered: ["awaiting_confirmation", "disputed"],
  awaiting_confirmation: ["released", "disputed"],
  disputed: ["released", "refunded"],
  released: [],
  refunded: [],
};

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  return decoded.userId;
}

function countReleaseApprovals(escrow: any) {
  return Number(Boolean(escrow.ownerReleaseApproved))
    + Number(Boolean(escrow.finderReleaseApproved))
    + Number(Boolean(escrow.adminReleaseApproved));
}

async function executeEscrowRelease(escrow: any, providedTxHash?: string) {
  // Re-fetch escrow fresh from DB to get latest state (prevents double-release)
  const freshEscrow = await EscrowCase.findById(escrow._id);
  if (!freshEscrow) throw new Error("Escrow not found.");
  
  // Double-check: if already released or funds already sent, skip gracefully
  if (freshEscrow.state === "released" || freshEscrow.finderFundReceived) {
    console.log(`[executeEscrowRelease] Skipping - already released or funds sent. State: ${freshEscrow.state}, finderFundReceived: ${freshEscrow.finderFundReceived}`);
    return freshEscrow.releaseTxHash || providedTxHash || "already_completed";
  }

  const item = await Item.findById(freshEscrow.itemId);
  if (!item) throw new Error("Item not found for escrow.");

  if (!freshEscrow.finderId) throw new Error("No finder assigned.");

  const finder = await User.findById(freshEscrow.finderId);
  if (!finder) throw new Error("Finder profile missing.");

  const amount = Number(freshEscrow.amountEth || item.rewardAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Escrow amount must be greater than 0.");
  }

  const pseudoTxHash = providedTxHash || ("offchain_" + Date.now().toString(16));
  const isOffchain = freshEscrow.paymentMethod !== "onchain";

  // If item already paid via Verify & Pay, skip the balance transfer but still mark escrow released
  // Also guard against double-release using finderFundReceived flag
  if (!item.isClaimed && item.status !== "resolved" && !freshEscrow.finderFundReceived) {
    if (isOffchain) {
      // Funds were deducted from owner at escrow creation — only credit finder now
      await User.updateOne({ _id: finder._id }, { $inc: { offchainBalance: amount } });

      await WalletTransaction.create({
        fromUserId: freshEscrow.ownerId,
        toUserId: finder._id,
        itemId: item._id,
        contactRequestId: freshEscrow.contactRequestId || undefined,
        paymentMethod: "offchain",
        fromAddress: "escrow_lock",
        toAddress: finder.walletAddress || "internal",
        amountEth: amount,
        txHash: pseudoTxHash,
        network: "offchain",
        status: "completed",
      });
    }

    item.status = "resolved";
    item.isClaimed = true;
    item.rewardTxHash = pseudoTxHash;
    await item.save();

    if (item.matchedItemId) {
      const counterpart = await Item.findById(item.matchedItemId);
      if (counterpart) {
        counterpart.status = "resolved";
        counterpart.isClaimed = true;
        counterpart.rewardTxHash = pseudoTxHash;
        await counterpart.save();
      }
    }
  }

  freshEscrow.state = "released";
  freshEscrow.releaseTxHash = pseudoTxHash;
  freshEscrow.releasedAt = new Date();
  freshEscrow.finderFundReceived = true;
  await freshEscrow.save();

  return freshEscrow.releaseTxHash;
}

// Helper to validate state transitions
function canTransition(from: EscrowState, to: EscrowState): boolean {
  return VALID_STATE_TRANSITIONS[from]?.includes(to) || false;
}

// Helper to set auto-release timer
function setAutoReleaseTimer(escrow: any) {
  if (!escrow.autoReleaseAt && escrow.ownerItemReceived) {
    escrow.autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_DELAY_MS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      itemId,
      action,
      requestId = "",
      finderId = "",
      value = true,
      disputeReason = "",
      refundTxHash = "",
      releaseTxHash = "",
      // Layer 2: Delivery params
      deliveryMethod = "",
      deliveryTrackingId = "",
      deliveryNotes = "",
      deliveryPhotos = [],
      paymentMethod = "offchain",
    } = body;

    if (!itemId || !action) {
      return NextResponse.json({ error: "itemId and action are required" }, { status: 400 });
    }

    await connectDB();

    const item = await Item.findById(itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const me = await User.findById(userId).select("role");
    const isAdmin = me?.role === "admin";
    const isOwner = item.userId?.toString() === userId;

    let escrow = await EscrowCase.findOne({ itemId: item._id }).sort({ createdAt: -1 });

    // Create escrow action - must be before the "no escrow" check
    if (action === "create_escrow") {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Only owner/admin can create escrow." }, { status: 403 });
      }
      
      if (escrow && !["released", "refunded"].includes(escrow.state)) {
        return NextResponse.json({ error: "Active escrow already exists." }, { status: 400 });
      }

      const amount = Number(item.rewardAmount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "Item must have a reward amount > 0 to create escrow." }, { status: 400 });
      }

      const isOffchain = paymentMethod !== "onchain";

      if (isOffchain) {
        // Check owner has enough off-chain balance
        const owner = await User.findById(item.userId);
        if (!owner) return NextResponse.json({ error: "Owner not found." }, { status: 400 });
        const ownerBalance = Number(owner.offchainBalance || 0);
        if (ownerBalance < amount) {
          return NextResponse.json(
            { error: `Insufficient wallet balance. You have ${ownerBalance.toFixed(4)} ETH but escrow requires ${amount} ETH. Load funds in your wallet first.` },
            { status: 400 }
          );
        }

        // Deduct from owner's balance when creating escrow (funds are now "locked")
        await User.updateOne({ _id: owner._id }, { $inc: { offchainBalance: -amount } });

        // Record the freeze transaction
        await WalletTransaction.create({
          fromUserId: owner._id,
          toUserId: owner._id, // Locked to self (effectively escrow)
          itemId: item._id,
          paymentMethod: "offchain",
          fromAddress: "internal",
          toAddress: "escrow_lock",
          amountEth: amount,
          txHash: "freeze_" + Date.now().toString(16),
          network: "offchain",
          status: "completed",
        });
      }

      const newEscrow = await EscrowCase.create({
        itemId: item._id,
        ownerId: item.userId,
        amountEth: amount,
        state: isOffchain ? "funded" : "funded", // stays funded but holdSource differs
        holdSource: isOffchain ? "project_wallet" : "external_escrow",
        paymentMethod: isOffchain ? "offchain" : "onchain",
        ownerItemReceived: false,
        finderFundReceived: false,
        ownerReleaseApproved: false,
        finderReleaseApproved: false,
        adminReleaseApproved: false,
        autoReleaseTriggered: false,
      });

      return NextResponse.json({ 
        success: true, 
        escrowId: newEscrow._id,
        message: "Escrow created successfully."
      });
    }

    if (!escrow) {
      return NextResponse.json({ error: "Escrow not created for this item yet." }, { status: 404 });
    }

    if (["released", "refunded"].includes(escrow.state) && action !== "allow_chat") {
      return NextResponse.json({ error: "Escrow already closed." }, { status: 400 });
    }

    const finderUserId = escrow.finderId?.toString() || "";
    const isFinder = finderUserId === userId;

    if (action === "allow_chat") {
      if (!isOwner && !isFinder && !isAdmin) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
      if (!escrow.finderId) {
        return NextResponse.json({ error: "Assign finder before opening chat." }, { status: 400 });
      }
      let conversation = await Conversation.findOne({
        itemId: item._id,
        participants: { $all: [escrow.ownerId, escrow.finderId] },
      });
      if (conversation) {
        conversation.deletedFor = [];
        await conversation.save();
      } else {
        conversation = await Conversation.create({
          itemId: item._id,
          participants: [escrow.ownerId, escrow.finderId],
          deletedFor: [],
        });
      }
      return NextResponse.json({ success: true, conversationId: conversation._id });
    }

    // Layer 1 -> Layer 2: Assign Finder
    if (action === "assign_finder") {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Only owner/admin can assign finder." }, { status: 403 });
      }

      if (!canTransition(escrow.state, "claim_assigned")) {
        return NextResponse.json(
          { error: `Cannot assign finder from state: ${escrow.state}` },
          { status: 400 }
        );
      }

      let linkedRequest: any = null;
      if (requestId) {
        linkedRequest = await ContactRequest.findOne({
          _id: requestId,
          itemId: item._id,
          status: "approved",
        });
      } else {
        linkedRequest = await ContactRequest.findOne({
          itemId: item._id,
          status: "approved",
        }).sort({ createdAt: -1 });
      }

      const chosenFinderId = finderId || linkedRequest?.requesterId?.toString() || "";
      if (!chosenFinderId) {
        return NextResponse.json({ error: "No approved finder available." }, { status: 400 });
      }

      escrow.finderId = chosenFinderId as any;
      escrow.contactRequestId = linkedRequest?._id || escrow.contactRequestId;
      escrow.state = "claim_assigned";
      await escrow.save();

      // Send notification
      void notifyFinderAssigned(escrow);

      return NextResponse.json({ success: true, escrow, message: "Finder assigned to escrow." });
    }

    // claim_assigned -> awaiting_delivery: Owner notifies finder to start delivery
    if (action === "proceed_to_delivery") {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Only owner/admin can proceed to delivery." }, { status: 403 });
      }
      if (escrow.state !== "claim_assigned") {
        return NextResponse.json({ error: `Cannot proceed to delivery from state: ${escrow.state}` }, { status: 400 });
      }
      if (!escrow.finderId) {
        return NextResponse.json({ error: "No finder assigned yet." }, { status: 400 });
      }

      escrow.state = "awaiting_delivery";
      await escrow.save();

      // Notify finder to begin delivery
      void notifyDeliveryInitiated(escrow);

      return NextResponse.json({ success: true, escrow, message: "Finder notified to begin delivery." });
    }

    // Layer 2: Finder initiates delivery
    if (action === "initiate_delivery") {
      if (!isFinder && !isAdmin) {
        return NextResponse.json({ error: "Only finder/admin can initiate delivery." }, { status: 403 });
      }

      // Allow updating delivery info when already in awaiting_delivery, or transition from claim_assigned
      if (escrow.state !== "awaiting_delivery" && !canTransition(escrow.state, "awaiting_delivery")) {
        return NextResponse.json(
          { error: `Cannot initiate delivery from state: ${escrow.state}` },
          { status: 400 }
        );
      }

      escrow.state = "awaiting_delivery";
      escrow.deliveryMethod = deliveryMethod || escrow.deliveryMethod || "in_person";
      escrow.deliveryTrackingId = deliveryTrackingId || escrow.deliveryTrackingId || undefined;
      escrow.deliveryNotes = deliveryNotes || escrow.deliveryNotes || undefined;
      if (deliveryPhotos?.length > 0) {
        escrow.deliveryPhotos = deliveryPhotos;
      }
      await escrow.save();

      // Send notification
      void notifyDeliveryInitiated(escrow);

      return NextResponse.json({ success: true, escrow, message: "Delivery initiated." });
    }

    // Layer 2: Finder marks item delivered
    if (action === "mark_item_delivered") {
      if (!isFinder && !isAdmin) {
        return NextResponse.json({ error: "Only finder/admin can mark item delivered." }, { status: 403 });
      }

      if (!canTransition(escrow.state, "item_delivered")) {
        return NextResponse.json(
          { error: `Cannot mark delivered from state: ${escrow.state}` },
          { status: 400 }
        );
      }

      escrow.state = "item_delivered";
      escrow.itemDeliveredAt = new Date();
      escrow.itemDeliveredBy = userId as any;
      await escrow.save();

      // Send notification
      void notifyItemDelivered(escrow);

      return NextResponse.json({ success: true, escrow, message: "Item marked as delivered." });
    }

    if (!isOwner && !isFinder && !isAdmin) {
      return NextResponse.json({ error: "Not allowed for this escrow." }, { status: 403 });
    }

    // Layer 2: Owner confirms item received
    if (action === "confirm_item_received") {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Only owner/admin can confirm item received." }, { status: 403 });
      }

      if (!escrow.ownerItemReceived) {
        escrow.ownerItemReceived = true;
        escrow.ownerItemReceivedAt = new Date();
        
        // Transition state if needed
        if (escrow.state === "item_delivered") {
          escrow.state = "awaiting_confirmation";
        }
        
        // Set auto-release timer
        setAutoReleaseTimer(escrow);
        
        await escrow.save();
        
        // Send notification
        void notifyItemReceived(escrow);
      }
      
      return NextResponse.json({ 
        success: true, 
        escrow,
        autoReleaseAt: escrow.autoReleaseAt,
        message: "Item receipt confirmed. Auto-release scheduled." 
      });
    }

    // Layer 2: Finder confirms fund receipt (optional)
    if (action === "confirm_fund_received") {
      if (!isFinder && !isAdmin) {
        return NextResponse.json({ error: "Only finder/admin can confirm fund received." }, { status: 403 });
      }
      
      if (!escrow.finderFundReceived) {
        escrow.finderFundReceived = true;
        escrow.finderFundReceivedAt = new Date();
        await escrow.save();
      }
      
      return NextResponse.json({ success: true, escrow });
    }

    // Layer 3: Multi-sig release approval (2-of-3)
    if (action === "approve_release") {
      const now = new Date();
      
      if (isOwner && !escrow.ownerReleaseApproved) {
        escrow.ownerReleaseApproved = true;
        escrow.ownerReleaseApprovedAt = now;
      }
      if (isFinder && !escrow.finderReleaseApproved) {
        escrow.finderReleaseApproved = true;
        escrow.finderReleaseApprovedAt = now;
      }
      if (isAdmin && !escrow.adminReleaseApproved) {
        escrow.adminReleaseApproved = true;
        escrow.adminReleaseApprovedAt = now;
      }

      await escrow.save();

      const releaseVotes = countReleaseApprovals(escrow);
      
      // Send notification for approval
      void notifyReleaseApproved(escrow, releaseVotes);
      
      // Release immediately if both owner AND finder approved (mutual agreement = instant release)
      // OR if 2-of-3 any combination with owner confirmed receipt
      const bothPartiesAgreed = escrow.ownerReleaseApproved && escrow.finderReleaseApproved;
      const multiSigReady = escrow.ownerItemReceived && releaseVotes >= 2;

      if ((bothPartiesAgreed || multiSigReady) && escrow.state !== "released") {
        const txHash = await executeEscrowRelease(escrow, releaseTxHash);
        
        // Send release notification
        void notifyEscrowReleased(escrow, txHash);
        
        return NextResponse.json({
          success: true,
          released: true,
          txHash,
          message: "Escrow released — both parties approved.",
        });
      }

      return NextResponse.json({
        success: true,
        escrow,
        releaseVotes,
        releaseReady: bothPartiesAgreed || multiSigReady,
      });
    }

    // Layer 3: Trigger auto-release after time-lock
    if (action === "trigger_auto_release") {
      if (!escrow.ownerItemReceived) {
        return NextResponse.json({ error: "Owner must confirm receipt first." }, { status: 400 });
      }
      
      if (!escrow.autoReleaseAt || Date.now() < escrow.autoReleaseAt.getTime()) {
        return NextResponse.json({ 
          error: "Auto-release time not reached yet.",
          autoReleaseAt: escrow.autoReleaseAt 
        }, { status: 400 });
      }
      
      if (escrow.autoReleaseTriggered) {
        return NextResponse.json({ error: "Auto-release already triggered." }, { status: 400 });
      }

      escrow.autoReleaseTriggered = true;
      await escrow.save();

      const txHash = await executeEscrowRelease(escrow);
      
      // Send release notification
      void notifyEscrowReleased(escrow, txHash);
      
      return NextResponse.json({
        success: true,
        released: true,
        txHash,
        message: "Escrow auto-released after time-lock.",
      });
    }

    // Layer 3: Raise dispute
    if (action === "raise_dispute") {
      if (!isOwner && !isFinder && !isAdmin) {
        return NextResponse.json({ error: "Only owner, finder, or admin can raise dispute." }, { status: 403 });
      }

      if (!canTransition(escrow.state, "disputed")) {
        return NextResponse.json(
          { error: `Cannot raise dispute from state: ${escrow.state}` },
          { status: 400 }
        );
      }

      escrow.state = "disputed";
      escrow.disputeReason = String(disputeReason || "").trim() || "Dispute raised";
      escrow.disputeRaisedBy = userId as any;
      escrow.disputeRaisedAt = new Date();
      await escrow.save();
      
      // Send notification
      void notifyDisputeRaised(escrow);
      
      return NextResponse.json({ 
        success: true, 
        escrow, 
        message: "Dispute raised. Admin intervention required." 
      });
    }

    // Layer 3: Resolve dispute with refund to owner
    if (action === "resolve_dispute_refund") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Only admin can resolve dispute with refund." }, { status: 403 });
      }

      const amount = Number(escrow.amountEth || 0);
      if (amount > 0) {
        // Refund back to owner's off-chain balance
        await User.updateOne({ _id: escrow.ownerId }, { $inc: { offchainBalance: amount } });

        // Record the refund transaction
        await WalletTransaction.create({
          fromUserId: userId as any, // Admin/System
          toUserId: escrow.ownerId,
          itemId: item._id,
          contactRequestId: escrow.contactRequestId || undefined,
          paymentMethod: "offchain",
          fromAddress: "escrow_lock",
          toAddress: "internal",
          amountEth: amount,
          txHash: "refund_" + Date.now().toString(16),
          network: "offchain",
          status: "completed",
        });
      }
      
      escrow.state = "refunded";
      escrow.disputeResolution = "refund_to_owner";
      escrow.disputeResolvedAt = new Date();
      escrow.refundTxHash = refundTxHash || undefined;
      escrow.refundedAt = new Date();
      await escrow.save();
      
      // Send notification
      void notifyEscrowRefunded(escrow, refundTxHash);
      void notifyDisputeResolved(escrow, "refund_to_owner", refundTxHash);
      
      return NextResponse.json({ 
        success: true, 
        escrow, 
        message: "Dispute resolved: Funds refunded to owner." 
      });
    }

    // Layer 3: Resolve dispute with release to finder
    if (action === "resolve_dispute_release") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Only admin can resolve dispute with release." }, { status: 403 });
      }
      
      escrow.adminReleaseApproved = true;
      escrow.adminReleaseApprovedAt = new Date();
      escrow.disputeResolution = "release_to_finder";
      escrow.disputeResolvedAt = new Date();
      
      if (!escrow.ownerItemReceived) {
        escrow.ownerItemReceived = true;
        escrow.ownerItemReceivedAt = new Date();
      }
      
      await escrow.save();
      
      const txHash = await executeEscrowRelease(escrow);
      
      // Send notification
      void notifyEscrowReleased(escrow, txHash);
      void notifyDisputeResolved(escrow, "release_to_finder", txHash);
      
      return NextResponse.json({ 
        success: true, 
        released: true, 
        txHash, 
        message: "Dispute resolved: Funds released to finder." 
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("Escrow action error:", error);
    return NextResponse.json(
      { error: "Escrow action failed", details: (error as Error).message },
      { status: 500 }
    );
  }
}
