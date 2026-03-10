import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import nodemailer from "nodemailer";
import validator from "validator";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!validator.isEmail(email)) {
      return NextResponse.json(
        { message: "Invalid email format" },
        { status: 400 }
      );
    }

    await dbConnect();

    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 400 }
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "lost.link.verify@gmail.com",
        pass: "xokuudwgwtqczzdr",
      },
    });

    await transporter.sendMail({
      from: "lost.link.verify@gmail.com",
      to: email,
      subject: "Password Reset OTP",
      text: `Your password reset OTP is ${otp}. It expires in 5 minutes.`,
    });

    return NextResponse.json({ message: "Reset OTP sent" });

  } catch (error: any) {
    return NextResponse.json(
      { message: "Error sending reset OTP", error: error.message },
      { status: 500 }
    );
  }
}
