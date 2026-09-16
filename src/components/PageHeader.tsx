"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { House, ChevronDown, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useIsEditor } from "@/lib/auth";

// 全站共用的頁首：左邊首頁、中間標題、右邊導覽列與各頁自己的按鈕。
//
// 導覽列依「跟文章資料的關係」由近到遠分段，中間用分隔線隔開，顏色也一段比
// 一段淡，讓人一眼看出哪些頁是同一份資料：
//   1 直接相關：即時報價、文章列表、貼上文章
//   2 次要相關：追蹤清單、股價比價
// 資料來源完全不同的頁（族群熱度圖來自水溫表）不放進導覽列，收在最右邊的
// 下拉選單裡，選單項目旁標出來源。進到那些頁後只顯示頁名、來源與回報價的連結。
type Tier = 1 | 2;
// icon 有值的項目只顯示圖示，label 退成 tooltip 與無障礙名稱
type NavItem = {
  href: string; label: string; tier: Tier;
  editorOnly?: boolean; icon?: LucideIcon;
};

const MAIN_NAV: NavItem[] = [
  { href: "/stock", label: "即時報價", tier: 1 },
  { href: "/articles", label: "文章列表", tier: 1 },
  { href: "/stock/dmao", label: "貼上文章", tier: 1, editorOnly: true, icon: Plus },
  { href: "/track", label: "追蹤清單", tier: 2 },
  { href: "/compare", label: "股價比價", tier: 2 },
];

// 另一份資料的頁面。標題帶的年月是水溫表本身的版次，換表時跟著改。
const OTHER_PAGES = [
  { href: "/sectors", label: "26/08 族群熱度圖", source: "水溫表" },
];

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

// 回主要頁面的連結：刻意不用藥丸樣式，一眼看得出不是同一組
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

// 其他資料來源的頁面選單
function OtherPagesMenu({ currentHref }: { currentHref: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="其他資料"
        title="其他資料"
        style={{
          ...crossLinkStyle,
          padding: "6px 8px", cursor: "pointer",
          display: "inline-flex", alignItems: "center",
        }}
      >
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40,
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 4, minWidth: 200,
          }}
        >
          {OTHER_PAGES.map((p) => (
            <Link
              key={p.href}
              role="menuitem"
              href={p.href}
              onClick={() => setOpen(false)}
              aria-current={p.href === currentHref ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 6, fontSize: 13,
                textDecoration: "none", whiteSpace: "nowrap",
                color: p.href === currentHref ? "#1a56db" : "#374151",
                fontWeight: p.href === currentHref ? "bold" : "normal",
                background: p.href === currentHref ? "#eff6ff" : "transparent",
              }}
            >
              <span style={{ flex: 1 }}>{p.label}</span>
              <span style={sourceTagStyle}>{p.source}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PageHeader({
  subtitle,
  actions,
}: {
  // 頁面標題不放在頁首——導覽列本身已經標出所在頁面，再放一次大標只是佔寬度。
  // （其他來源的頁沒有導覽列可標，所以那邊會補上頁名。）
  // subtitle 用來擺更新時間、日期區間這類跟著資料變動的小字。
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const editor = useIsEditor();
  const other = OTHER_PAGES.find(
    (p) => pathname === p.href || pathname.startsWith(`${p.href}/`)
  );
  const active = activeHref(pathname);

  const visible = MAIN_NAV.filter((item) => !item.editorOnly || editor);
  const renderPill = (item: NavItem) => {
    const isActive = item.href === active;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={Icon ? item.label : undefined}
        title={Icon ? item.label : undefined}
        style={Icon
          ? { ...pillStyle(item.tier, isActive), padding: "6px 10px", display: "inline-flex", alignItems: "center" }
          : pillStyle(item.tier, isActive)}
      >
        {Icon ? <Icon size={16} strokeWidth={2} /> : item.label}
      </Link>
    );
  };

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
        {other && (
          <>
            <span style={{ fontSize: 15, fontWeight: "bold", color: "#222" }}>{other.label}</span>
            <span style={sourceTagStyle}>{other.source}</span>
          </>
        )}
        {subtitle !== undefined && subtitle !== null && subtitle !== "" && (
          <span style={{ fontSize: 13, color: "#999" }}>{subtitle}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {other ? (
          <Link href="/stock" style={crossLinkStyle}>← 報價</Link>
        ) : (
          <>
            {visible.filter((i) => i.tier === 1).map(renderPill)}
            <Divider />
            {visible.filter((i) => i.tier === 2).map(renderPill)}
            <Divider />
            <OtherPagesMenu currentHref={active} />
          </>
        )}
        {actions}
      </div>
    </div>
  );
}
