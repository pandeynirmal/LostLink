import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import connectDB from "@/lib/db";
import Item from "@/lib/models/Item";
import EscrowCase from "@/lib/models/EscrowCase";
import ContactRequest from "@/lib/models/ContactRequest";
import Conversation from "@/lib/models/Conversation";
import WalletTransaction from "@/lib/models/WalletTransaction";
import User from "@/lib/models/User";

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    const me = await User.findById(decoded.userId).select("role");
    if (me?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const [items, escrows, contacts, convos, txns] = await Promise.all([
      Item.deleteMany({}),
      EscrowCase.deleteMany({}),
      ContactRequest.deleteMany({}),
      Conversation.deleteMany({}),
      WalletTransaction.deleteMany({}),
    ]);

    return NextResponse.json({
      success: true,
      deleted: {
        items: items.deletedCount,
        escrows: escrows.deletedCount,
        contactRequests: contacts.deletedCount,
        conversations: convos.deletedCount,
        walletTransactions: txns.deletedCount,
      },
      message: "All items and related data wiped. Fresh start ready.",
    });
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: "Reset failed", details: (error as Error).message }, { status: 500 });
  }
}