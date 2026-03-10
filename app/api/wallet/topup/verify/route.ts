import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";
import connectDB from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import User from "@/lib/models/User";
import WalletTransaction from "@/lib/models/WalletTransaction";
import { ensureUserWallet, fundWallet } from "@/lib/wallet";

async function getUserIdFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded) return null;
  return decoded.userId;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      razorpayOrderId = "",
      razorpayPaymentId = "",
      razorpaySignature = "",
      amountInr,
    } = await request.json();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        { error: "Missing Razorpay verification fields" },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    if (!keySecret) {
      return NextResponse.json(
        { error: "Razorpay secret is not configured." },
        { status: 503 }
      );
    }

    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });
    }

    const inr = Number(amountInr);
    if (!Number.isFinite(inr) || inr <= 0) {
      return NextResponse.json({ error: "Invalid INR amount." }, { status: 400 });
    }

    const inrPerEth = Number(process.env.RAZORPAY_INR_PER_ETH || "200000");
    if (!Number.isFinite(inrPerEth) || inrPerEth <= 0) {
      return NextResponse.json(
        { error: "Invalid RAZORPAY_INR_PER_ETH server configuration." },
        { status: 500 }
      );
    }

    const creditEth = inr / inrPerEth;
    if (!Number.isFinite(creditEth) || creditEth <= 0) {
      return NextResponse.json({ error: "Calculated ETH credit is invalid." }, { status: 400 });
    }

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await ensureUserWallet(user);

    const existing = await WalletTransaction.findOne({
      paymentMethod: "razorpay",
      txHash: razorpayPaymentId,
      fromUserId: user._id,
      toUserId: user._id,
      itemId: { $exists: false },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Top-up already processed.",
        txHash: existing.txHash,
      });
    }

    const chainTxHash = await fundWallet(user.walletAddress, creditEth);
    if (!chainTxHash) {
      return NextResponse.json(
        {
          error:
            "Payment verified but chain top-up failed. Please retry or contact admin.",
        },
        { status: 503 }
      );
    }

    await WalletTransaction.create({
      fromUserId: user._id,
      toUserId: user._id,
      paymentMethod: "razorpay",
      fromAddress: "razorpay-external",
      toAddress: user.walletAddress,
      amountEth: creditEth,
      txHash: razorpayPaymentId,
      anchorTxHash: razorpayOrderId,
      externalPaymentId: razorpayPaymentId,
      network: "razorpay-sandbox",
      status: "completed",
    });

    return NextResponse.json({
      success: true,
      message: `Top-up success. Credited ${creditEth.toFixed(6)} ETH to project wallet.`,
      txHash: chainTxHash,
      creditedEth: creditEth,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

