// 群組分享碼：/track 的追蹤群組與 /compare 的比價群組共用同一組編碼，
// 兩邊的群組可以互相複製貼上（比價群組沒有張數/持倉，解碼時忽略即可）。

export type ShareStock = { ticker: string; name: string; lots?: number };
export type ShareGroup = { name: string; holding?: boolean; stocks: ShareStock[] };

export const SHARE_PREFIX = "DMAO1-";

export function encodeGroup(g: ShareGroup): string {
  const payload = {
    v: 1,
    name: g.name,
    h: g.holding ? 1 : 0,
    s: g.stocks.map((x) => (x.lots != null ? [x.ticker, x.name, x.lots] : [x.ticker, x.name])),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const b64 = btoa(String.fromCharCode(...bytes));
  return SHARE_PREFIX + b64;
}

export function decodeGroup(code: string): ShareGroup | null {
  try {
    const raw = code.trim().replace(/^DMAO1-/, "");
    if (!raw) return null;
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (!p || typeof p.name !== "string" || !Array.isArray(p.s)) return null;
    const seen = new Set<string>();
    const stocks: ShareStock[] = [];
    for (const it of p.s) {
      if (Array.isArray(it) && typeof it[0] === "string" && typeof it[1] === "string" && !seen.has(it[0])) {
        seen.add(it[0]);
        const lots = typeof it[2] === "number" && isFinite(it[2]) && it[2] > 0 ? it[2] : undefined;
        stocks.push({ ticker: it[0], name: it[1], lots });
      }
    }
    return { name: String(p.name).slice(0, 40) || "匯入群組", holding: !!p.h, stocks };
  } catch {
    return null;
  }
}
