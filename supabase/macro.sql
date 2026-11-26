-- 總經儀表板（/macro）：國際市場與商品的每日收盤、非常態訊號紀錄
-- 在 Supabase → SQL Editor 執行一次即可

create table if not exists macro_prices (
  key text not null,            -- 對應 src/lib/macro.ts 的 MACRO_INSTRUMENTS.key（如 sox、vix）
  date date not null,           -- 交易日（交易所當地日期）
  close numeric not null,
  updated_at timestamptz default now(),
  primary key (key, date)
);

create table if not exists macro_signals (
  date date not null,
  signal_key text not null,     -- 訊號代號（如 vix_30、dxy_up）
  level text not null,          -- alert／watch
  title text not null,
  meaning text not null,
  created_at timestamptz default now(),
  primary key (date, signal_key)
);

-- 已經檢查過訊號的日期（沒有觸發任何訊號的日子也記一筆，才不會每次重算）
create table if not exists macro_signal_days (
  date date primary key,
  signal_count int not null default 0,
  updated_at timestamptz default now()
);

create index if not exists idx_macro_prices_date on macro_prices(date);

-- 只允許伺服器端（service role）讀寫
alter table macro_prices enable row level security;
alter table macro_signals enable row level security;
alter table macro_signal_days enable row level security;
