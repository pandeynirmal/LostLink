import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Message from "@/lib/models/Message";
import Conversation from "@/lib/models/Conversation";
import "@/lib/models/User";
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversation: string }> }
) {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversation } = await context.params;

    await connectDB();

    const chat = await Conversation.findById(conversation).populate(
      "participants",
      "fullName email"
    );

    if (!chat) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const isParticipant = chat.participants
      .map((p: any) => p._id.toString())
      .includes(userId);

    if (!isParticipant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await Message.updateMany(
      {
        conversationId: conversation,
        senderId: { $ne: userId },
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    const messages = await Message.find({ conversationId: conversation }).sort({
      createdAt: 1,
    });

    const otherUser = chat.participants.find(
      (p: any) => p._id.toString() !== userId
    );

    return NextResponse.json({
      success: true,
      messages,
      otherUserName: otherUser?.fullName || "User",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
