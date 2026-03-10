"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";

interface Message {
  _id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversation as string;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUserName, setOtherUserName] = useState("Chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  //  Get logged-in user
  useEffect(() => {
    const fetchUser = async () => {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!res.ok) {
        router.push("/signin");
        return;
      }

      const data = await res.json();
      setCurrentUserId(data.user._id);
    };

    fetchUser();
  }, [router]);

  const fetchMessages = async () => {
    const res = await fetch(`/api/chat/${conversationId}`, {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json();

    if (res.ok) {
      setMessages(data.messages || []);

      //  Use backend-provided name
      if (data.otherUserName) {
        setOtherUserName(data.otherUserName);
      }

      // Opening chat marks incoming messages as read on backend.
      window.dispatchEvent(new Event("app:refresh-badges"));
    }

    setLoading(false);
  };

  //  Poll every 3 seconds
  useEffect(() => {
    if (!conversationId) return;

    fetchMessages();

    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  //  Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        conversationId,
        content: newMessage,
      }),
    });

    if (res.ok) {
      setNewMessage("");
      fetchMessages();
      window.dispatchEvent(new Event("app:refresh-badges"));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="text-center py-20">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <Navbar />

      <main className="max-w-3xl mx-auto p-6 flex flex-col h-[80vh]">
        <h1 className="text-xl font-bold mb-4">
          {otherUserName}
        </h1>

        <div className="flex-1 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 space-y-3 bg-neutral-50 dark:bg-neutral-900/40 shadow-inner">
          {messages.map((msg) => {
            const isMine = msg.senderId === currentUserId;

            return (
              <div
                key={msg._id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs md:max-w-md break-words rounded-2xl px-4 py-2 shadow-sm ${
                    isMine
                      ? "bg-violet-600 text-white"
                      : "bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white"
                  }`}
                >
                  <p className="text-sm md:text-base">{msg.content}</p>
                  <p className="text-[10px] opacity-60 mt-1 text-right">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        <div className="flex mt-6 gap-3">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 resize-none bg-white dark:bg-neutral-900 text-black dark:text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all text-sm md:text-base"
            rows={2}
          />
          <button
            onClick={handleSend}
            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-xl font-medium transition-all shadow-lg shadow-violet-500/20 h-fit self-end"
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
