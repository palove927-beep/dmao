import { NextResponse } from "next/server";
import {
  directFromYahoo, loadHistory, quotesAsOf, recentSignals, syncPrices, syncSignals, type SignalLog,
} from "@/lib/macro-store";
import type { MacroQuote } from "@/lib/macro";

export const dynamic = "force-dynamic";
// 第一次執行要補一年的價格與訊號，給長一點的時限
export const maxDuration = 60;

export async function GET() {
  let data: Record<string, MacroQuote>;
  let signals: SignalLog[] = [];
  let source: "supabase" | "yahoo" = "supabase";
  let storeError: string | null = null;

  try {
    const live = await syncPrices();
    const history = await loadHistory();
    await syncSignals(history);
    data = quotesAsOf(history, undefined, live);
    signals = await recentSignals(365);
  } catch (e) {
    // 資料表尚未建立或 Supabase 無法連線：退回直接抓 Yahoo，頁面照常顯示
    storeError = e instanceof Error ? e.message : String(e);
    source = "yahoo";
    data = await directFromYahoo();
  }

  return NextResponse.json(
    { ok: true, data, signals, source, storeError, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } },
  );
}
