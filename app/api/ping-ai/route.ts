import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(`${process.env.PYTHON_SERVICE_URL}/health`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json({ success: true, ai: data });
  } catch {
    return NextResponse.json({ success: false });
  }
}