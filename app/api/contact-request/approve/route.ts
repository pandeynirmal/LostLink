import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import ContactRequest from "@/lib/models/ContactRequest";
import Conversation from "@/lib/models/Conversation";
import { anchorClaimDecision } from "@/lib/blockchain";
import SystemConfig from "@/lib/models/SystemConfig";
import Item from "@/lib/models/Item";
import EscrowCase from "@/lib/models/EscrowCase";
import User from "@/lib/models/User";
import WalletTransaction from "@/lib/models/WalletTransaction";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

function isValidTxHash(hash: string | unknown): boolean {
  return typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash);
}

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;

  return decoded.userId;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId, action = "verify_claim" } = await request.json();
    if (!requestId) {
      return NextResponse.json({ error: "Request ID is required" }, { status: 400 });
    }

    if (!["verify_claim", "chat_only"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await connectDB();

    const contactRequest = await ContactRequest.findById(requestId);
    if (!contactRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (contactRequest.ownerId.toString() !== userId) {
      return NextResponse.json(
        { error: "You are not authorized to approve this request" },
        { status: 403 }
      );
    }

    const ensureConversation = async () => {
      let conversation = await Conversation.findOne({
        itemId: contactRequest.itemId,
        participants: {
          $all: [contactRequest.ownerId, contactRequest.requesterId],
        },
      });

      if (conversation) {
        conversation.deletedFor = [];
        await conversation.save();
      } else {
        conversation = await Conversation.create({
          itemId: contactRequest.itemId,
          participants: [contactRequest.ownerId, contactRequest.requesterId],
          deletedFor: [],
        });
      }
      return conversation;
    };

    if (action === "chat_only") {
      const conversation = await ensureConversation();
      return NextResponse.json({
        success: true,
        message: "Chat permission granted. Conversation ready.",
        conversationId: conversation._id,
      });
    }

    if (contactRequest.status !== "pending") {
      return NextResponse.json(
        { error: "This request is already processed" },
        { status: 400 }
      );
    }

    contactRequest.status = "approved";
    if (!contactRequest.adminStatus) {
      contactRequest.adminStatus = "pending";
    }

    const normalizeScore = (score: unknown): number => {
      if (typeof score !== "number" || !Number.isFinite(score)) return 0;
      return score <= 1 ? score * 100 : score;
    };

    // Backfill AI score if older requests stored 0/empty.
    let aiScore = Number(contactRequest.aiMatchScore || 0);
    if (!Number.isFinite(aiScore) || aiScore <= 0) {
      const linkedItem = await Item.findById(contactRequest.itemId)
        .select("matchScore matchedItemId");
      aiScore = normalizeScore(linkedItem?.matchScore);

      if (aiScore <= 0) {
        const counterpart = await Item.findOne({ matchedItemId: contactRequest.itemId })
          .sort({ matchScore: -1 })
          .select("matchScore");
        aiScore = normalizeScore(counterpart?.matchScore);
      }

      contactRequest.aiMatchScore = aiScore;
    }

    const thresholdConfig = await SystemConfig.findOne({
      key: "auto_admin_approve_match_score",
    });
    const autoApproveThreshold = Number(
      thresholdConfig?.valueNumber ??
        Number(process.env.AUTO_ADMIN_APPROVE_MATCH_SCORE || "90")
    );
    const canAutoApprove = Number.isFinite(autoApproveThreshold) && aiScore >= autoApproveThreshold;

    if (canAutoApprove) {
      const autoApprovalNote = `Auto-approved by AI threshold (${aiScore.toFixed(2)} >= ${autoApproveThreshold}).`;

      const anchor = await anchorClaimDecision({
        contactRequestId: contactRequest._id.toString(),
        itemId: contactRequest.itemId.toString(),
        ownerId: contactRequest.ownerId.toString(),
        requesterId: contactRequest.requesterId.toString(),
        aiMatchScore: aiScore,
        adminId: "system-auto",
        decision: "approved",
        notes: autoApprovalNote,
      });

      if (anchor?.txHash && isValidTxHash(anchor.txHash)) {
        contactRequest.adminStatus = "approved";
        contactRequest.adminReviewedAt = new Date();
        contactRequest.adminReviewNotes = autoApprovalNote;
        contactRequest.adminDecisionTxHash = anchor.txHash;
      } else {
        contactRequest.adminStatus = "pending";
        contactRequest.adminReviewNotes =
          "Auto-approval skipped because blockchain anchoring failed. Requires manual admin review.";
      }
    }

    await contactRequest.save();

    // Auto-create and assign escrow when claim is approved (if reward amount > 0)
    try {
      const linkedItem = await Item.findById(contactRequest.itemId).select("rewardAmount userId description rewardPaymentMethod");
      const rewardAmt = Number(linkedItem?.rewardAmount || 0);
      const isOffchain = linkedItem?.rewardPaymentMethod !== "onchain";

      if (rewardAmt > 0) {
        // Check if active escrow already exists
        const existingEscrow = await EscrowCase.findOne({
          itemId: contactRequest.itemId,
          state: { $nin: ["released", "refunded"] },
        });

        if (!existingEscrow) {
          if (isOffchain) {
            // Check owner has enough off-chain balance to freeze the reward
            const owner = await User.findById(contactRequest.ownerId);
            if (!owner) throw new Error("Owner not found for escrow creation.");

            const ownerBalance = Number(owner.offchainBalance || 0);
            if (ownerBalance < rewardAmt) {
              return NextResponse.json(
                { error: `Insufficient wallet balance. You have ${ownerBalance.toFixed(4)} ETH but the item reward is ${rewardAmt} ETH. Please load funds in your wallet before approving.` },
                { status: 400 }
              );
            }

            // Deduct from owner's balance (funds are now "locked" in escrow)
            await User.updateOne({ _id: owner._id }, { $inc: { offchainBalance: -rewardAmt } });

            // Record the freeze transaction
            await WalletTransaction.create({
              fromUserId: owner._id,
              toUserId: owner._id, // Locked to self (effectively escrow)
              itemId: contactRequest.itemId,
              contactRequestId: contactRequest._id,
              paymentMethod: "offchain",
              fromAddress: "internal",
              toAddress: "escrow_lock",
              amountEth: rewardAmt,
              txHash: "freeze_" + Date.now().toString(16),
              network: "offchain",
              status: "completed",
            });
          }

          // Create escrow and immediately assign the finder
          await EscrowCase.create({
            itemId: contactRequest.itemId,
            ownerId: contactRequest.ownerId,
            finderId: contactRequest.requesterId,
            contactRequestId: contactRequest._id,
            amountEth: rewardAmt,
            state: isOffchain ? "claim_assigned" : "funded", // if onchain, it stays 'funded' but requires a real tx
            holdSource: isOffchain ? "project_wallet" : "external_escrow",
            paymentMethod: isOffchain ? "offchain" : "onchain",
            ownerItemReceived: false,
            finderFundReceived: false,
            ownerReleaseApproved: false,
            finderReleaseApproved: false,
            adminReleaseApproved: false,
            autoReleaseTriggered: false,
          });
        } else if (!existingEscrow.finderId) {
          // Escrow exists but no finder — assign now
          existingEscrow.finderId = contactRequest.requesterId;
          existingEscrow.contactRequestId = contactRequest._id;
          existingEscrow.state = "claim_assigned";
          await existingEscrow.save();
        }
      }
    } catch (escrowErr) {
      console.error("Auto-escrow creation error:", escrowErr);
      // If it's our manual balance error, re-throw it to be returned to user
      if ((escrowErr as any).status === 400) throw escrowErr;
    }

    return NextResponse.json({
      success: true,
      message: "Claim verified. Auto-transfer permission is enabled.",
    });
  } catch (error) {
    console.error("Approval Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
