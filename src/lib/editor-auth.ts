import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

// 伺服器端的編輯權限驗證。
// 以前編輯代碼寫在前端（src/lib/auth.ts），只能擋住畫面上的按鈕，
// 任何人直接打 API 仍可新增／刪除文章與標記。現在寫入類 API 一律要檢查
// httpOnly cookie，cookie 只能透過 /api/auth 用正確代碼換到。

export const EDITOR_COOKIE = "dmao_editor_token";
export const EDITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 一年

// 編輯代碼：請在 Vercel 設定 EDITOR_CODE。
// 未設定時暫時沿用舊代碼，部署後不會把編輯者鎖在外面；設定後舊代碼即失效。
function editorCode(): string {
  const code = process.env.EDITOR_CODE;
  if (code) return code;
  console.warn("[editor-auth] 未設定 EDITOR_CODE，暫用舊的預設代碼，請盡快設定");
  return "0800";
}

// 簽章金鑰：優先用 EDITOR_SECRET，未設定就借用同樣只存在伺服器端的 service role key。
function signingKey(): string {
  const key = process.env.EDITOR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing EDITOR_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

// token 綁定代碼：換了 EDITOR_CODE，已發出的 cookie 自動失效
function expectedToken(): string {
  return crypto
    .createHmac("sha256", signingKey())
    .update(`dmao-editor:${editorCode()}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function checkEditorCode(code: unknown): boolean {
  return typeof code === "string" && safeEqual(code, editorCode());
}

export function issueEditorToken(): string {
  return expectedToken();
}

export function isEditorRequest(req: NextRequest): boolean {
  const token = req.cookies.get(EDITOR_COOKIE)?.value;
  return !!token && safeEqual(token, expectedToken());
}

// 寫入類 API 開頭呼叫：未登入回 401，已登入回 null
export function requireEditor(req: NextRequest): NextResponse | null {
  if (isEditorRequest(req)) return null;
  return NextResponse.json(
    { ok: false, error: "需要編輯權限，請重新登入編輯模式" },
    { status: 401 },
  );
}
