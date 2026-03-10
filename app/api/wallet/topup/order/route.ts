import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

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

    const { amountInr } = await request.json();
    const inr = Number(amountInr);
    if (!Number.isFinite(inr) || inr <= 0) {
      return NextResponse.json({ error: "Invalid INR amount" }, { status: 400 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || "";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: "Razorpay is not configured on server." },
        { status: 503 }
      );
    }

    const amountPaise = Math.round(inr * 100);
    const receipt = `topup_${userId}_${Date.now()}`;
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: {
          userId,
          purpose: "wallet_topup",
        },
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      return NextResponse.json(
        { error: orderData?.error?.description || "Failed to create Razorpay order" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      keyId,
      orderId: orderData.id,
      amountInr: inr,
      amountPaise,
      currency: "INR",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

