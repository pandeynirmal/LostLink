import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import EscrowCase from "@/lib/models/EscrowCase";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import "@/lib/models/Item";
import "@/lib/models/User";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  return decoded.userId;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Fetch escrows where user is owner or finder
    const escrows = await EscrowCase.find({
      $or: [
        { ownerId: userId },
        { finderId: userId }
      ]
    })
    .sort({ createdAt: -1 })
    .populate("itemId", "description imageUrl type status rewardAmount")
    .populate("ownerId", "fullName email")
    .populate("finderId", "fullName email")
    .lean();

    return NextResponse.json(
      { success: true, escrows },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("My Escrows GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
