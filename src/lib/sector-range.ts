// 頁面與 API 共用的區間定義（route.ts 只能匯出 Next 認得的東西，因此獨立一支）
export type RangeKey = "1w" | "2w" | "1m" | "3m" | "6m" | "ytd" | "1y";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1w", label: "一週" },
  { key: "2w", label: "兩週" },
  { key: "1m", label: "一個月" },
  { key: "3m", label: "三個月" },
  { key: "6m", label: "半年" },
  { key: "ytd", label: "今年以來" },
  { key: "1y", label: "一年" },
];

// 往回推 n 個月，日數超過目標月份長度時夾到月底。
// 直接用 setMonth(-1) 會溢位：3/31 會變成 3/3（2/31 進位），
// 「一個月」就縮成三天。
function monthsAgo(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const r = new Date(d);
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() - n);
  const daysInMonth = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, daysInMonth));
  return r;
}

export function baseDateFor(range: RangeKey, now = new Date()): string {
  const d = new Date(now);
  if (range === "1w") d.setUTCDate(d.getUTCDate() - 7);
  else if (range === "2w") d.setUTCDate(d.getUTCDate() - 14);
  else if (range === "1m") return monthsAgo(d, 1).toISOString().slice(0, 10);
  else if (range === "3m") return monthsAgo(d, 3).toISOString().slice(0, 10);
  else if (range === "6m") return monthsAgo(d, 6).toISOString().slice(0, 10);
  else if (range === "1y") return monthsAgo(d, 12).toISOString().slice(0, 10);
  else if (range === "ytd") return `${d.getUTCFullYear()}-01-01`;
  return d.toISOString().slice(0, 10);
}
