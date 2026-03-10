import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import {
  getBlockchainRpcUrl,
  isLocalRpcConfigured,
  resolveReadableNetworkName,
} from "@/lib/chain-config";

function resolveNetworkLabel(network: ethers.Network) {
  return resolveReadableNetworkName(network.name, network.chainId);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await context.params;

    // Validate transaction hash format
    if (!hash) {
      return NextResponse.json(
        { error: "Transaction hash is required", found: false },
        { status: 400 }
      );
    }

    // Check if it's a valid hash format (must start with 0x and be 66 chars total)
    if (!hash.startsWith("0x")) {
      return NextResponse.json(
        {
          error: "Invalid transaction hash format. Hash must start with '0x'",
          found: false,
          hint: "This might indicate a corrupted or incomplete transaction hash",
        },
        { status: 400 }
      );
    }

    if (hash.length !== 66) {
      return NextResponse.json(
        {
          error: "Invalid transaction hash length. Must be 66 characters (including 0x)",
          found: false,
          actualLength: hash.length,
        },
        { status: 400 }
      );
    }

    const provider = new ethers.JsonRpcProvider(
      getBlockchainRpcUrl()
    );
    const rpcUrl = getBlockchainRpcUrl();

    const [tx, receipt, network] = await Promise.all([
      provider.getTransaction(hash),
      provider.getTransactionReceipt(hash),
      provider.getNetwork(),
    ]);

    if (!tx && !receipt) {
      return NextResponse.json(
        { 
          found: false, 
          message: "Transaction not found on current RPC",
          hash: hash,
          rpcUrl,
          network: resolveNetworkLabel(network),
          chainId: network.chainId.toString(),
          hint: isLocalRpcConfigured()
            ? "Local Hardhat chain was likely reset. For permanent verification, deploy and verify on a persistent testnet/mainnet RPC."
            : "This hash may belong to a different chain than your configured BLOCKCHAIN_RPC_URL."
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        found: true,
        network: resolveNetworkLabel(network),
        chainId: network.chainId.toString(),
        rpcUrl,
        tx: tx
          ? {
              hash: tx.hash,
              from: tx.from,
              to: tx.to,
              valueWei: tx.value.toString(),
              blockNumber: tx.blockNumber,
            }
          : null,
        receipt: receipt
          ? {
              status: receipt.status,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
            }
          : null,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch transaction",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
