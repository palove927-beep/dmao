import { NextResponse } from "next/server";
import {
  directFromYahoo, loadHistory, quotesAsOf, recentSignals, resetSignals, syncPrices, syncSignals, type SignalLog,
} from "@/lib/macro-store";
import type { MacroQuote } from "@/lib/macro";

export const dynamic = "force-dynamic";
// 第一次執行（或由一年延長到兩年）要補大量價格並重算訊號，給長一點的時限
export const maxDuration = 60;

export async function GET() {
  let data: Record<string, MacroQuote>;
  let signals: SignalLog[] = [];
  let source: "supabase" | "yahoo" = "supabase";
  let storeError: string | null = null;

  try {
    const { live, backfilled } = await syncPrices();
    // 往前補了舊歷史：兩年均線等指標會變，訊號紀錄整段重算
    if (backfilled) await resetSignals();
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
