"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/navbar";

type TxPayload = {
  found: boolean;
  message?: string;
  error?: string;
  details?: string;
  network?: string;
  chainId?: string;
  rpcUrl?: string;
  hint?: string;
  tx?: {
    hash: string;
    from: string;
    to: string;
    valueWei: string;
    blockNumber: number;
  } | null;
  receipt?: {
    status: number;
    blockNumber: number;
    gasUsed: string;
  } | null;
};

function formatWeiToEth(wei?: string) {
  if (!wei) return "0";
  const n = Number(wei);
  if (!Number.isFinite(n)) return wei;
  return (n / 1e18).toString();
}

export default function TransactionDetailsPage() {
  const params = useParams<{ hash: string }>();
  const hash = params?.hash || "";

  const [data, setData] = useState<TxPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hash) return;

    const run = async () => {
      try {
        const res = await fetch(`/api/blockchain/tx/${hash}`, {
          cache: "no-store",
        });
        const payload = await res.json();
        setData(payload);
      } catch {
        setData({ found: false, error: "Failed to load transaction details" });
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [hash]);

  const txStatusLabel = useMemo(() => {
    if (data && data.found === false) return "Not Found On Current Chain";
    if (!data?.receipt) return "Pending";
    return data.receipt.status === 1 ? "Success" : "Failed";
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Transaction Details</h1>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3">
          <p>
            <strong>Hash:</strong> {hash}
          </p>

          {loading && <p>Loading transaction...</p>}

          {!loading && data?.error && (
            <p className="text-red-300">
              {data.error}
              {data.details ? `: ${data.details}` : ""}
            </p>
          )}

          {!loading && !data?.error && (
            <>
              <p>
                <strong>Network:</strong> {data?.network || "Unknown"}
              </p>
              <p>
                <strong>Status:</strong> {txStatusLabel}
              </p>

              {data?.tx ? (
                <>
                  <p>
                    <strong>From:</strong> {data.tx.from}
                  </p>
                  <p>
                    <strong>To:</strong> {data.tx.to || "Contract Creation"}
                  </p>
                  <p>
                    <strong>Value:</strong> {formatWeiToEth(data.tx.valueWei)} ETH
                  </p>
                  <p>
                    <strong>Block:</strong> {data.tx.blockNumber ?? "Pending"}
                  </p>
                </>
              ) : (
                <p>Transaction payload not available on current RPC.</p>
              )}

              {data?.receipt && (
                <>
                  <p>
                    <strong>Receipt Block:</strong> {data.receipt.blockNumber}
                  </p>
                  <p>
                    <strong>Gas Used:</strong> {data.receipt.gasUsed}
                  </p>
                </>
              )}

              {data?.message && <p className="text-slate-300">{data.message}</p>}
              {data?.hint && <p className="text-amber-300">{data.hint}</p>}
              {!data?.tx && data?.rpcUrl && (
                <div className="space-y-1 text-sm">
                  <p className="text-slate-300">
                    Checked RPC: {data.rpcUrl}
                    {data.chainId ? ` (chainId: ${data.chainId})` : ""}
                  </p>
                  <p className="text-slate-200">
                    Next step: verify this hash on the same network where the payment was sent in MetaMask.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
