import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { requireAdmin } from "@/lib/adminAuth";

const JWT_SECRET = process.env.JWT_SECRET!;


export async function GET() {
  try {
    await requireAdmin();

    const users = await User.find().select("-password");

    return NextResponse.json({ users }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Unauthorized" },
      { status: 401 }
    );
  }
}