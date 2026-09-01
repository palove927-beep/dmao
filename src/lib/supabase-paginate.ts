// Supabase 對單次查詢有回傳列數上限（Project Settings → API → Max rows，預設 1000）。
// 超過的部分不會報錯，而是無聲少給，症狀通常是「資料明明存在，畫面卻顯示沒有」。
// 凡是需要「整批」資料而非單筆／單一股票的查詢，都要走這裡分頁讀完。
//
// 重要：呼叫端的 query 必須以「唯一」的欄位收尾排序（例如 .order("id")）。
// range 分頁靠的是穩定的全序，排序有並列時同一列可能重複出現或整列被跳過。

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options?: { pageSize?: number; maxPages?: number },
): Promise<{ rows: T[]; error: string | null }> {
  const pageSize = options?.pageSize ?? 1000;
  // 安全上限，避免回應異常時變成無窮迴圈
  const maxPages = options?.maxPages ?? 500;

  const rows: T[] = [];
  let from = 0;

  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { rows, error: error.message };

    const batch = data ?? [];
    if (batch.length === 0) break;

    // 展開推入（push(...batch)）在批次很大時會爆呼叫堆疊，逐筆加
    for (const row of batch) rows.push(row);

    // 前進量取實際回傳筆數而非 pageSize，Max rows 被設成小於 pageSize 也不會漏
    from += batch.length;
  }

  return { rows, error: null };
}
