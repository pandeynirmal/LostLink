import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { ensureUserWallet } from "@/lib/wallet";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function GET() {
  try {
    await dbConnect();

    // Await cookies() in your Next.js version
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { message: "No token" },
        { status: 401 }
      );
    }

    const decoded: any = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 401 }
      );
    }
    await ensureUserWallet(user);

    return NextResponse.json(
      {
        user: {
          _id: user._id.toString(),
          email: user.email,
          role: user.role,
          fullName: user.fullName,
          walletAddress: user.walletAddress,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Invalid token" },
      { status: 401 }
    );
  }
}
