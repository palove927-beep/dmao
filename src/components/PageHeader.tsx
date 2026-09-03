"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House } from "lucide-react";
import type { ReactNode } from "react";
import { useIsEditor } from "@/lib/auth";

// 全站共用的頁首：左邊首頁、中間標題、右邊導覽列與各頁自己的按鈕。
// 導覽列每頁都是同一組，目前所在的頁面以實心標示。
const NAV_ITEMS: { href: string; label: string; editorOnly?: boolean }[] = [
  { href: "/stock", label: "即時報價" },
  { href: "/track", label: "追蹤清單" },
  { href: "/compare", label: "股價比價" },
  { href: "/sectors", label: "族群比較" },
  { href: "/articles", label: "文章列表" },
  { href: "/stock/dmao", label: "貼上文章", editorOnly: true },
];

// /stock/dmao 同時符合 /stock 與 /stock/dmao，取最長的才是真正所在的頁
function activeHref(pathname: string): string {
  return (
    NAV_ITEMS.map((i) => i.href)
      .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
      .sort((a, b) => b.length - a.length)[0] ?? ""
  );
}

export default function PageHeader({
  subtitle,
  actions,
}: {
  // 頁面標題不放在頁首——導覽列本身已經標出所在頁面，再放一次大標只是佔寬度。
  // subtitle 用來擺更新時間、日期區間這類跟著資料變動的小字。
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const editor = useIsEditor();
  const active = activeHref(pathname);

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

      <div style={{ flex: 1, minWidth: 0 }}>
        {subtitle !== undefined && subtitle !== null && subtitle !== "" && (
          <span style={{ fontSize: 13, color: "#999", marginLeft: 4 }}>{subtitle}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {NAV_ITEMS.filter((item) => !item.editorOnly || editor).map((item) => {
          const isActive = item.href === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              style={{
                padding: "6px 16px", fontSize: 13, border: "1px solid #1a56db", borderRadius: 6,
                background: isActive ? "#1a56db" : "#fff",
                color: isActive ? "#fff" : "#1a56db",
                fontWeight: isActive ? "bold" : "normal",
                textDecoration: "none", display: "inline-block", whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          );
        })}
        {actions}
      </div>
    </div>
  );
}
