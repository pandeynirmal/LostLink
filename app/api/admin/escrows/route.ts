import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import connectDB from "@/lib/db";
import EscrowCase from "@/lib/models/EscrowCase";
import User from "@/lib/models/User";

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

    // Check if user is admin
    const user = await User.findById(userId).select("role").lean();
    if ((user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    // Fetch all escrows with populated data
    const escrows = await EscrowCase.find()
      .sort({ createdAt: -1 })
      .populate("itemId", "description type")
      .populate("ownerId", "fullName email")
      .populate("finderId", "fullName email")
      .lean();

    return NextResponse.json({ success: true, escrows });
  } catch (error) {
    console.error("Admin escrows GET error:", error);
    return NextResponse.json(
      { error: "Server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
