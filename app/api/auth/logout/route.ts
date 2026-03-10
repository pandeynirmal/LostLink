import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out" });

  response.cookies.set("token", "", {
  expires: new Date(0),
  path: "/",
  httpOnly: true,
  sameSite: "lax",
});
  return response;
}