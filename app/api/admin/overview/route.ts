import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import Item from "@/lib/models/Item";
import ContactRequest from "@/lib/models/ContactRequest";
import { verifyToken } from "@/lib/auth";
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }

    await dbConnect();

    const admin = await User.findById(decoded.userId);
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    //  Stats
    const totalUsers = await User.countDocuments();
    const totalItems = await Item.countDocuments({ deleted: { $ne: true } });

    const lostCount = await Item.countDocuments({
      type: "lost",
      deleted: { $ne: true },
    });

    const foundCount = await Item.countDocuments({
      type: "found",
      deleted: { $ne: true },
    });

    const contactRequests = await ContactRequest.countDocuments();

    // Placeholder for blockchain stats (we improve later)
    const blockchainMatches = 0;
    const activeMatches = 0;

    return NextResponse.json({
      totalUsers,
      totalItems,
      lostCount,
      foundCount,
      activeMatches,
      blockchainMatches,
      contactRequests,
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return NextResponse.json(
      { message: "Server error" },
      { status: 500 }
    );
  }
}
