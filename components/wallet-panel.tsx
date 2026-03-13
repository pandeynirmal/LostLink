"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function isValidTxHash(hash: string | null | undefined): boolean {
  if (!hash || typeof hash !== "string") return false;
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function etherscanUrl(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

type WalletData = {
  address: string;
  balanceEth: string;
  offchainBalance: number;
  reputation: number;
  network: string;
  verificationMode?: "local-temporary" | "persistent";
};

type WalletTx = {
  id: string;
  txHash: string;
  paymentMethod: "onchain" | "razorpay" | "metamask" | "offchain";
  anchorTxHash?: string;
  settlementProofTxHash?: string;
  txAvailableOnCurrentRpc?: boolean;
  anchorTxAvailableOnCurrentRpc?: boolean;
  settlementProofTxAvailableOnCurrentRpc?: boolean;
  amountEth: number;
  status: string;
  network: string;
  explorerTxUrl?: string;
  anchorExplorerTxUrl?: string;
  settlementProofExplorerTxUrl?: string;
  createdAt: string;
  itemDescription: string;
  direction: "sent" | "received";
  from: { fullName: string; email: string; address: string };
  to: { fullName: string; email: string; address: string };
};

type WalletSummary = {
  totalSentEth: number;
  totalReceivedEth: number;
  netEth: number;
  onchainSentEth: number;
  onchainReceivedEth: number;
  onchainNetEth: number;
  offchainSentEth: number;
  offchainReceivedEth: number;
  offchainNetEth: number;
};

declare global {
  interface Window {
    ethereum?: any;
    Razorpay?: any;
  }
}

export function WalletPanel() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metaMaskAddress, setMetaMaskAddress] = useState("");
  const [metaMaskNetwork, setMetaMaskNetwork] = useState("");
  const [metaMaskBalance, setMetaMaskBalance] = useState("");
  const [metaMaskError, setMetaMaskError] = useState("");
  const [fundAmount, setFundAmount] = useState("0.5");
  const [topupInr, setTopupInr] = useState("100");
  const [funding, setFunding] = useState(false);
  const [fundMessage, setFundMessage] = useState("");
  const [fundingViaMetaMask, setFundingViaMetaMask] = useState(false);
  const [toppingUpRazorpay, setToppingUpRazorpay] = useState(false);
  const [hasMetaMask, setHasMetaMask] = useState(false);

  const fetchWallet = async () => {
    try {
      const response = await fetch("/api/wallet", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to load wallet");
        return;
      }
      setWallet(data.wallet);
      setSummary(data.summary || null);
      setTransactions(data.transactions || []);
      setError("");
    } catch {
      setError("Failed to load wallet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasMetaMask(Boolean(window.ethereum));
    void refreshMetaMaskState();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void fetchWallet();
      void refreshMetaMaskState();
    };
    const interval = setInterval(tick, 10000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
    };
  }, []);

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const handleAccountsChanged = async (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setMetaMaskAddress("");
        setMetaMaskBalance("");
        setMetaMaskNetwork("");
        return;
      }
      await refreshMetaMaskState(accounts[0]);
    };
    const handleChainChanged = async () => {
      await refreshMetaMaskState(metaMaskAddress || undefined);
    };
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [metaMaskAddress]);

  const refreshMetaMaskState = async (addressInput?: string) => {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const address =
        addressInput || (await provider.send("eth_accounts", []))?.[0] || "";
      if (!address) {
        setMetaMaskAddress("");
        setMetaMaskBalance("");
        setMetaMaskNetwork("");
        return;
      }
      const balanceWei = await provider.getBalance(address);
      const network = await provider.getNetwork();
      setMetaMaskAddress(address);
      setMetaMaskBalance(ethers.formatEther(balanceWei));
      setMetaMaskNetwork(network.name || `chain-${network.chainId.toString()}`);
    } catch {
      setMetaMaskAddress("");
      setMetaMaskBalance("");
      setMetaMaskNetwork("");
    }
  };

  const connectMetaMask = async () => {
    setMetaMaskError("");
    try {
      if (!window.ethereum) {
        setMetaMaskError(
          "MetaMask not detected. Please install the MetaMask browser extension."
        );
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        setMetaMaskError("No MetaMask account connected.");
        return;
      }
      await refreshMetaMaskState(accounts[0]);

      // Save wallet address to backend so on-chain escrow release works
      try {
        await fetch("/api/wallet", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ walletAddress: accounts[0] }),
        });
      } catch {
        // Non-critical
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        setMetaMaskError("Connection rejected. Please approve in MetaMask.");
      } else {
        setMetaMaskError("Failed to connect MetaMask.");
      }
    }
  };

  const disconnectMetaMask = async () => {
    setMetaMaskError("");
    setMetaMaskAddress("");
    setMetaMaskBalance("");
    setMetaMaskNetwork("");
    try {
      if (window.ethereum?.request) {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      }
    } catch {
      // Ignore revoke errors
    }
  };

  const handleLoadFunds = async () => {
    setFundMessage("");
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFundMessage("Enter a valid amount greater than 0.");
      return;
    }
    setFunding(true);
    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amountEth: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFundMessage(data.error || "Failed to load funds.");
        setFunding(false);
        return;
      }
      setFundMessage(data.message || "Funds loaded.");
      await fetchWallet();
    } catch {
      setFundMessage("Failed to connect to server.");
    } finally {
      setFunding(false);
    }
  };

  const handleLoadFundsViaMetaMask = async () => {
    setFundMessage("");
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFundMessage("Enter a valid amount greater than 0.");
      return;
    }
    if (!wallet?.address) {
      setFundMessage("Project wallet address not available.");
      return;
    }
    if (!window.ethereum) {
      setFundMessage("MetaMask not detected in browser.");
      return;
    }
    setFundingViaMetaMask(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const fromAddress = await signer.getAddress();
      const tx = await signer.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther(amount.toString()),
      });
      await tx.wait();
      setFundMessage(`Loaded ${amount} ETH via MetaMask. Tx: ${tx.hash}`);
      await Promise.all([fetchWallet(), refreshMetaMaskState(fromAddress)]);
    } catch (error) {
      const message =
        (error as { message?: string })?.message || "MetaMask funding failed.";
      if (message.toLowerCase().includes("insufficient funds")) {
        setFundMessage("MetaMask balance is not enough for amount + gas.");
      } else {
        setFundMessage("MetaMask funding failed.");
      }
    } finally {
      setFundingViaMetaMask(false);
    }
  };

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handleTopupViaRazorpay = async () => {
    setFundMessage("");
    const inr = Number(topupInr);
    if (!Number.isFinite(inr) || inr <= 0) {
      setFundMessage("Enter a valid top-up amount in INR.");
      return;
    }
    setToppingUpRazorpay(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setFundMessage("Razorpay checkout failed to load.");
        setToppingUpRazorpay(false);
        return;
      }
      const orderRes = await fetch("/api/wallet/topup/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amountInr: inr }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) {
        setFundMessage(orderData.error || "Unable to create Razorpay order.");
        setToppingUpRazorpay(false);
        return;
      }
      const options = {
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: "LostLink Wallet Top-up",
        description: "Sandbox top-up for project wallet",
        order_id: orderData.orderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch("/api/wallet/topup/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                amountInr: inr,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) {
              setFundMessage(
                verifyData.error || "Razorpay payment verification failed."
              );
              return;
            }
            setFundMessage(verifyData.message || "Top-up successful.");
            await fetchWallet();
          } catch {
            setFundMessage("Verification request failed.");
          } finally {
            setToppingUpRazorpay(false);
          }
        },
        modal: {
          ondismiss: () => {
            setToppingUpRazorpay(false);
          },
        },
        theme: { color: "#06b6d4" },
      };
      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch {
      setFundMessage("Razorpay top-up failed.");
      setToppingUpRazorpay(false);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black/90 shadow-xl p-5 sm:p-8 transition-colors duration-300">
      {loading && (
        <p className="text-neutral-600 dark:text-neutral-200">Loading wallet...</p>
      )}
      {!loading && error && (
        <p className="text-red-500 dark:text-red-400">{error}</p>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {/* Ethereum Status */}
            <Card className="border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white">
              <CardHeader>
                <CardTitle>Ethereum Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <strong>Project Wallet:</strong> {wallet?.address || "-"}
                </p>
                {wallet?.address && (
                  <p>
                    <a
                      href={`https://sepolia.etherscan.io/address/${wallet.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 dark:text-violet-300 underline text-xs"
                    >
                      View on Sepolia Etherscan ↗
                    </a>
                  </p>
                )}
                <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 mt-2">
                  <p className="text-neutral-500 dark:text-neutral-300 text-xs uppercase tracking-wide mb-1">
                    On‑chain Custodial Balance
                  </p>
                  <p className="text-2xl font-semibold text-black dark:text-white">
                    {(wallet?.balanceEth || "0.0000").slice(0, 6)} ETH
                  </p>
                  <p className="text-neutral-400 text-xs mt-1 italic">
                    This is auto‑granted gas money, not your system‑loaded funds.
                  </p>
                </div>
                <p>
                  <strong>Network:</strong> {wallet?.network || "-"}
                </p>
              </CardContent>
            </Card>

            {/* Load Funds */}
            <Card className="border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white">
              <CardHeader>
                <CardTitle>Load Funds for Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-neutral-600 dark:text-neutral-300">
                  Add ETH to your project wallet before verifying payout.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="w-full bg-white dark:bg-black"
                  />
                  <Button
                    onClick={handleLoadFunds}
                    disabled={funding}
                    className="bg-violet-600 text-white font-semibold hover:bg-violet-500 transition-colors"
                  >
                    {funding ? "Loading..." : "Load Funds (System)"}
                  </Button>
                  <Button
                    onClick={handleLoadFundsViaMetaMask}
                    disabled={fundingViaMetaMask || !metaMaskAddress || !hasMetaMask}
                    className="bg-violet-700 text-white font-semibold hover:bg-violet-600 disabled:opacity-60 transition-colors"
                  >
                    {fundingViaMetaMask ? "Sending..." : "Load via MetaMask"}
                  </Button>
                </div>
                <div className="space-y-2 border border-neutral-200 dark:border-neutral-700 rounded p-3 bg-white dark:bg-neutral-800">
                  <p className="text-neutral-800 dark:text-neutral-200 font-medium">
                    Mobile Top‑up (Razorpay Sandbox)
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={topupInr}
                      onChange={(e) => setTopupInr(e.target.value)}
                      className="w-full bg-white dark:bg-black"
                      placeholder="Amount in INR"
                    />
                    <Button
                      onClick={handleTopupViaRazorpay}
                      disabled={toppingUpRazorpay}
                      className="bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:opacity-60"
                    >
                      {toppingUpRazorpay ? "Opening..." : "Top up via Razorpay"}
                    </Button>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-300">
                    Works on mobile browser too. Uses Razorpay test mode when test keys are configured.
                  </p>
                </div>
                {!hasMetaMask && (
                  <p className="text-xs text-neutral-400">
                    MetaMask is optional. You can still use "Load Funds (System)" and normal app flows.
                  </p>
                )}
                {fundMessage && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-200">{fundMessage}</p>
                )}
              </CardContent>
            </Card>

            {/* MetaMask */}
            <Card className="border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white">
              <CardHeader>
                <CardTitle>MetaMask (Optional)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {hasMetaMask ? (
                  <Button
                    onClick={metaMaskAddress ? disconnectMetaMask : connectMetaMask}
                    type="button"
                    className="bg-violet-600 text-white font-semibold hover:bg-violet-500 transition-colors"
                  >
                    {metaMaskAddress ? "Disconnect MetaMask" : "Connect MetaMask"}
                  </Button>
                ) : (
                  <p className="text-neutral-600 dark:text-neutral-300">
                    MetaMask extension not detected.{" "}
                    <a
                      href="https://metamask.io/download/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 dark:text-violet-300 underline"
                    >
                      Install MetaMask ↗
                    </a>
                  </p>
                )}
                {metaMaskError && (
                  <p className="text-red-500 dark:text-red-300">{metaMaskError}</p>
                )}
                {metaMaskAddress && (
                  <>
                    <p>
                      <strong>Address:</strong> {metaMaskAddress}
                    </p>
                    <p>
                      <a
                        href={`https://sepolia.etherscan.io/address/${metaMaskAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-600 dark:text-violet-300 underline text-xs"
                      >
                        View on Sepolia Etherscan ↗
                      </a>
                    </p>
                    <p>
                      <strong>Balance:</strong> {metaMaskBalance} ETH
                    </p>
                    <p>
                      <strong>Network:</strong> {metaMaskNetwork}
                    </p>
                    {metaMaskNetwork &&
                      !metaMaskNetwork.toLowerCase().includes("sepolia") && (
                        <p className="text-amber-500 text-xs">
                          ⚠️ Switch MetaMask to Sepolia testnet for on-chain features to work.
                        </p>
                      )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Off-chain wallet */}
            <Card className="border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white">
              <CardHeader>
                <CardTitle>Normal Wallet (Off-chain / Razorpay)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 mb-3">
                  <p className="text-neutral-500 dark:text-neutral-300 text-xs uppercase tracking-wide mb-1">
                    System Load Balance
                  </p>
                  <p className="text-2xl font-bold text-black dark:text-white">
                    {(wallet?.offchainBalance ?? 0).toFixed(4)} ETH
                  </p>
                  <p className="text-neutral-400 text-xs mt-1">
                    Funds added via "Load Funds (System)" appear here.
                  </p>
                </div>
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-100 dark:border-indigo-900/50 mb-3">
                  <p className="text-indigo-600 dark:text-indigo-400 text-xs uppercase tracking-wide font-semibold mb-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    On-chain Reputation
                  </p>
                  <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                    {wallet?.reputation ?? 0}
                  </p>
                  <p className="text-indigo-500/70 dark:text-indigo-400/50 text-xs mt-1">
                    Verifiable trust score earned through successful returns.
                  </p>
                </div>
                <p>
                  <strong>Total Received:</strong> {summary?.offchainReceivedEth || 0} ETH
                </p>
                <p>
                  <strong>Total Paid:</strong> {summary?.offchainSentEth || 0} ETH
                </p>
              </CardContent>
            </Card>

            {/* Combined status */}
            <Card className="border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white">
              <CardHeader>
                <CardTitle>Combined Account Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <strong>Total Received:</strong> {summary?.totalReceivedEth || 0} ETH
                </p>
                <p>
                  <strong>Total Sent:</strong> {summary?.totalSentEth || 0} ETH
                </p>
                <p>
                  <strong>Net Overall:</strong> {summary?.netEth || 0} ETH
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Transaction History */}
      {!loading && (
        <Card className="mt-6 border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No transactions yet.
              </p>
            ) : (
              <div className="space-y-4">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black/60 p-3 text-sm space-y-1"
                  >
                    <p>
                      <strong>Method:</strong>{" "}
                      {tx.paymentMethod === "onchain"
                        ? "On-chain (Smart Contract)"
                        : tx.paymentMethod === "offchain"
                        ? "Off-chain escrow release"
                        : tx.paymentMethod === "metamask"
                        ? "MetaMask on-chain transfer"
                        : "Razorpay + blockchain anchor"}
                    </p>
                    <p>
                      <strong>
                        {tx.direction === "sent" ? "Sent" : "Received"}:
                      </strong>{" "}
                      {tx.amountEth} ETH
                    </p>

                    {/* Main tx hash */}
                    <p>
                      <strong>
                        {tx.paymentMethod === "razorpay"
                          ? "External Payment ID"
                          : "Tx Hash"}
                        :
                      </strong>{" "}
                      <span className="font-mono text-xs break-all">{tx.txHash}</span>
                      {tx.paymentMethod === "offchain" && (
                        <span className="text-neutral-500 dark:text-neutral-400 text-xs ml-2">
                          (Off‑chain transfer)
                        </span>
                      )}
                    </p>

                    {/* Etherscan link for on-chain hashes */}
                    {(tx.paymentMethod === "onchain" || tx.paymentMethod === "metamask") &&
                      isValidTxHash(tx.txHash) && (
                        <p>
                          <a
                            href={tx.explorerTxUrl || etherscanUrl(tx.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-600 dark:text-violet-300 underline text-xs"
                          >
                            🔍 Verify on Sepolia Etherscan ↗
                          </a>
                        </p>
                      )}
                    {(tx.paymentMethod === "onchain" || tx.paymentMethod === "metamask") &&
                      !isValidTxHash(tx.txHash) && (
                        <p className="text-red-500 dark:text-red-300 text-xs">
                          ⚠ Transaction hash cannot be verified (corrupted or incomplete)
                        </p>
                      )}

                    {/* Anchor tx (Razorpay) */}
                    {tx.paymentMethod === "razorpay" && tx.anchorTxHash && (
                      <>
                        <p>
                          <strong>Blockchain Anchor Tx:</strong>{" "}
                          <span className="font-mono text-xs break-all">{tx.anchorTxHash}</span>
                        </p>
                        {isValidTxHash(tx.anchorTxHash) && (
                          <p>
                            <a
                              href={tx.anchorExplorerTxUrl || etherscanUrl(tx.anchorTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-violet-600 dark:text-violet-300 underline text-xs"
                            >
                              🔍 Verify anchor on Sepolia Etherscan ↗
                            </a>
                          </p>
                        )}
                      </>
                    )}

                    {/* Settlement proof */}
                    {tx.settlementProofTxHash && (
                      <>
                        <p>
                          <strong>Settlement Proof Tx:</strong>{" "}
                          <span className="font-mono text-xs break-all">{tx.settlementProofTxHash}</span>
                        </p>
                        {isValidTxHash(tx.settlementProofTxHash) && (
                          <p>
                            <a
                              href={
                                tx.settlementProofExplorerTxUrl ||
                                etherscanUrl(tx.settlementProofTxHash)
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-violet-600 dark:text-violet-300 underline text-xs"
                            >
                              🔍 Verify settlement proof on Sepolia Etherscan ↗
                            </a>
                          </p>
                        )}
                      </>
                    )}

                    <p>
                      <strong>From:</strong> {tx.from.fullName} ({tx.from.address})
                    </p>
                    <p>
                      <strong>To:</strong> {tx.to.fullName} ({tx.to.address})
                    </p>
                    {tx.itemDescription && (
                      <p>
                        <strong>Item:</strong> {tx.itemDescription}
                      </p>
                    )}
                    <p>
                      <strong>Date:</strong>{" "}
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}