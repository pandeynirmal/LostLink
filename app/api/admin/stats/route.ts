import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Item from "@/lib/models/Item";
import ContactRequest from "@/lib/models/ContactRequest";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  try {
    await requireAdmin();
    await dbConnect();

    const [totalItems, totalLost, totalFound, claims, pendingClaims] = await Promise.all([
      Item.countDocuments({ removedByAdmin: { $ne: true } }),
      Item.countDocuments({ type: "lost", removedByAdmin: { $ne: true } }),
      Item.countDocuments({ type: "found", removedByAdmin: { $ne: true } }),
      ContactRequest.countDocuments({ adminStatus: { $in: ["approved", "rejected"] } }),
      ContactRequest.countDocuments({ status: "approved", adminStatus: "pending" }),
    ]);

    return NextResponse.json({
      totalItems,
      totalLost,
      totalFound,
      claims,
      pendingClaims,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch stats" },
      { status: 401 }
    );
  }
}
