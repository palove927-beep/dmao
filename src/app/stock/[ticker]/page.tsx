"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import StockDetail from "@/components/StockDetail";

export default function StockDetailPage() {
  const { ticker } = useParams() as { ticker: string };
  const router = useRouter();
  // 總經項目的舊網址 /stock/macro-sox → /macro/sox
  const macroKey = /^macro-(\w+)$/i.exec(ticker)?.[1];
  useEffect(() => {
    if (macroKey) router.replace(`/macro/${macroKey.toLowerCase()}`);
  }, [macroKey, router]);
  if (macroKey) return null;
  return <StockDetail ticker={ticker} />;
}
