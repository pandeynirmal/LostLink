# Transaction Hash Corruption - Troubleshooting Guide

## Problem Summary
Transaction hashes are being stored as corrupted values like `b`, `for the watch`, etc. instead of proper blockchain transaction hashes (format: `0x` followed by 64 hexadecimal characters).

## Root Causes
1. **Blockchain function failures** - `transferFunds()` or `verifyAndPay()` returning undefined/null
2. **Network connectivity issues** - Blockchain RPC timeout or failure
3. **Data validation gap** - No validation before storing to database
4. **Error handling** - Exceptions caught but incomplete data stored anyway

## How to Diagnose

### 1. Run the Database Diagnostic Endpoint
As an admin, visit:
```
GET /api/admin/diagnostics/tx-hashes
```

This shows:
- All recent transactions with hash validity status
- Which ones have corrupted hashes
- Detailed information about each corrupted hash

### 2. Run the Cleanup Script
```bash
# Just scan for corrupted records
npx ts-node scripts/fix-corrupted-tx-hashes.ts

# Scan AND mark corrupted hashes for manual review
npx ts-node scripts/fix-corrupted-tx-hashes.ts --fix
```

### 3. Check Server Logs
Look for these error messages:
```
[ERROR] Invalid txHash from transferFunds:
[ERROR] Invalid transaction hash in blockchain response:
```

## How to Fix

### Fix 1: Ensure Blockchain is Running
```bash
# Terminal 1: Start Hardhat local blockchain
npm run blockchain

# Terminal 2: Deploy contracts
npm run deploy

# Terminal 3: Start your app
npm run dev
```

### Fix 2: Check Environment Variables
Verify in your `.env.local`:
```
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
MONGODB_URI=mongodb://localhost:27017/blockchain_lost_found
```

### Fix 3: Restart with Fresh Data
If you want a clean slate:
```bash
# Backup your data first!
# Then drop the database
mongo
> use blockchain_lost_found
> db.dropDatabase()
```

### Fix 4: Monitor for New Corruptions
- The system now validates all transaction hashes before storing
- If validation fails, the endpoint returns a 500 error instead of storing bad data
- Check server logs for `[ERROR]` messages with transaction details
- Invalid hashes in transactions show `( Invalid format)` badge in UI

## Code Changes Made

### 1. Enhanced Verification Endpoint
**File:** `app/api/verify/route.ts`
- Added `isValidTxHash()` validation function
- Validates hashes BEFORE storing to database
- Returns detailed error messages if validation fails
- Logs any errors for debugging

### 2. Transaction Hash Validation in Wallet Functions
**File:** `lib/wallet.ts`
- `transferFunds()` now validates returned hash
- Logs any invalid hash formats with details

### 3. Blockchain Function Validation
**File:** `lib/blockchain.ts`
- `buildBlockchainResponse()` now validates hash
- Logs corrupted hashes early for debugging

### 4. Wallet Panel UI Improvements
**File:** `components/wallet-panel.tsx`
- Shows `( Invalid format)` for bad hashes
- Disables "Verify" links for invalid hashes
- Displays warning message instead of broken link

### 5. Database Diagnostic Endpoint
**File:** `app/api/admin/diagnostics/tx-hashes/route.ts`
- Admin-only endpoint to inspect all transaction hashes
- Shows which ones are corrupted
- Provides insights and recommendations

### 6. Cleanup Script
**File:** `scripts/fix-corrupted-tx-hashes.ts`
- Scans all collections for corrupted hashes
- Can mark corrupted records for manual review with `--fix` flag
- Helps identify scope of the problem

## Expected Behavior After Fix

### During Transaction Creation (POST /api/verify)
-  Get proper `0x...` transaction hash from blockchain
-  **NEW:** Validate hash format before storing
-  If validation fails, return 500 error with details
-  Don't store corrupted data to database

### When Viewing Transactions (Wallet Panel)
-  Valid hashes show clickable "Verify on RPC" links
-  Invalid hashes show `( Invalid format)` warning
-  No clickable links for invalid hashes
-  Users see explanation that hash is corrupted/incomplete

### Admin Diagnostics
-  Can visit `/api/admin/diagnostics/tx-hashes` to see all problems
-  Can run `npm run cleanup-hashes` to scan database
-  Clear visibility into corruption scope and causes

## Prevention Going Forward

1. **Blockchain connectivity** - Ensure RPC is always running before transfers
2. **Error handling** - Never store partial/incomplete data
3. **Validation** - All transaction hashes validated before database storage
4. **Monitoring** - Server logs capture any hash validation failures
5. **UI feedback** - Users see clear warnings instead of broken links

## Contact & Support

If you still see corrupted hashes:
1. Check BLOCKCHAIN_RPC_URL is correct and running
2. Ensure Hardhat node has deployed contracts
3. Review server console for `[ERROR]` logs
4. Run the cleanup script to identify affected transactions
5. Check if the blockchain crashed mid-transaction

For blockchain issues:
- Restart Hardhat: `npm run blockchain`
- Redeploy contracts: `npm run deploy`
- Clear any stuck transactions: Check account nonce in logs

