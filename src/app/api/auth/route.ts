import { NextRequest, NextResponse } from "next/server";
import {
  EDITOR_COOKIE,
  EDITOR_COOKIE_MAX_AGE,
  checkEditorCode,
  isEditorRequest,
  issueEditorToken,
} from "@/lib/editor-auth";

// 目前 cookie 是否仍有效（前端用來同步登入狀態）
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, editor: isEditorRequest(req) });
}

// 登入：代碼正確就發 httpOnly cookie
export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({ code: null }));

  if (!checkEditorCode(code)) {
    // 拖慢暴力猜碼
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ ok: false, error: "代碼錯誤" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(EDITOR_COOKIE, issueEditorToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: EDITOR_COOKIE_MAX_AGE,
  });
  return res;
}

// 登出
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(EDITOR_COOKIE);
  return res;
}
