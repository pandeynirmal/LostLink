import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Message from "@/lib/models/Message";
import Conversation from "@/lib/models/Conversation";
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

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, content } = await request.json();

    if (!conversationId || !content) {
      return NextResponse.json(
        { error: "Missing conversationId or content" },
        { status: 400 }
      );
    }

    await connectDB();

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const participants = conversation.participants.map((p: any) =>
      p.toString()
    );

    if (!participants.includes(userId)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    //  Restore chat for this user only if previously deleted
    conversation.deletedFor = conversation.deletedFor.filter(
      (id: any) => id.toString() !== userId
    );

    // Update last message
    conversation.lastMessage = content;

    // Force updatedAt refresh
    conversation.markModified("updatedAt");

    await conversation.save();

    // Create new message
    const message = await Message.create({
      conversationId,
      senderId: userId,
      content,
      isRead: false,
    });

    return NextResponse.json({
      success: true,
      message,
    });

  } catch (error) {
    console.error("Send Message Error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
