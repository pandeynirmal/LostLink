const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8545";

export function getBlockchainRpcUrl() {
  return process.env.BLOCKCHAIN_RPC_URL || DEFAULT_LOCAL_RPC_URL;
}

export function isLocalRpcConfigured() {
  const rpc = getBlockchainRpcUrl().toLowerCase();
  return (
    rpc.includes("127.0.0.1:8545") ||
    rpc.includes("localhost:8545") ||
    rpc.includes("0.0.0.0:8545")
  );
}

export function resolveReadableNetworkName(
  networkName: string | undefined,
  chainId: bigint | number | string
) {
  const chain = Number(chainId);
  if (networkName && networkName !== "unknown") return networkName;
  if (chain === 31337) return "Hardhat Local Network";
  if (chain === 11155111) return "sepolia";
  if (chain === 1) return "mainnet";
  return `chain-${String(chainId)}`;
}

export function getExplorerTxUrl(
  network: string | undefined,
  txHash: string
) {
  if (!txHash || !txHash.startsWith("0x")) return "";

  const override = process.env.BLOCKCHAIN_EXPLORER_TX_BASE_URL;
  if (override) {
    return `${override.replace(/\/$/, "")}/${txHash}`;
  }

  const lower = (network || "").toLowerCase();
  if (lower.includes("sepolia")) return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (lower.includes("mainnet") || lower === "homestead") {
    return `https://etherscan.io/tx/${txHash}`;
  }
  return "";
}

