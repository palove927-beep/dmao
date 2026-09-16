"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House } from "lucide-react";
import type { ReactNode } from "react";
import { useIsEditor } from "@/lib/auth";

// 全站共用的頁首：左邊首頁、中間標題、右邊導覽列與各頁自己的按鈕。
//
// 導覽列依「跟文章資料的關係」由近到遠分三段，中間用分隔線隔開，顏色也一段比
// 一段淡，讓人一眼看出哪些頁是同一份資料：
//   1 直接相關：即時報價、文章列表、貼上文章
//   2 次要相關：追蹤清單、股價比價
//   3 無關：族群比較 —— 資料來自另外的水溫表，退成右側的次要連結
// 進到族群頁後不再列出前兩段，只顯示頁名、來源標籤與回報價的連結。
type Tier = 1 | 2;
type NavItem = { href: string; label: string; tier: Tier; editorOnly?: boolean };

const MAIN_NAV: NavItem[] = [
  { href: "/stock", label: "即時報價", tier: 1 },
  { href: "/articles", label: "文章列表", tier: 1 },
  { href: "/stock/dmao", label: "貼上文章", tier: 1, editorOnly: true },
  { href: "/track", label: "追蹤清單", tier: 2 },
  { href: "/compare", label: "股價比價", tier: 2 },
];

const SECTOR = { href: "/sectors", label: "族群比較", source: "水溫表" };

// 第一段用主色，第二段刻意調淡，視覺上就分得出親疏
const TIER_COLOR: Record<Tier, string> = { 1: "#1a56db", 2: "#64748b" };

// /stock/dmao 同時符合 /stock 與 /stock/dmao，取最長的才是真正所在的頁
function activeHref(pathname: string): string {
  return (
    MAIN_NAV.map((i) => i.href)
      .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
      .sort((a, b) => b.length - a.length)[0] ?? ""
  );
}

const pillStyle = (tier: Tier, isActive: boolean) => ({
  padding: "6px 16px", fontSize: 13, borderRadius: 6,
  border: `1px solid ${TIER_COLOR[tier]}`,
  background: isActive ? TIER_COLOR[tier] : "#fff",
  color: isActive ? "#fff" : TIER_COLOR[tier],
  fontWeight: isActive ? ("bold" as const) : ("normal" as const),
  textDecoration: "none", display: "inline-block", whiteSpace: "nowrap" as const,
});

// 另一份資料的入口：刻意不用藥丸樣式，一眼看得出不是同一組
const crossLinkStyle = {
  padding: "6px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6,
  background: "#fff", color: "#6b7280", textDecoration: "none",
  display: "inline-block", whiteSpace: "nowrap" as const,
};

const sourceTagStyle = {
  fontSize: 11, color: "#6b7280", background: "#f3f4f6",
  border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 7px",
  whiteSpace: "nowrap" as const,
};

function Divider() {
  return <span aria-hidden style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 2px" }} />;
}

export default function PageHeader({
  subtitle,
  actions,
}: {
  // 頁面標題不放在頁首——導覽列本身已經標出所在頁面，再放一次大標只是佔寬度。
  // （族群頁沒有導覽列可標，所以那邊會補上頁名。）
  // subtitle 用來擺更新時間、日期區間這類跟著資料變動的小字。
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const editor = useIsEditor();
  const isSector = pathname === SECTOR.href || pathname.startsWith(`${SECTOR.href}/`);
  const active = activeHref(pathname);

  const visible = MAIN_NAV.filter((item) => !item.editorOnly || editor);
  const renderPill = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={item.href === active ? "page" : undefined}
      style={pillStyle(item.tier, item.href === active)}
    >
      {item.label}
    </Link>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, flexWrap: "wrap", margin: "16px 0 20px",
    }}>
      <Link
        href="/"
        title="首頁"
        style={{ color: "#1a56db", textDecoration: "none", display: "flex", alignItems: "center" }}
      >
        <House size={20} strokeWidth={1.75} />
      </Link>

      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {isSector && (
          <>
            <span style={{ fontSize: 15, fontWeight: "bold", color: "#222" }}>{SECTOR.label}</span>
            <span style={sourceTagStyle}>{SECTOR.source}</span>
          </>
        )}
        {subtitle !== undefined && subtitle !== null && subtitle !== "" && (
          <span style={{ fontSize: 13, color: "#999" }}>{subtitle}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {isSector ? (
          <Link href="/stock" style={crossLinkStyle}>← 報價</Link>
        ) : (
          <>
            {visible.filter((i) => i.tier === 1).map(renderPill)}
            <Divider />
            {visible.filter((i) => i.tier === 2).map(renderPill)}
            <Divider />
            <Link href={SECTOR.href} style={crossLinkStyle}>{SECTOR.label} ↗</Link>
          </>
        )}
        {actions}
      </div>
    </div>
  );
}
