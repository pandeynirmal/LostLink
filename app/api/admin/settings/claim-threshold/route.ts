import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import SystemConfig from "@/lib/models/SystemConfig";

const CONFIG_KEY = "auto_admin_approve_match_score";

export async function GET() {
  try {
    await requireAdmin();
    await dbConnect();

    const config = await SystemConfig.findOne({ key: CONFIG_KEY });
    const fallback = Number(process.env.AUTO_ADMIN_APPROVE_MATCH_SCORE || "90");
    const threshold = Number(config?.valueNumber ?? fallback);

    return NextResponse.json({
      threshold,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    await dbConnect();

    const { threshold } = await request.json();
    const value = Number(threshold);

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json(
        { error: "Threshold must be between 0 and 100" },
        { status: 400 }
      );
    }

    await SystemConfig.findOneAndUpdate(
      { key: CONFIG_KEY },
      { key: CONFIG_KEY, valueNumber: value },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      success: true,
      threshold: value,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}
