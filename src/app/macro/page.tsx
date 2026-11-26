import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import MacroDashboard from "@/components/MacroDashboard";

// 總經儀表板：2-1「國際股市氛圍與金融市場連動」提到的市場與商品，依課程門檻檢查非常態訊號
export default function MacroPage() {
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 16px 60px", fontFamily: "sans-serif", background: "#fff", color: "#1f2937", minHeight: "100vh" }}>
      <PageHeader />
      <MacroDashboard />
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        各指標的判讀方式見
        <Link href="/atypical#s2-1" style={{ color: "#1a56db", textDecoration: "none", margin: "0 4px" }}>非常態投資筆記 2-1 總經</Link>
        。
      </p>
    </div>
  );
}
