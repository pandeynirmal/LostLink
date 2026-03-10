#!/usr/bin/env npx ts-node

/**
 * Escrow Reconciliation Script
 * 
 * This script finds active Escrow cases where the associated Item 
 * was already resolved off-escrow (via Verify & Pay), and marks them 
 * as released to fix desynced states.
 */

import mongoose from 'mongoose'
import EscrowCase from '@/lib/models/EscrowCase'
import Item from '@/lib/models/Item'
import User from '@/lib/models/User'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blockchain_lost_found'

async function main() {
  try {
    console.log(' Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log(' Connected to MongoDB\n')

    console.log(' Finding active escrows...')
    const activeEscrows = await EscrowCase.find({
      state: { $nin: ['released', 'refunded'] }
    })

    console.log(` Active Escrows found: ${activeEscrows.length}\n`)

    let fixedCount = 0;

    for (const escrow of activeEscrows) {
      const item = await Item.findById(escrow.itemId)
      if (item && item.status === 'resolved' && item.isClaimed) {
        console.log(` Fixing Escrow ${escrow._id} for resolved Item ${item._id}...`)
        
        escrow.state = 'released'
        escrow.releasedAt = new Date()
        escrow.releaseTxHash = item.rewardTxHash || 'resolved_off_escrow'
        escrow.finderFundReceived = true
        escrow.ownerItemReceived = true
        escrow.autoReleaseTriggered = true

        await escrow.save()

        // Also ensure the finder actually got their assigned status if they didn't
        if (!escrow.finderId && item.matchedItemId) {
            // we could try to find the finder
            const counterpart = await Item.findById(item.matchedItemId);
            if (counterpart) {
                escrow.finderId = counterpart.userId as any;
                await escrow.save();
            }
        }
        
        fixedCount++;
      }
    }

    console.log(`\n Successfully reconciled ${fixedCount} escrows.\n`)
  } catch (error) {
    console.error(' Error:', error)
  } finally {
    await mongoose.disconnect()
    console.log(' Disconnected from MongoDB')
  }
}

main()
