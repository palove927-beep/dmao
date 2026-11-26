import { NextRequest, NextResponse } from "next/server";
import { fetchUsQuotes } from "@/lib/us-quote";
import { stockNameOr } from "@/lib/stock-name";
import { findMacro } from "@/lib/macro";
import type { TrackQuote } from "@/app/api/track/route";

export const dynamic = "force-dynamic";

// 美股即時報價，回傳形狀與 /api/track 相同，個股頁可共用同一套顯示
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("ticker") ?? "").trim();
  // 總經儀表板的項目（macro-sox）：用對應的 Yahoo 代號查；櫃買、美債 2 年期沒有 Yahoo 即時價
  const macro = findMacro(raw);
  const ticker = macro ? raw : raw.toUpperCase();
  if (!macro && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "ticker 格式不正確" }, { status: 400 });
  }
  if (macro?.source) return NextResponse.json({ ok: false, error: "此項目沒有即時報價" }, { status: 404 });
  const [q] = await fetchUsQuotes([macro ? macro.symbol : ticker]);
  if (!q) return NextResponse.json({ ok: false, error: "查無報價" }, { status: 404 });

  const change =
    q.price !== null && q.yesterday !== null ? Math.round((q.price - q.yesterday) * 100) / 100 : null;
  const changePercent =
    change !== null && q.yesterday ? Math.round((change / q.yesterday) * 10000) / 100 : null;
  const data: Record<string, TrackQuote> = {
    [ticker]: {
      ticker,
      name: stockNameOr(ticker),
      price: q.price,
      change,
      changePercent,
      open: null,
      high: null,
      low: null,
      yesterday: q.yesterday,
      volume: null,
      limit: null,
    },
  };
  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } },
  );
}
