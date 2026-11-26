import { NextResponse } from "next/server";
import { MACRO_INSTRUMENTS, buildQuote, type MacroQuote } from "@/lib/macro";

export const dynamic = "force-dynamic";

const UA = { "User-Agent": "Mozilla/5.0" };

async function fetchOne(key: string, symbol: string): Promise<MacroQuote> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`,
      { headers: UA, cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(String(res.status));
    const r = (await res.json())?.chart?.result?.[0];
    return buildQuote(key, r?.meta, r?.indicators?.quote?.[0]?.close ?? [], r?.timestamp ?? []);
  } catch {
    return buildQuote(key, undefined, [], []);
  }
}

export async function GET() {
  const quotes = await Promise.all(MACRO_INSTRUMENTS.map((m) => fetchOne(m.key, m.symbol)));
  const data: Record<string, MacroQuote> = {};
  for (const q of quotes) data[q.key] = q;
  return NextResponse.json(
    { ok: true, data, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } },
  );
}
