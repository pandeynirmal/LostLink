import mongoose from 'mongoose'
import EscrowCase from '@/lib/models/EscrowCase'
import Item from '@/lib/models/Item'
import User from '@/lib/models/User'
import WalletTransaction from '@/lib/models/WalletTransaction'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blockchain_lost_found'

async function executeEscrowRelease(escrow: any) {
  const freshEscrow = await EscrowCase.findById(escrow._id);
  if (!freshEscrow) throw new Error("Escrow not found.");
  
  if (freshEscrow.state === "released" || freshEscrow.finderFundReceived) {
    return freshEscrow.releaseTxHash || "already_completed";
  }

  const item = await Item.findById(freshEscrow.itemId);
  const finder = await User.findById(freshEscrow.finderId);

  const amount = Number(freshEscrow.amountEth || item?.rewardAmount || 0);
  const pseudoTxHash = "offchain_" + Date.now().toString(16);

  if (item && !item.isClaimed && item.status !== "resolved" && !freshEscrow.finderFundReceived) {
    if (finder) {
        await User.updateOne({ _id: finder._id }, { $inc: { offchainBalance: amount } });

        await WalletTransaction.create({
          fromUserId: freshEscrow.ownerId,
          toUserId: finder._id,
          itemId: item._id,
          contactRequestId: freshEscrow.contactRequestId || undefined,
          paymentMethod: "onchain", 
          fromAddress: "internal",
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
  freshEscrow.releaseTxHash = freshEscrow.releaseTxHash || pseudoTxHash;
  freshEscrow.releasedAt = new Date();
  freshEscrow.finderFundReceived = true;
  await freshEscrow.save();

  return freshEscrow.releaseTxHash;
}

async function main() {
  await mongoose.connect(MONGODB_URI)
  const activeEscrows = await EscrowCase.find({ state: { $nin: ['released', 'refunded'] } })
  
  let fixed = 0;
  for (const escrow of activeEscrows) {
      const votes = (escrow.ownerReleaseApproved ? 1 : 0) + (escrow.finderReleaseApproved ? 1 : 0) + (escrow.adminReleaseApproved ? 1 : 0);
      const bothPartiesAgreed = escrow.ownerReleaseApproved && escrow.finderReleaseApproved;
      const multiSigReady = escrow.ownerItemReceived && votes >= 2;

      if (bothPartiesAgreed || multiSigReady) {
          console.log(`Releasing escrow ${escrow._id} with ${votes} votes`);
          await executeEscrowRelease(escrow);
          fixed++;
      }
  }
  console.log(`Fixed ${fixed}`);
  process.exit(0);
}
main();
