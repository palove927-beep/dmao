import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { src, article_date } = await req.json();

    if (!src || typeof src !== "string") {
      return NextResponse.json({ ok: false, error: "No src" }, { status: 400 });
    }

    // Download image server-side (avoids CORS)
    const res = await fetch(src, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Fetch failed: ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());

    const dateStr = (article_date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
    const rand = crypto.randomBytes(3).toString("hex");
    const ext = contentType.split("/")[1]?.split(";")[0] || "png";
    const key = `articles/${dateStr}-${rand}.${ext}`;

    await getR2().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const url = `${R2_PUBLIC_URL}/${key}`;
    return NextResponse.json({ ok: true, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
