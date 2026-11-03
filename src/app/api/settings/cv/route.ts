import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getOwner } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = "/var/lib/yarqat/uploads";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const OK_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// Upload the candidate's CV for job-search mode. Attached to job-outreach emails.
export async function POST(req: NextRequest) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const file = form.get("cv");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a CV file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "CV too large (max 8 MB)." }, { status: 400 });
  const ext = OK_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Upload a PDF or Word document." }, { status: 400 });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `cv-${randomUUID()}.${ext}`;
  await writeFile(`${UPLOAD_DIR}/${name}`, Buffer.from(await file.arrayBuffer()));

  const original = (file.name || `CV.${ext}`).slice(0, 160);
  const settings = await getSettings();
  await prisma.globalSettings.update({ where: { id: settings.id }, data: { cvPath: name, cvName: original } });

  return NextResponse.json({ ok: true, name: original });
}
