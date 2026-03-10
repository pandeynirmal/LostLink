#!/usr/bin/env npx ts-node

/**
 * Database Cleanup Script - Fix Corrupted Transaction Hashes
 * 
 * This script finds and reports corrupted transaction hashes in the database
 * and provides recovery options.
 * 
 * Usage: npx ts-node scripts/fix-corrupted-tx-hashes.ts [--fix]
 */

import mongoose from 'mongoose'
import WalletTransaction from '@/lib/models/WalletTransaction'
import ContactRequest from '@/lib/models/ContactRequest'
import Item from '@/lib/models/Item'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blockchain_lost_found'

// Validate transaction hash format
function isValidTxHash(hash: string | null | undefined): boolean {
  if (!hash || typeof hash !== 'string') return false
  return /^0x[a-fA-F0-9]{64}$/.test(hash)
}

async function main() {
  try {
    console.log(' Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log(' Connected to MongoDB\n')

    // Check WalletTransaction collection
    console.log(' Checking WalletTransaction collection...')
    const walletTxs = await WalletTransaction.find({})
    
    const corruptedWalletTxs = walletTxs.filter(tx => {
      const hasBadTxHash = tx.txHash && !isValidTxHash(tx.txHash)
      const hasBadAnchorHash = tx.anchorTxHash && !isValidTxHash(tx.anchorTxHash)
      const hasBadSettlementHash = tx.settlementProofTxHash && !isValidTxHash(tx.settlementProofTxHash)
      return hasBadTxHash || hasBadAnchorHash || hasBadSettlementHash
    })

    console.log(`Total WalletTransaction records: ${walletTxs.length}`)
    console.log(`Corrupted records: ${corruptedWalletTxs.length}\n`)

    if (corruptedWalletTxs.length > 0) {
      console.log(' Corrupted WalletTransaction records found:')
      corruptedWalletTxs.forEach((tx, idx) => {
        console.log(`\n  [${idx + 1}] ID: ${tx._id}`)
        if (tx.txHash && !isValidTxHash(tx.txHash)) {
          console.log(`       txHash: "${tx.txHash}" (${tx.txHash.length} chars, should be 66)`)
          console.log(`         Type: ${typeof tx.txHash}`)
        }
        if (tx.anchorTxHash && !isValidTxHash(tx.anchorTxHash)) {
          console.log(`       anchorTxHash: "${tx.anchorTxHash}" (${tx.anchorTxHash.length} chars)`)
        }
        if (tx.settlementProofTxHash && !isValidTxHash(tx.settlementProofTxHash)) {
          console.log(`       settlementProofTxHash: "${tx.settlementProofTxHash}" (${tx.settlementProofTxHash.length} chars)`)
        }
        console.log(`      Payment Method: ${tx.paymentMethod}`)
        console.log(`      Status: ${tx.status}`)
        console.log(`      Amount: ${tx.amountEth} ETH`)
        console.log(`      Created: ${tx.createdAt}`)
      })

      // If --fix flag is present, attempt cleanup
      if (process.argv.includes('--fix')) {
        console.log('\n\n  Attempting to fix corrupted records...')
        let fixed = 0
        for (const tx of corruptedWalletTxs) {
          try {
            // Remove invalid hashes
            if (tx.txHash && !isValidTxHash(tx.txHash)) {
              await WalletTransaction.updateOne(
                { _id: tx._id },
                { txHash: `[CORRUPTED: ${tx.txHash}]` }
              )
              fixed++
            }
            if (tx.anchorTxHash && !isValidTxHash(tx.anchorTxHash)) {
              await WalletTransaction.updateOne(
                { _id: tx._id },
                { anchorTxHash: `[CORRUPTED: ${tx.anchorTxHash}]` }
              )
            }
            if (tx.settlementProofTxHash && !isValidTxHash(tx.settlementProofTxHash)) {
              await WalletTransaction.updateOne(
                { _id: tx._id },
                { settlementProofTxHash: `[CORRUPTED: ${tx.settlementProofTxHash}]` }
              )
            }
          } catch (err) {
            console.error(`Failed to fix record ${tx._id}:`, err)
          }
        }
        console.log(` Marked ${fixed} corrupted hashes for manual review`)
      } else {
        console.log('\n To fix corrupted records, run: npx ts-node scripts/fix-corrupted-tx-hashes.ts --fix')
      }
    }

    // Check ContactRequest collection
    console.log('\n\n Checking ContactRequest collection...')
    const contactRequests = await ContactRequest.find({})
    
    const corruptedContactRequests = contactRequests.filter((req: any) => {
      return req.adminDecisionTxHash && !isValidTxHash(req.adminDecisionTxHash)
    })

    console.log(`Total ContactRequest records: ${contactRequests.length}`)
    console.log(`Corrupted records: ${corruptedContactRequests.length}\n`)

    if (corruptedContactRequests.length > 0) {
      console.log(' Corrupted ContactRequest records found:')
      corruptedContactRequests.forEach((req: any, idx) => {
        console.log(`\n  [${idx + 1}] ID: ${req._id}`)
        console.log(`       adminDecisionTxHash: "${req.adminDecisionTxHash}" (${req.adminDecisionTxHash?.length} chars)`)
        console.log(`      Status: ${req.status}`)
        console.log(`      Admin Status: ${req.adminStatus}`)
        console.log(`      Created: ${req.createdAt}`)
      })
    }

    // Check Item collection
    console.log('\n\n Checking Item collection...')
    const items = await Item.find({ blockchain: { $exists: true } })
    
    const corruptedItems = items.filter((item: any) => {
      return item.blockchain?.txHash && !isValidTxHash(item.blockchain.txHash)
    })

    console.log(`Total Item records with blockchain data: ${items.length}`)
    console.log(`Corrupted records: ${corruptedItems.length}\n`)

    if (corruptedItems.length > 0) {
      console.log(' Corrupted Item records found:')
      corruptedItems.forEach((item: any, idx) => {
        console.log(`\n  [${idx + 1}] ID: ${item._id}`)
        console.log(`       blockchain.txHash: "${item.blockchain.txHash}" (${item.blockchain.txHash?.length} chars)`)
        console.log(`      Type: ${item.type}`)
        console.log(`      Created: ${item.createdAt}`)
      })
    }

    // Summary
    const totalCorrupted = corruptedWalletTxs.length + corruptedContactRequests.length + corruptedItems.length
    console.log(`\n${'='.repeat(60)}`)
    console.log(`SUMMARY: ${totalCorrupted} corrupted records found`)
    console.log(`${'='.repeat(60)}`)

    if (totalCorrupted === 0) {
      console.log('\n No corrupted transaction hashes found!')
    } else {
      console.log('\n  ACTION REQUIRED:')
      console.log('   - These records have invalid transaction hashes')
      console.log('   - Users will see "Invalid format" warnings when viewing them')
      console.log('   - To mark them for review, run: npx ts-node scripts/fix-corrupted-tx-hashes.ts --fix')
      console.log('   - These hashes likely come from blockchain function failures')
      console.log('   - Check the server logs for detailed error messages')
    }

  } catch (error) {
    console.error(' Error:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\n Disconnected from MongoDB')
  }
}

main()

