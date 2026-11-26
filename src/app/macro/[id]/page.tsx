"use client";

import { useParams } from "next/navigation";
import StockDetail from "@/components/StockDetail";
import { macroTicker } from "@/lib/macro";

// 總經儀表板各項目的走勢圖：/macro/sox、/macro/vix…（畫面與 /stock/[ticker] 共用）
export default function MacroDetailPage() {
  const { id } = useParams() as { id: string };
  return <StockDetail ticker={macroTicker(id.toLowerCase())} />;
}
