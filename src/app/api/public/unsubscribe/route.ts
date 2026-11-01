import { NextRequest, NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/suppression";

// Public endpoint. Supports RFC 8058 one-click POST and the confirm button.
export async function POST(req: NextRequest) {
  let token = "";
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) token = (await req.json())?.token ?? "";
    else {
      const form = await req.formData();
      token = String(form.get("token") ?? "");
    }
  } catch {
    /* ignore */
  }
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const res = await unsubscribeByToken(token);
  return NextResponse.json({ ok: res.ok });
}
