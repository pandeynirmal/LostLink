"use client";

import { Navbar } from "@/components/navbar";
import { WalletPanel } from "@/components/wallet-panel";

export default function WalletPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Wallet
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-black dark:text-white">
            Account Wallet
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage balances, add funds, and review on/off‑chain transactions.
          </p>
        </div>
        <section>
          <WalletPanel />
        </section>
      </main>
    </div>
  );
}
