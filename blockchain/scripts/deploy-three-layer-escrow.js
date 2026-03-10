/**
 * Three-Layer Escrow Contract Deployment Script
 * 
 * This script deploys the updated LostAndFound contract with:
 * - Three-layer escrow system (Funding, Verification, Resolution)
 * - Time-lock auto-release mechanism
 * - Multi-sig release (2-of-3 approvals required)
 * - Dispute resolution system
 * - Admin role management
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("========================================");
  console.log("Deploying Three-Layer Escrow Contract");
  console.log("========================================\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy the contract
  console.log("Deploying LostAndFound contract...");
  const LostAndFound = await hre.ethers.getContractFactory("LostAndFound");
  const lostAndFound = await LostAndFound.deploy();

  await lostAndFound.waitForDeployment();

  const address = await lostAndFound.getAddress();
  const deployTx = lostAndFound.deploymentTransaction();
  
  console.log("\n✅ Contract deployed successfully!");
  console.log("Contract address:", address);
  console.log("Deployer (Admin):", deployer.address);
  console.log("Transaction hash:", deployTx?.hash);

  // Get network info
  const network = await hre.ethers.provider.getNetwork();
  console.log("Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");

  // Verify the admin was set correctly
  const adminAddress = await lostAndFound.admin();
  console.log("\n📋 Contract Configuration:");
  console.log("  Admin:", adminAddress);
  console.log("  Auto-release delay:", await lostAndFound.AUTO_RELEASE_DELAY(), "seconds (7 days)");
  console.log("  Dispute resolution delay:", await lostAndFound.DISPUTE_RESOLUTION_DELAY(), "seconds (14 days)");

  // Save the contract data
  const artifact = await hre.artifacts.readArtifact("LostAndFound");
  const contractData = {
    address: address,
    abi: artifact.abi,
    deployer: deployer.address,
    admin: adminAddress,
    network: {
      name: network.name,
      chainId: network.chainId.toString(),
    },
    deployment: {
      timestamp: new Date().toISOString(),
      transactionHash: deployTx?.hash,
      blockNumber: deployTx?.blockNumber,
    },
    features: [
      "Three-layer escrow system",
      "Time-lock auto-release (7 days)",
      "Multi-sig release (2-of-3 approvals)",
      "Dispute resolution system",
      "Admin role management",
    ],
  };

  // Save to contract_data.json (main file used by the app)
  const outputPath = path.join(__dirname, "../../contract_data.json");
  fs.writeFileSync(outputPath, JSON.stringify(contractData, null, 2));
  console.log("\n💾 Contract data saved to:", outputPath);

  // Also save a backup with timestamp
  const backupPath = path.join(__dirname, `../../contract_data_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(contractData, null, 2));
  console.log("💾 Backup saved to:", backupPath);

  // Print usage instructions
  console.log("\n========================================");
  console.log("Next Steps:");
  console.log("========================================");
  console.log("1. Update your .env.local with the new contract address:");
  console.log(`   CONTRACT_ADDRESS=${address}`);
  console.log("\n2. Update your lib/blockchain.ts with the new ABI");
  console.log("\n3. Test the three-layer escrow flow:");
  console.log("   - Layer 1: Register item with reward → Assign finder");
  console.log("   - Layer 2: Initiate delivery → Mark delivered → Confirm receipt");
  console.log("   - Layer 3: Multi-sig approvals (2-of-3) → Release funds");
  console.log("\n4. Admin functions available:");
  console.log("   - resolveDisputeRelease(itemId) - Release to finder");
  console.log("   - resolveDisputeRefund(itemId) - Refund to owner");
  console.log("   - transferAdmin(newAdmin) - Transfer admin role");
  console.log("\n========================================");

  // Verify on Etherscan if not on localhost
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n🔍 Waiting for block confirmations before verification...");
    await lostAndFound.deploymentTransaction()?.wait(5);
    
    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [],
      });
      console.log("✅ Contract verified on Etherscan!");
    } catch (error) {
      console.log("⚠️ Verification failed:", error.message);
      console.log("You can verify manually on Etherscan.");
    }
  }
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
