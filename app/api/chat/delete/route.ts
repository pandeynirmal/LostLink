import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
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

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversationId" },
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

    //  Soft delete (hide only for this user)
    if (!conversation.deletedFor.includes(userId)) {
      conversation.deletedFor.push(userId);
      await conversation.save();
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Delete Chat Error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
