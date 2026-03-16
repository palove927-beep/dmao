# 文章標記功能實作計畫

## 架構概覽

```
使用者貼上文章 → API → Vercel AI Gateway (Gemini) → 抽取股票+段落 → 存入 Supabase
                                                                         ↓
Stock 頁面 ← 查詢標記資料 ← Supabase (articles + annotations 表)
```

## 資料庫設計 (Supabase PostgreSQL)

### articles 表
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | 文章 ID |
| title | text | 文章標題 |
| content | text | 全文內容 |
| source | text | 來源 (選填) |
| created_at | timestamptz | 建立時間 |

### annotations 表
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | 標記 ID |
| article_id | uuid (FK) | 關聯文章 |
| ticker | text | 股票代碼 (e.g. "2330") |
| stock_name | text | 股票名稱 |
| paragraph | text | 被標記的段落 |
| created_at | timestamptz | 建立時間 |

## 實作步驟

### 1. 安裝依賴
- `@supabase/supabase-js` — Supabase client
- `ai` + `@ai-sdk/google` — Vercel AI SDK + Google provider (含 AI Gateway 支援)

### 2. Supabase 設定
- 在 `.env.local` 加入 `NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`
- 建立 `src/lib/supabase.ts` server client

### 3. 資料庫 Migration SQL
- 提供 SQL 讓使用者在 Supabase Dashboard 執行建表

### 4. API Routes
- `POST /api/articles` — 接收文章 → 呼叫 AI 抽取股票提及 → 存文章+標記
- `GET /api/annotations?ticker=XXX` — 查詢某股票的所有標記
- `GET /api/articles/[id]` — 取得文章全文

### 5. 前端 UI
- `/stock` 頁面：每支股票行新增下拉按鈕 (展開/收合)
  - 展開後顯示該股票被標記的段落列表
  - 每段落旁有「查看全文」連結
- `/stock` 頁面頂部：新增「貼上文章」按鈕 → 彈出表單 (textarea + 標題欄位)
- `/articles/[id]` 頁面：顯示文章全文，標記段落高亮

### 6. AI Prompt 設計
- 輸入：文章全文 + 股票清單 (從 stocks.ts 取得)
- 輸出：JSON 陣列 `[{ ticker, stock_name, paragraph }]`
- 使用 Vercel AI SDK 的 `generateObject` + zod schema
