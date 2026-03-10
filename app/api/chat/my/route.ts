import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Conversation from "@/lib/models/Conversation";
import Message from "@/lib/models/Message";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import "@/lib/models/User";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded) return null;

  return decoded.userId;
}

export async function GET() {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const conversations = await Conversation.find({
      participants: { $in: [userId] },
      deletedFor: { $ne: userId },
    })
      .populate("participants", "fullName email")
      .sort({ updatedAt: -1 });

    const formatted = await Promise.all(
      conversations.map(async (conv: any) => {
        const otherUser = conv.participants.find(
          (p: any) => p._id.toString() !== userId
        );

        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          senderId: { $ne: userId },
          isRead: false,
        });

        return {
          _id: conv._id,
          otherUserId: otherUser?._id?.toString() || "",
          otherUserName: otherUser?.fullName || "User",
          lastMessage: conv.lastMessage || "",
          updatedAt: conv.updatedAt,
          unreadCount,
        };
      })
    );

    const byOtherUser = new Map<string, any>();

    for (const chat of formatted) {
      const key = chat.otherUserId || chat._id.toString();
      const existing = byOtherUser.get(key);

      if (!existing) {
        byOtherUser.set(key, { ...chat });
        continue;
      }

      existing.unreadCount += chat.unreadCount;

      const existingUpdated = new Date(existing.updatedAt).getTime();
      const candidateUpdated = new Date(chat.updatedAt).getTime();
      if (candidateUpdated > existingUpdated) {
        existing._id = chat._id;
        existing.lastMessage = chat.lastMessage;
        existing.updatedAt = chat.updatedAt;
      }
    }

    const deduped = Array.from(byOtherUser.values()).map((chat) => ({
      _id: chat._id,
      otherUserName: chat.otherUserName,
      lastMessage: chat.lastMessage,
      unreadCount: chat.unreadCount,
    }));

    return NextResponse.json({
      conversations: deduped,
    });

  } catch (error) {
    console.error("Chat List Error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
