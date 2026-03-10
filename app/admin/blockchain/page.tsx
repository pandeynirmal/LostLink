"use client";

import { useEffect, useState } from "react";

interface BlockchainData {
    status: {
        network: string;
        contractAddress: string;
    } | null;
    balance: string | null;
}

export default function BlockchainPage() {
    const [data, setData] = useState<BlockchainData | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("/api/admin/blockchain", {
                    credentials: "include",
                });
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                }
            } catch {
                // silent fail, UI will show fallback
            }
        };

        fetchData();
    }, []);

    if (!data)
        return (
            <div className="text-white py-8">Loading blockchain data...</div>
        );

    return (
        <div className="space-y-6">
            <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white">
                    Blockchain
                </div>
                <h1 className="mt-3 text-2xl font-bold text-white">Blockchain Status</h1>
                <p className="mt-1 text-sm text-neutral-300">
                    Live view of the deployed LostLink smart contract and its balance.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card title="Network" value={data.status?.network || "Unknown"} accent="yellow" />
                <Card title="Contract Address" value={data.status?.contractAddress || "N/A"} accent="green" />
                <Card title="Contract Balance (ETH)" value={data.balance || "0"} accent="red" />
            </div>
        </div>
    );
}

function Card({
    title,
    value,
    accent,
}: {
    title: string;
    value: string;
    accent?: "red" | "green" | "yellow";
}) {
    const borderClass =
        accent === "red"
            ? "border-red-500/60"
            : accent === "green"
            ? "border-green-500/60"
            : accent === "yellow"
            ? "border-yellow-400/70"
            : "border-neutral-700";

    return (
        <div
            className={`p-6 rounded-2xl border ${borderClass} bg-black shadow-xl shadow-black/50`}
        >
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                {title}
            </h2>
            <p className="text-lg font-semibold mt-3 break-all text-white">
                {value}
            </p>
        </div>
    );
}