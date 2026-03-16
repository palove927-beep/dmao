-- 在 Supabase Dashboard → SQL Editor 執行此 SQL

create table articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  source text,
  article_date date default current_date,
  images text[] default '{}',
  created_at timestamptz default now()
);

create table annotations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  ticker text not null,
  stock_name text not null,
  paragraph text not null,
  created_at timestamptz default now()
);

create index idx_annotations_ticker on annotations(ticker);
create index idx_annotations_article_id on annotations(article_id);

create table eps_forecasts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  ticker text not null,
  stock_name text not null,
  forecast_year int not null,
  eps numeric(10,2) not null,
  prev_eps numeric(10,2),
  created_at timestamptz default now()
);

create index idx_eps_forecasts_ticker on eps_forecasts(ticker);
create index idx_eps_forecasts_article_id on eps_forecasts(article_id);
