import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import User from "@/lib/models/User";
import dbConnect from "@/lib/db";
import { getBlockchainStatus, getContractBalance } from "@/lib/blockchain";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("token")?.value;

        if (!token) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return NextResponse.json({ message: "Invalid token" }, { status: 401 });
        }

        await dbConnect();
        const admin = await User.findById(decoded.userId);

        if (!admin || admin.role !== "admin") {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        const status = await getBlockchainStatus();
        const balance = await getContractBalance();

        return NextResponse.json({
            status,
            balance,
        });

    } catch (error) {
        return NextResponse.json(
            { message: "Server error" },
            { status: 500 }
        );
    }
}