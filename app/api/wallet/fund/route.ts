import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import connectDB from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import User from "@/lib/models/User";
import { ensureUserWallet } from "@/lib/wallet";

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

    const { amountEth } = await request.json();
    const amount = Number(amountEth);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await ensureUserWallet(user);

    // Credit the persistent off-chain balance in MongoDB (never resets)
    const prevBalance = Number(user.offchainBalance || 0);
    user.offchainBalance = prevBalance + amount;
    await user.save();

    return NextResponse.json({
      success: true,
      message: `Loaded ${amount} ETH to your wallet. New balance: ${user.offchainBalance.toFixed(4)} ETH`,
      offchainBalance: user.offchainBalance,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
