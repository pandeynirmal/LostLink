import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function requireAdmin() {
  await dbConnect();

  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    throw new Error("Unauthorized");
  }

  const decoded: any = jwt.verify(token, JWT_SECRET);

  const user = await User.findById(decoded.userId);

  if (!user || user.role !== "admin") {
    throw new Error("Forbidden");
  }

  return user;
}