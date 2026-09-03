// 台股交易日的共用判斷。原本只寫在 stock-history 裡，
// 族群頁要判斷哪些個股該補資料時也需要同一套規則。

export function taiwanToday(): string {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  return tw.toISOString().slice(0, 10);
}

// 手上最新一筆的日期是否已經落後。週末與週一收盤前不算落後，
// 否則整個週末都會被判定成要補資料。
export function isStale(latestDate: string): boolean {
  const today = taiwanToday();
  if (latestDate >= today) return false;
  const twNow = new Date(Date.now() + 8 * 3600 * 1000);
  const dayOfWeek = twNow.getUTCDay();
  // Saturday: latest should be Friday (1 day ago)
  // Sunday: latest should be Friday (2 days ago)
  // Monday before 15:00: latest should be Friday (3 days ago at most)
  const diff = (new Date(today).getTime() - new Date(latestDate).getTime()) / (24 * 3600 * 1000);
  if (dayOfWeek === 6) return diff > 1; // Saturday
  if (dayOfWeek === 0) return diff > 2; // Sunday
  if (dayOfWeek === 1 && twNow.getUTCHours() < 7) return diff > 3; // Monday before 15:00 TW (07:00 UTC)
  return diff > 1;
}
