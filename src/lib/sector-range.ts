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
