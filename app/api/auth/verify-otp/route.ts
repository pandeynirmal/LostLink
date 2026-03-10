import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import bcrypt from "bcryptjs";
import { ensureUserWallet } from "@/lib/wallet";

export async function POST(req: Request) {
  try {
    const { email, otp, fullName, password, organization } = await req.json();

    await dbConnect();

    const user = await User.findOne({ email });

    // 1 Check if user exists
    if (!user) {
      return NextResponse.json(
        { message: "User not found. Please request OTP first." },
        { status: 400 }
      );
    }

    // 2 Check if OTP matches
    if (user.otp !== otp) {
      return NextResponse.json(
        { message: "Invalid OTP" },
        { status: 400 }
      );
    }

    // 3 Check if OTP expired
    if (!user.otpExpires || user.otpExpires < new Date()) {
      return NextResponse.json(
        { message: "OTP expired" },
        { status: 400 }
      );
    }

    // 4 Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5 Save user details
    user.fullName = fullName;
    user.password = hashedPassword;
    user.organization = organization;
    user.isVerified = true;

    // Clear OTP after verification
    user.otp = undefined;
    user.otpExpires = undefined;

    await ensureUserWallet(user);
    await user.save();

    return NextResponse.json({
      message: "Account verified and created successfully",
    });

  } catch (error: any) {
    return NextResponse.json(
      { message: "Verification failed", error: error.message },
      { status: 500 }
    );
  }
}

