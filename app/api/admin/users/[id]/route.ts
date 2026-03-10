import { NextResponse } from "next/server";
import User from "@/lib/models/User";
import Item from "@/lib/models/Item";
import connectDB from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    await connectDB();

    const { id } = await params;

    const user = await User.findById(id).select("-password").lean();

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    //  Fetch Items
    const items = await Item.find({ userId: id })
      .sort({ createdAt: -1 })
      .lean();

    //  Compute Stats
    const totalItems = items.length;
    const lostItems = items.filter(i => i.type === "lost").length;
    const foundItems = items.filter(i => i.type === "found").length;
    const resolvedItems = items.filter(i => i.status === "resolved").length;
    const claimedItems = items.filter(i => i.isClaimed === true).length;

   items.filter(i => i.isClaimed)

    const stats = {
      totalItems,
      lostItems,
      foundItems,
      resolvedItems,
      claimedItems,
      // totalRewardsGiven,
    };

    return NextResponse.json({
      user,
      stats,
      items,
    });

  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}
