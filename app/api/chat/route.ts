import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Conversation from "@/lib/models/Conversation";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

async function getUserIdFromCookie() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) return null;

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_super_secret_jwt_key_here"
    ) as { userId: string };

    return decoded.userId;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const userId = await getUserIdFromCookie();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const conversations = await Conversation.find({
      participants: userObjectId,
      deletedFor: { $ne: userObjectId },
    })
      .populate("participants", "fullName email")
      .sort({ updatedAt: -1 });

    return NextResponse.json({ conversations });

  } catch (error) {
    console.error("Chat list error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}