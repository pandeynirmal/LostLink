"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { WalletPanel } from "@/components/wallet-panel";
import { useTheme } from "next-themes";
import { Sun, Moon, Wallet, LogOut, Menu, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UserType {
  _id: string;
  fullName: string;
  email: string;
  role: string;
}

export function Navbar() {
  const [user, setUser] = useState<UserType | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const [walletOpen, setWalletOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Memoized fetch function to avoid recreating it
  const fetchAllData = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        setUser(null);
        setChatUnread(0);
        setRequestCount(0);
        return;
      }

      const data = await res.json();
      const resolvedUser = data.user ?? data;
      setUser(resolvedUser);

      // Only fetch counts if user is logged in - use Promise.allSettled for faster parallel fetching
      if (resolvedUser) {
        try {
          const [chatRes, reqRes] = await Promise.allSettled([
            fetch("/api/chat/unread", { credentials: "include", cache: "no-store" }),
            fetch("/api/contact-request?status=pending&limit=1", { credentials: "include", cache: "no-store" }),
          ]);

          if (chatRes.status === "fulfilled" && chatRes.value.ok) {
            const chatData = await chatRes.value.json();
            setChatUnread(chatData.unreadCount || 0);
          }

          if (reqRes.status === "fulfilled" && reqRes.value.ok) {
            const reqData = await reqRes.value.json();
            setRequestCount(Number(reqData?.pagination?.total || 0));
          }
        } catch (err) {
          console.error("Error fetching counts:", err);
        }
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let abortController: AbortController | null = null;

    const safeFetchAllData = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      if (abortController) {
        abortController.abort();
      }

      abortController = new AbortController();
      void fetchAllData();
    };

    // Initial load
    safeFetchAllData();

    // More relaxed polling to reduce load
    const interval = setInterval(safeFetchAllData, 20000);

    const handleFocus = () => {
      safeFetchAllData();
    };
    const handleRefreshBadges = () => {
      safeFetchAllData();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("app:refresh-badges", handleRefreshBadges);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("app:refresh-badges", handleRefreshBadges);

      if (abortController) {
        abortController.abort();
      }
    };
  }, [fetchAllData]);

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      // Force full reload
      window.location.href = "/signin";
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const NavLink = ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-xl px-3 py-2 text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all duration-200"
    >
      {children}
    </Link>
  );

  return (
    <>
      <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
        <nav className="pointer-events-auto w-full max-w-7xl flex items-center justify-between gap-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-black/60 px-6 py-2.5 text-black dark:text-white backdrop-blur-xl shadow-2xl shadow-black/5 dark:shadow-black/40">
          {/* LEFT: Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-black dark:text-white hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <span className="hidden sm:inline text-lg">LostLink</span>
          </Link>

          {/* CENTER: Navigation Links (Desktop) */}
          <div className="hidden md:flex items-center gap-1 text-[13px] font-medium">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/map">Map</NavLink>
            <NavLink href="/qr-scanner">QR</NavLink>

            {user && (
              <>
                <NavLink href="/upload">Upload</NavLink>
                <NavLink href="/my-uploads">My Uploads</NavLink>
                <div className="relative">
                  <NavLink href="/chats">Chats</NavLink>
                  {chatUnread > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-black animate-pulse">
                      {chatUnread}
                    </span>
                  )}
                </div>
                <NavLink href="/escrows">Escrows</NavLink>
                <div className="relative">
                  <NavLink href="/requests">Requests</NavLink>
                  {requestCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-black animate-pulse">
                      {requestCount}
                    </span>
                  )}
                </div>
              </>
            )}

            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="ml-2 flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
              >
                Admin Panel
              </Link>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all"
              title="Toggle Theme"
            >
              {mounted && (theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {user ? (
              <div className="hidden sm:flex items-center gap-2">
                {/* Wallet Button */}
                <button
                  type="button"
                  onClick={() => setWalletOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all"
                >
                  <Wallet className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" />
                  <span className="hidden lg:inline">Wallet</span>
                </button>

                {/* Profile/SignOut Dropdown or Button */}
                <div className="hidden lg:flex flex-col items-end mr-1">
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium leading-none mb-1">Signed in as</span>
                  <span className="text-[14px] font-bold text-black dark:text-white leading-none">
                    {user.fullName?.split(" ")[0] || "User"}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="h-9 w-9 rounded-xl border border-red-500/10 dark:border-red-500/20 bg-red-500/5 p-0 text-red-500 dark:text-red-400 hover:bg-red-500 hover:text-white transition-all"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link href="/signin">
                  <Button variant="ghost" size="sm" className="h-9 text-neutral-600 dark:text-neutral-300 hover:text-black dark:hover:text-white rounded-xl">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white px-4">
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[45] md:hidden bg-white/90 dark:bg-black/90 backdrop-blur-xl animate-in fade-in zoom-in duration-200">
          <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
            <div className="w-full max-w-xs flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 dark:text-neutral-600 mb-2">Navigation</p>
              <NavLink href="/" onClick={() => setIsMenuOpen(false)}>Home</NavLink>
              <NavLink href="/map" onClick={() => setIsMenuOpen(false)}>Map</NavLink>
              <NavLink href="/qr-scanner" onClick={() => setIsMenuOpen(false)}>QR</NavLink>
              
              {user && (
                <>
                  <NavLink href="/upload" onClick={() => setIsMenuOpen(false)}>Upload</NavLink>
                  <NavLink href="/my-uploads" onClick={() => setIsMenuOpen(false)}>My Uploads</NavLink>
                  <div className="flex items-center justify-between">
                    <NavLink href="/chats" onClick={() => setIsMenuOpen(false)}>Chats</NavLink>
                    {chatUnread > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{chatUnread}</span>}
                  </div>
                  <NavLink href="/escrows" onClick={() => setIsMenuOpen(false)}>Escrows</NavLink>
                  <div className="flex items-center justify-between">
                    <NavLink href="/requests" onClick={() => setIsMenuOpen(false)}>Requests</NavLink>
                    {requestCount > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{requestCount}</span>}
                  </div>
                </>
              )}

              {user?.role === "admin" && (
                <Link
                  href="/admin"
                  onClick={() => setIsMenuOpen(false)}
                  className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition-all shadow-lg shadow-red-500/20"
                >
                  <ShieldAlert className="h-4 w-4" />
                  Admin Panel
                </Link>
              )}
            </div>

            <div className="w-full max-w-xs pt-6 border-t border-black/5 dark:border-white/10 flex flex-col gap-4">
              {user ? (
                <>
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-black/5 dark:bg-white/5">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium">Signed in as</span>
                      <span className="text-sm font-bold text-black dark:text-white">{user.fullName}</span>
                    </div>
                    <button
                      onClick={() => {
                        setWalletOpen(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                    >
                      <Wallet className="h-4 w-4" />
                    </button>
                  </div>
                  <Button
                    onClick={() => {
                      handleSignOut();
                      setIsMenuOpen(false);
                    }}
                    variant="ghost"
                    className="w-full h-12 rounded-xl border border-red-500/10 text-red-500 dark:text-red-400 hover:bg-red-500 hover:text-white font-bold"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link href="/signin" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full h-12 rounded-xl font-bold">Sign In</Button>
                  </Link>
                  <Link href="/register" onClick={() => setIsMenuOpen(false)}>
                    <Button className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold">Register</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="h-24" /> {/* Spacer for floating nav */}
      {walletOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 p-4 sm:p-8 overflow-y-auto">
          <div className="mx-auto max-w-7xl relative">
            <button
              type="button"
              onClick={() => setWalletOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-md bg-red-500 px-3 py-1 text-white font-semibold hover:bg-red-400 transition"
            >
              Close
            </button>
            <WalletPanel />
          </div>
        </div>
      )}
    </>
  );
}
