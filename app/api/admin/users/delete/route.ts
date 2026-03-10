import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function DELETE(req: Request) {
  try {
    await dbConnect();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const decoded: any = jwt.verify(token, JWT_SECRET);

    const currentUser = await User.findById(decoded.userId);

    if (!currentUser || currentUser.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ message: "User ID required" }, { status: 400 });
    }

    //  Prevent deleting yourself
    if (userId === currentUser._id.toString()) {
      return NextResponse.json(
        { message: "You cannot delete yourself." },
        { status: 400 }
      );
    }

    const userToDelete = await User.findById(userId);

    if (!userToDelete) {
      return NextResponse.json(
        { message: "User not found." },
        { status: 404 }
      );
    }

    //  Prevent deleting last admin
    if (userToDelete.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });

      if (adminCount <= 1) {
        return NextResponse.json(
          { message: "Cannot delete the last admin." },
          { status: 400 }
        );
      }
    }

    await User.findByIdAndDelete(userId);

    return NextResponse.json(
      { message: "User deleted successfully." },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Invalid token." },
      { status: 401 }
    );
  }
}
