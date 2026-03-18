import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { categories } from "@/lib/stocks";
import { generateObject } from "ai";
import { z } from "zod";

const allStocks = categories.flatMap((c) =>
  c.stocks.map((s) => ({ ticker: s.ticker, name: s.name, aliases: s.aliases }))
);

const stockListText = allStocks
  .map((s) => {
    const aliases = s.aliases?.length ? `（別名：${s.aliases.join("、")}）` : "";
    return `${s.ticker} ${s.name}${aliases}`;
  })
  .join("\n");

export async function GET() {
  const { data, error } = await getSupabase()
    .from("dmao_articles")
    .select("id, title, source, article_date, article_type, created_at")
    .order("article_date", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, articles: data });
}

export async function POST(req: NextRequest) {
  try {
    const { title, content, source, article_date, images } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { ok: false, error: "title 和 content 為必填" },
        { status: 400 }
      );
    }

    // 1. 用 AI 抽取股票提及 + 財測 EPS
    // 截斷過長的內容，避免超過模型 token 上限
    const MAX_CONTENT_CHARS = 300_000;
    const trimmedContent = content.length > MAX_CONTENT_CHARS
      ? content.slice(0, MAX_CONTENT_CHARS) + "\n\n…（內容過長，已截斷）"
      : content;

    const { object: annotations } = await generateObject({
      model: "google/gemini-3.1-flash-lite-preview",
      schema: z.object({
        article_type: z.enum(["stock", "weekly", "macro", "industry", "other"]).describe("文章分類：stock=個股分析, weekly=產業週報, macro=總經分析, industry=產業分析, other=其他"),
        mentions: z.array(
          z.object({
            ticker: z.string().describe("股票代碼"),
            stock_name: z.string().describe("股票名稱"),
            paragraph: z.string().describe("文章中提及該股票的完整段落原文，或 AI 摘要"),
            is_summary: z.boolean().describe("此段落是否為 AI 摘要（true）或原文（false）"),
          })
        ),
        eps_forecasts: z.array(
          z.object({
            ticker: z.string().describe("股票代碼"),
            stock_name: z.string().describe("股票名稱"),
            forecast_year: z.number().describe("財測年度，例如 2026"),
            eps: z.number().describe("財測 EPS 數值"),
          })
        ),
      }),
      prompt: `你是一位股票分析師。以下是一篇文章，請完成三項任務：

任務一：判斷文章分類（article_type）。
任務二：找出文章中提及的所有股票，並擷取相關段落。
任務三：找出文章中提及的「財測 EPS」預估數字。

任務一規則：
根據文章標題與內容，判斷文章屬於以下哪一類：
- stock：個股分析（標題直接寫某支股票名稱，如「環宇-KY(4991)：營運簡評」「Fabrinet(FN)：財報電話會議摘要」）
- weekly：產業週報（標題含「週報」「周報」，如「台股產業週報 2026/3/22」）
- macro：總經分析（討論景氣、利率、匯率、地緣政治等宏觀議題，如「台灣景氣燈號與領先、同時指標」）
- industry：產業分析（分析特定產業趨勢但非針對單一個股，如「成熟製程晶圓代工產能緊張，PMIC、MCU、Nor Flash醞釀漲價」）
- other：以上皆非

以下是特別關注的股票清單（供參考，但不限於此清單）：
${stockListText}

任務二規則：
1. 找出文章中提及的所有公司，包括台灣上市櫃股票、海外上市股票、以及海外未上市但具知名度的公司（如三菱瓦斯化學MGC、Nittobo、Nexperia等），不限於上述清單。只要文章中明確提及公司名稱，就應該標記
2. 股票代碼格式：台股為純數字（如 4991），海外股票為英文代碼（如 NVDA）。若為未上市或無法確認代碼的公司，ticker 填寫公司英文簡稱或括號內的代號（如 MGC、Nittobo）
3. 段落回傳規則依文章分類而不同：
   - 若 article_type 為 stock（個股分析）：
     a. 標題中的主角股票只回傳「一筆」，paragraph 為 AI 撰寫的全文摘要（涵蓋營收、毛利率、展望等重點），is_summary = true
     b. 其他順帶提及的股票：每個提及段落都回傳，paragraph 為逐字複製的原文，is_summary = false
   - 若 article_type 為 weekly / macro / industry / other：
     a. 同一支股票若在多個段落被提及，每個段落都要回傳（同一支股票可以有多筆，每段一筆）
     b. paragraph 必須是從文章中「逐字複製」的完整段落原文，is_summary = false
4. 非摘要的 paragraph 絕對不可以截斷、刪減、摘要或改寫任何文字。即使段落很長也必須完整複製，不可省略任何內容。特別注意：段落開頭的編號（如「3)」「1.」「(2)」等）也是原文的一部分，必須保留，不可省略
5. 股票名稱可能以簡稱、全名、英文名或代號出現，例如「環宇-KY(4991)」、「台積電」、「TSMC」、「Lumentum」。即使文章只寫公司簡稱而未附代碼，也必須盡力辨識並回傳正確的股票代碼。優先比對上述清單（含別名），若不在清單中但確實為上市公司，仍應回傳
6. 所謂「段落」是指文章中以換行分隔的完整段落，從頭到尾完整複製，不可只取前幾句
7. 文章標題中若包含股票名稱與代碼，也必須辨識並回傳
8. 重要（層級段落合併規則）：若文章採用編號層級結構（例如主段落「2. ...」底下有子段落「a. ...」「b. ...」「c. ...」），處理步驟如下：
   步驟一：掃描主段落和每個子段落，記錄每支股票/公司分別出現在哪些子段落
   步驟二：組合 paragraph 時，一律包含「主段落」＋「該公司實際出現的子段落」，不需要包含該公司未出現的子段落
   步驟三：每支股票各回傳一筆記錄
   範例：若「2. ...NVIDIA...SK Hynix...」底下有「a. ...NVIDIA...台積電...」「b. ...NVIDIA...金居...」「c. ...NVIDIA...」，則：
   - NVIDIA 出現在 2.+a.+b.+c.，paragraph = 2.+a.+b.+c. 全文
   - SK Hynix 只出現在 2.，paragraph = 只有 2. 的原文
   - 台積電 只出現在 a.，paragraph = 2.+a. 的原文
   - 金居 只出現在 b.，paragraph = 2.+b. 的原文
9. 重要：當段落開頭以股票名稱作為主角（例如「6. 威剛(3260)：2025Q4營收...」），該主角股票本身也必須被標記並回傳，不可只標記段落內順帶提及的其他股票而遺漏主角。同一段落中若提及多支股票（包含主角和其他股票），每支股票都應各自產生一筆記錄，共用同一段 paragraph

任務三規則（eps_forecasts）：
1. 只抽取明確寫出「財測EPS」、「預估EPS」等字眼的數字
2. 例如「2026年財測EPS上修至8.20元」→ forecast_year=2026, eps=8.20
3. 例如「2026/2027年財測EPS上修至10.60/17.36元」→ 兩筆：forecast_year=2026, eps=10.60 以及 forecast_year=2027, eps=17.36
4. 若 EPS 為區間，例如「財測EPS上修至19.0~21.0元」，取中間值 (19.0+21.0)/2=20.0 → eps=20.0
5. 每個年度的 EPS 為獨立一筆
6. 找出文章中所有股票的財測 EPS，不限於上述清單

文章標題：${title}
文章內容：
${trimmedContent}`,
    });

    // 2. 文章日期：優先使用前端傳入，否則從標題解析，最後預設今天
    let articleDate = article_date;
    if (!articleDate) {
      const dateMatch = title.match(/^(\d{4})(\d{2})(\d{2})\s/);
      articleDate = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        : new Date().toISOString().slice(0, 10);
    }

    // 3. 存入文章
    const { data: article, error: articleErr } = await getSupabase()
      .from("dmao_articles")
      .insert({ title, content, source: source || null, article_date: articleDate, images: images || [], article_type: annotations.article_type || "other" })
      .select("id")
      .single();

    if (articleErr) {
      return NextResponse.json(
        { ok: false, error: articleErr.message },
        { status: 500 }
      );
    }

    // 4. 存入標記（所有段落都保留，不去重）
    const allMentions = annotations.mentions;

    if (allMentions.length > 0) {
      const rows = allMentions.map((m) => ({
        article_id: article.id,
        ticker: m.ticker,
        stock_name: m.stock_name,
        paragraph: m.paragraph,
        is_summary: m.is_summary || false,
      }));

      const { error: annErr } = await getSupabase()
        .from("dmao_annotations")
        .insert(rows);

      if (annErr) {
        return NextResponse.json(
          { ok: false, error: annErr.message },
          { status: 500 }
        );
      }
    }

    // 5. 存入財測 EPS
    let epsCount = 0;
    if (annotations.eps_forecasts && annotations.eps_forecasts.length > 0) {
      const epsRows = annotations.eps_forecasts.map((f) => ({
        article_id: article.id,
        ticker: f.ticker,
        stock_name: f.stock_name,
        forecast_year: f.forecast_year,
        eps: f.eps,
      }));

      const { error: epsErr } = await getSupabase()
        .from("dmao_eps_forecasts")
        .insert(epsRows);

      if (epsErr) {
        return NextResponse.json(
          { ok: false, error: epsErr.message },
          { status: 500 }
        );
      }
      epsCount = epsRows.length;
    }

    return NextResponse.json({
      ok: true,
      articleId: article.id,
      annotationCount: allMentions.length,
      epsCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
