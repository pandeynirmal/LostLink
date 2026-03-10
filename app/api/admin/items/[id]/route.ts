import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Item from "@/lib/models/Item";
import { requireAdmin } from "@/lib/adminAuth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    await connectDB();

    const { id } = await params;

    const item = await Item.findById(id);

    if (!item) {
      return NextResponse.json(
        { success: false, message: "Item not found" },
        { status: 404 }
      );
    }

    await Item.findByIdAndUpdate(id, {
      removedByAdmin: true,
      removedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "Item removed by admin",
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}