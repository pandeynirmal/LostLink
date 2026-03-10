import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import nodemailer from "nodemailer";
import validator from "validator";
import { getMaxListeners } from "events";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    // 1 Validate email format
    if (!validator.isEmail(email)) {
      return NextResponse.json(
        { message: "Invalid email format" },
        { status: 400 }
      );
    }
    const domain = email.split("@")[1];

const allowedDomains = ["gmail.com", "yahoo.com", "outlook.com"];

if (!allowedDomains.includes(domain.toLowerCase())) {
  return NextResponse.json(
    { message: "Unsupported email domain" },
    { status: 400 }
  );
}

    

    await dbConnect();

    // 2 Check if already verified user exists
    const existingUser = await User.findOne({ email });

    if (existingUser && existingUser.isVerified) {
      return NextResponse.json(
        { message: "User already exists" },
        { status: 400 }
      );
    }

    // 3 Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 4 OTP valid for 5 minutes
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    // 5 Save or update user with OTP
    await User.findOneAndUpdate(
      { email },
      { otp, otpExpires, isVerified: false },
      { upsert: true, new: true }
    );

    // 6 Send OTP email
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
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
    });

    return NextResponse.json({ message: "OTP sent successfully" });

  } catch (error: any) {
    return NextResponse.json(
      { message: "Error sending OTP", error: error.message },
      { status: 500 }
    );
  }
}

