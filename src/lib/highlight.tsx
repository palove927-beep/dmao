import React from "react";

// 文章內文用 ==文字== 標記重點，渲染成黃底 <mark>。
// 這段語法原本只有 /articles/[id] 認得，/stock 與 /stock/[ticker] 的標記面板
// 直接把段落丟給關鍵字標色，==...== 就會原樣印出來、重點段落不會變黃底。
const MARKER_RE = /(==.+?==)/g;

type StockLike = { ticker: string; stock_name: string; aliases?: string[] };

type AnnotationLike = {
  ticker: string;
  stock_name: string;
  aliases?: string[];
  // 同段落中所有被標記的個股（含其他股票），由 /api/annotations 回傳
  paragraph_stocks?: StockLike[];
};

// 段落內要標色的關鍵字：同段落所有被標記的個股（名稱／代碼／別名）；
// 舊資料若沒有 paragraph_stocks，退回只標這檔自己
export function annotationKeywords(ann: AnnotationLike): string[] {
  const stocks: StockLike[] = ann.paragraph_stocks?.length
    ? ann.paragraph_stocks
    : [{ ticker: ann.ticker, stock_name: ann.stock_name, aliases: ann.aliases }];
  return stocks.flatMap((s) => [s.stock_name, s.ticker, ...(s.aliases ?? [])]);
}

// 固定標成外框標籤的詞（不論段落有沒有標記個股都會標）。
// 比對時長的優先，所以「根據定錨研調」會整段標成一個標籤；
// 不在這些片語裡的「定錨」仍單獨標。
const TAG_TERMS = ["根據定錨研調", "定錨預估", "定錨觀點", "定錨認為", "定錨"];
const TAG_STYLE: React.CSSProperties = {
  color: "#1d4ed8",
  background: "#eff6ff",
  border: "1px solid #93c5fd",
  borderRadius: 4,
  padding: "0 4px",
  margin: "0 1px",
  fontWeight: 600,
};

// 把段落裡的個股名稱／代碼／別名標成紅字，「定錨」標成藍色外框標籤
export function highlightKeywords(text: string, keywords: string[]): React.ReactNode[] {
  const tagSet = new Set(TAG_TERMS);
  const filtered = [...new Set(keywords.filter((k) => k && !tagSet.has(k)))];
  const all = [...filtered, ...TAG_TERMS];
  // 英數關鍵字要求前後不得接英數字元，否則 SEMCO 裡的 EMC 會被標色；
  // 中文沒有詞界，維持原樣。長的排前面，南亞科 才不會被 南亞 先吃掉。
  const escaped = [...all]
    .sort((a, b) => b.length - a.length)
    .map((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return /^[\x00-\x7F]+$/.test(k) ? `(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])` : esc;
    });
  const regex = new RegExp(`(${escaped.join("|")})`, "g");
  const kw = new Set(filtered);
  return text.split(regex).map((part, i) =>
    tagSet.has(part) ? (
      <span key={i} style={TAG_STYLE}>{part}</span>
    ) : kw.has(part) ? (
      <span key={i} style={{ color: "#dc2626", fontWeight: 600 }}>{part}</span>
    ) : (
      part
    )
  );
}

// 段落渲染：先切出 ==...== 重點區塊，區塊內外都再做關鍵字標色
export function renderParagraph(text: string, keywords: string[]): React.ReactNode {
  const parts = text.split(MARKER_RE);
  if (parts.length === 1) return highlightKeywords(text, keywords);
  return parts.map((part, i) => {
    if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
      const inner = part.slice(2, -2);
      return (
        <mark key={i} style={{ background: "#fef08a", padding: "1px 3px", borderRadius: 3 }}>
          {highlightKeywords(inner, keywords)}
        </mark>
      );
    }
    return <span key={i}>{highlightKeywords(part, keywords)}</span>;
  });
}
