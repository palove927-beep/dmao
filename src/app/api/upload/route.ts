import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
    }

    const articleDate = (formData.get("article_date") as string) || new Date().toISOString().slice(0, 10);
    const dateStr = articleDate.replace(/-/g, "");
    const rand = crypto.randomBytes(3).toString("hex"); // 6 chars
    const ext = file.name.split(".").pop() || "png";
    const key = `articles/${dateStr}-${rand}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    await getR2().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    const url = `${R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ ok: true, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
