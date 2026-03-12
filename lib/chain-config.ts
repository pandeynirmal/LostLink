const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8545";

/**
 * Returns the RPC URL used by the blockchain provider.
 * Priority:
 * 1. BLOCKCHAIN_RPC_URL
 * 2. Local Hardhat RPC
 */
export function getBlockchainRpcUrl() {
  const rpc = process.env.BLOCKCHAIN_RPC_URL;

  if (!rpc) {
    console.warn("BLOCKCHAIN_RPC_URL not set. Falling back to local Hardhat RPC.");
    return DEFAULT_LOCAL_RPC_URL;
  }

  return rpc;
}

/**
 * Detects if the project is using a local Hardhat RPC.
 */
export function isLocalRpcConfigured() {
  const rpc = getBlockchainRpcUrl().toLowerCase();

  return (
    rpc.includes("127.0.0.1:8545") ||
    rpc.includes("localhost:8545") ||
    rpc.includes("0.0.0.0:8545")
  );
}

/**
 * Converts raw network info into a readable network name.
 */
export function resolveReadableNetworkName(
  networkName: string | undefined,
  chainId: bigint | number | string
) {
  const chain = Number(chainId);

  if (networkName && networkName !== "unknown") {
    return networkName.toLowerCase();
  }

  switch (chain) {
    case 31337:
      return "hardhat-local";
    case 11155111:
      return "sepolia";
    case 1:
      return "mainnet";
    case 5:
      return "goerli";
    default:
      return `chain-${chain}`;
  }
}

/**
 * Generates a block explorer URL for a given transaction.
 */
export function getExplorerTxUrl(
  network: string | undefined,
  txHash: string
) {
  if (!txHash || !txHash.startsWith("0x")) {
    return "";
  }

  const override = process.env.BLOCKCHAIN_EXPLORER_TX_BASE_URL;

  if (override) {
    return `${override.replace(/\/$/, "")}/${txHash}`;
  }

  const lower = (network || "").toLowerCase();

  if (lower.includes("sepolia")) {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  if (lower.includes("mainnet") || lower === "homestead") {
    return `https://etherscan.io/tx/${txHash}`;
  }

  if (lower.includes("hardhat")) {
    return "";
  }

  return "";
}