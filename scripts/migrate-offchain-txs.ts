import mongoose from 'mongoose'
import WalletTransaction from '@/lib/models/WalletTransaction'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blockchain_lost_found'

async function main() {
  await mongoose.connect(MONGODB_URI)
  
  // Find transactions that are marked onchain but have the pseudo "offchain_" txHash 
  const result = await WalletTransaction.updateMany(
    { 
      paymentMethod: "onchain", 
      txHash: { $regex: /^offchain_/ } 
    },
    { 
      $set: { paymentMethod: "offchain" } 
    }
  );

  console.log(`Migrated ${result.modifiedCount} old pseudo-transactions to 'offchain' paymentMethod`);
  process.exit(0);
}
main();
