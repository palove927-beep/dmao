-- 在 Supabase Dashboard → SQL Editor 執行此 SQL

create table dmao_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  source text,
  article_date date default current_date,
  images text[] default '{}',
  article_type text default 'other',
  created_at timestamptz default now()
);

-- article_type 值：stock (個股分析), weekly (產業週報), macro (總經分析), industry (產業分析), other

create table dmao_annotations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references dmao_articles(id) on delete cascade,
  ticker text not null,
  stock_name text not null,
  paragraph text not null,
  is_summary boolean default false,
  created_at timestamptz default now()
);

create index idx_dmao_annotations_ticker on dmao_annotations(ticker);
create index idx_dmao_annotations_article_id on dmao_annotations(article_id);

create table dmao_eps_forecasts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references dmao_articles(id) on delete cascade,
  ticker text not null,
  stock_name text not null,
  forecast_year int not null,
  eps numeric(10,2) not null,
  prev_eps numeric(10,2),
  created_at timestamptz default now()
);

create index idx_dmao_eps_forecasts_ticker on dmao_eps_forecasts(ticker);
create index idx_dmao_eps_forecasts_article_id on dmao_eps_forecasts(article_id);
