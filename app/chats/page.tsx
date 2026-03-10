"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";

interface Chat {
  _id: string;
  otherUserName: string;
  lastMessage: string;
  unreadCount: number;
}

export default function MyChatsPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChats = async () => {
    try {
      const res = await fetch("/api/chat/my", {
        credentials: "include",
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();

      const newChats = data.conversations || [];

      // Only update if changed
      setChats((prev) =>
        JSON.stringify(prev) !== JSON.stringify(newChats)
          ? newChats
          : prev
      );

      setLoading(false);
    } catch (error) {
      console.error("Chat fetch error:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChats();

    const interval = setInterval(fetchChats, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (conversationId: string) => {
    try {
      const res = await fetch("/api/chat/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ conversationId }),
      });

      if (res.ok) {
        setChats((prev) =>
          prev.filter((chat) => chat._id !== conversationId)
        );
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
        <Navbar />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
          <span className="ml-3 text-neutral-500 dark:text-neutral-400">Loading chats...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <Navbar />

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">My Chats</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm">
            Manage your active conversations and recover items.
          </p>
        </div>

        {chats.length === 0 ? (
          <div className="text-center py-20 bg-neutral-100 dark:bg-neutral-900/20 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-2xl">
            <p className="text-neutral-500">No conversations yet.</p>
          </div>
        ) : (
          chats.map((chat) => (
            <div
              key={chat._id}
              className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 rounded-xl p-5 flex justify-between items-center hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition shadow-sm"
            >
              <div className="space-y-1">
                {/* User Name */}
                <p className="font-semibold text-xl text-black dark:text-white">
                  {chat.otherUserName}
                </p>

                {/* Show unread OR last message */}
                {chat.unreadCount > 0 ? (
                  <p className="text-violet-600 dark:text-violet-400 text-sm font-medium">
                    {chat.unreadCount} new message{chat.unreadCount > 1 ? "s" : ""}
                  </p>
                ) : (
                  <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                    {chat.lastMessage}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/chat/${chat._id}`}
                  className="bg-violet-600 text-white px-5 py-2.5 rounded-xl hover:bg-violet-500 transition-all shadow-lg shadow-violet-500/20 text-sm font-medium"
                >
                  Open Chat
                </Link>

                <button
                  onClick={() => handleDelete(chat._id)}
                  className="bg-red-500/10 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-xl hover:bg-red-500 hover:text-white transition-all text-sm font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
