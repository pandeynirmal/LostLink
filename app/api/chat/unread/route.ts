import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Conversation from "@/lib/models/Conversation";
import Message from "@/lib/models/Message";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get conversations where user participates and hasn't deleted
    const conversations = await Conversation.find({
      participants: { $in: [userId] },
      deletedFor: { $ne: userId },
    }).select("_id");

    const conversationIds = conversations.map((convo) => convo._id);

    const unreadCount =
      conversationIds.length > 0
        ? await Message.countDocuments({
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            isRead: false,
          })
        : 0;

    return NextResponse.json(
      {
        success: true,
        unreadCount,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
