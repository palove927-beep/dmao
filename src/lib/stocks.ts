export type Stock = {
  code: string;
  ticker: string;
  name: string;
  aliases?: string[];
};

export type Category = {
  id: string;
  label: string;
  stocks: Stock[];
};

export const categories: Category[] = [
  {
    id: "A",
    label: "IC設計",
    stocks: [
      { code: "A1", ticker: "2379", name: "瑞昱", aliases: ["Realtek"] },
      { code: "A2", ticker: "2454", name: "聯發科", aliases: ["MediaTek"] },
      { code: "A3", ticker: "5274", name: "信驊", aliases: ["Aspeed"] },
    ],
  },
  {
    id: "B",
    label: "晶圓代工",
    stocks: [
      { code: "B1", ticker: "2303", name: "聯電", aliases: ["UMC"] },
      { code: "B2", ticker: "2330", name: "台積電", aliases: ["TSMC", "台積"] },
      { code: "B3", ticker: "5347", name: "世界", aliases: ["VIS"] },
    ],
  },
  {
    id: "C",
    label: "半導體封測",
    stocks: [
      { code: "C1", ticker: "3711", name: "日月光", aliases: ["ASE", "日月光投控"] },
      { code: "C2", ticker: "6239", name: "力成", aliases: ["PTI"] },
      { code: "C3", ticker: "6257", name: "矽格", aliases: ["Sigurd"] },
    ],
  },
  {
    id: "D",
    label: "半導體檢測",
    stocks: [{ code: "D1", ticker: "3587", name: "閎康" }],
  },
  {
    id: "E",
    label: "半導體耗材",
    stocks: [
      { code: "E1", ticker: "1560", name: "中砂", aliases: ["KINIK"] },
      { code: "E2", ticker: "1727", name: "中華化", aliases: ["中華化學"] },
      { code: "E3", ticker: "3680", name: "家登", aliases: ["Gudeng"] },
      { code: "E4", ticker: "6488", name: "環球晶", aliases: ["GlobalWafers"] },
    ],
  },
  {
    id: "F",
    label: "半導體廠務",
    stocks: [
      { code: "F1", ticker: "2404", name: "漢唐" },
      { code: "F2", ticker: "6196", name: "帆宣" },
      { code: "F3", ticker: "6826", name: "和淞" },
    ],
  },
  {
    id: "G",
    label: "半導體設備",
    stocks: [
      { code: "G01", ticker: "2467", name: "志聖" },
      { code: "G02", ticker: "3131", name: "弘塑" },
      { code: "G03", ticker: "3455", name: "由田" },
      { code: "G04", ticker: "6438", name: "迅得" },
      { code: "G05", ticker: "6664", name: "群翊" },
      { code: "G06", ticker: "6937", name: "天虹" },
      { code: "G07", ticker: "6953", name: "家碩" },
      { code: "G08", ticker: "7822", name: "倍利科" },
      { code: "G09", ticker: "7853", name: "政美應用" },
      { code: "G10", ticker: "8027", name: "鈦昇" },
    ],
  },
  {
    id: "H",
    label: "III-V族",
    stocks: [
      { code: "H1", ticker: "2455", name: "全新" },
      { code: "H2", ticker: "3081", name: "聯亞" },
      { code: "H3", ticker: "3105", name: "穩懋" },
      { code: "H4", ticker: "4991", name: "環宇-KY", aliases: ["環宇"] },
      { code: "H5", ticker: "8086", name: "宏捷科" },
    ],
  },
  {
    id: "I",
    label: "記憶體",
    stocks: [
      { code: "I1", ticker: "2337", name: "旺宏", aliases: ["Macronix", "MXIC"] },
      { code: "I2", ticker: "2344", name: "華邦電", aliases: ["Winbond"] },
      { code: "I3", ticker: "2408", name: "南亞科", aliases: ["Nanya", "南亞科技"] },
      { code: "I4", ticker: "3260", name: "威剛", aliases: ["ADATA"] },
      { code: "I5", ticker: "6531", name: "愛普", aliases: ["Ap Memory", "ApMemory"] },
      { code: "I6", ticker: "8299", name: "群聯", aliases: ["Phison"] },
    ],
  },
  {
    id: "J",
    label: "品牌/ODM",
    stocks: [
      { code: "J1", ticker: "2317", name: "鴻海", aliases: ["Foxconn", "Hon Hai"] },
      { code: "J2", ticker: "2382", name: "廣達", aliases: ["Quanta"] },
    ],
  },
  {
    id: "K",
    label: "電子零組件",
    stocks: [
      { code: "K01", ticker: "2059", name: "川湖" },
      { code: "K02", ticker: "2301", name: "光寶科", aliases: ["Lite-On", "光寶"] },
      { code: "K03", ticker: "2308", name: "台達電", aliases: ["Delta", "台達"] },
      { code: "K04", ticker: "3017", name: "奇鋐", aliases: ["Asia Vital", "AVC"] },
      { code: "K05", ticker: "3324", name: "雙鴻" },
      { code: "K06", ticker: "3533", name: "嘉澤" },
      { code: "K07", ticker: "4931", name: "新盛力" },
      { code: "K08", ticker: "6584", name: "南俊國際" },
      { code: "K09", ticker: "6805", name: "富世達" },
      { code: "K10", ticker: "8210", name: "勤誠" },
    ],
  },
  {
    id: "L",
    label: "被動元件",
    stocks: [
      { code: "L1", ticker: "2472", name: "立隆電" },
      { code: "L2", ticker: "3026", name: "禾伸堂" },
      { code: "L3", ticker: "3357", name: "臺慶科" },
      { code: "L4", ticker: "6449", name: "鈺邦" },
    ],
  },
  {
    id: "M",
    label: "PCB",
    stocks: [
      { code: "M1", ticker: "2313", name: "華通", aliases: ["Compeq"] },
      { code: "M2", ticker: "3037", name: "欣興", aliases: ["Unimicron"] },
      { code: "M3", ticker: "3715", name: "定穎投控", aliases: ["定穎"] },
      { code: "M4", ticker: "4958", name: "臻鼎-KY", aliases: ["臻鼎", "ZDT"] },
      { code: "M5", ticker: "6191", name: "精成科", aliases: ["GCE"] },
    ],
  },
  {
    id: "N",
    label: "車用零組件",
    stocks: [
      { code: "N1", ticker: "2351", name: "順德" },
      { code: "N2", ticker: "6271", name: "同欣電", aliases: ["Tong Hsing"] },
      { code: "N3", ticker: "8255", name: "朋程", aliases: ["PanJit"] },
    ],
  },
  {
    id: "O",
    label: "功率元件",
    stocks: [{ code: "O1", ticker: "5425", name: "台半", aliases: ["TSC"] }],
  },
  {
    id: "P",
    label: "航太軍工",
    stocks: [
      { code: "P1", ticker: "2645", name: "長榮航太" },
      { code: "P2", ticker: "3004", name: "豐達科" },
      { code: "P3", ticker: "5222", name: "全訊" },
      { code: "P4", ticker: "6753", name: "龍德造船" },
    ],
  },
  {
    id: "Q",
    label: "銅箔基板",
    stocks: [
      { code: "Q1", ticker: "2383", name: "台光電", aliases: ["EMC", "台光"] },
      { code: "Q2", ticker: "6274", name: "台燿", aliases: ["Taiflex"] },
      { code: "Q3", ticker: "8358", name: "金居", aliases: ["Co-Tech"] },
    ],
  },
  {
    id: "R",
    label: "機器系統",
    stocks: [
      { code: "R1", ticker: "4906", name: "正文" },
      { code: "R2", ticker: "5388", name: "中磊" },
      { code: "R3", ticker: "6285", name: "啟碁" },
    ],
  },
  {
    id: "S",
    label: "自行車",
    stocks: [
      { code: "S1", ticker: "9914", name: "美利達" },
      { code: "S2", ticker: "5306", name: "桂盟" },
    ],
  },
  {
    id: "T",
    label: "循環經濟",
    stocks: [
      { code: "T1", ticker: "6894", name: "衛司特" },
      { code: "T2", ticker: "8936", name: "國統" },
    ],
  },
  {
    id: "U",
    label: "紡織製鞋",
    stocks: [
      { code: "U1", ticker: "6768", name: "志強-KY" },
      { code: "U2", ticker: "6890", name: "來億-KY" },
      { code: "U3", ticker: "9938", name: "百和" },
    ],
  },
];

// Get all Taiwan stock tickers (numeric only, for TWSE API)
export function getTwseStockCodes(): string[] {
  return categories
    .flatMap((cat) => cat.stocks)
    .map((s) => s.ticker)
    .filter((t) => /^\d+$/.test(t));
}

// Lookup a stock by ticker or name/alias, returns { ticker, stock_name } or null
// Checks categorized stocks first (with aliases), then the broader lookup table
import { stockLookup } from "./stock-lookup";

// Extra aliases for stocks in stockLookup (lowercase alias → ticker)
const stockLookupAliases: Record<string, string> = {
  "google": "GOOG",
  "stmicro": "STM",
  "聚賢研發": "7631",
  "aws": "AMZN",
};

// Display aliases by ticker — used for article highlighting
export const stockDisplayAliases: Record<string, string[]> = {
  "GOOG": ["Google"],
  "AMZN": ["AWS"],
  "STM": ["STMicro"],
  "7631": ["聚賢研發"],
  "3407.T": ["旭化成", "Asahi Kasei", "Asahi"],
  "3110.T": ["日東紡", "Nittobo"],
  "1899.T": ["福田", "Fukuda"],
  "5706.T": ["三井金屬", "Mitsui Kinzoku"],
  "5801.T": ["古河電工", "Furukawa"],
  "4004.T": ["昭和電工", "Resonac"],
  "4182.T": ["三菱瓦斯化學", "MGC"],
  "000157.KS": ["斗山", "Doosan"],
  "2010.SR": ["沙特基礎工業", "SABIC", "Sabic"],
  "285A.T": ["鎧俠", "Kioxia"],
};

export function lookupStock(query: string): { ticker: string; stock_name: string } | null {
  const q = query.trim();
  if (!q) return null;
  const ql = q.toLowerCase();
  // 1. Check categorized stocks (has aliases)
  for (const cat of categories) {
    for (const s of cat.stocks) {
      if (s.ticker.toLowerCase() === ql) return { ticker: s.ticker, stock_name: s.name };
      if (s.name.toLowerCase() === ql) return { ticker: s.ticker, stock_name: s.name };
      if (s.aliases?.some((a) => a.toLowerCase() === ql)) return { ticker: s.ticker, stock_name: s.name };
    }
  }
  // 2. Check broad lookup table by ticker
  const tickerMatch = Object.keys(stockLookup).find((t) => t.toLowerCase() === ql);
  if (tickerMatch) return { ticker: tickerMatch, stock_name: stockLookup[tickerMatch] };
  // 3. Check broad lookup table by name (reverse lookup)
  // Handles "三井金屬(Mitsui Kinzoku)" — splits by whitespace and parentheses
  for (const [ticker, name] of Object.entries(stockLookup)) {
    if (name.toLowerCase() === ql) return { ticker, stock_name: name };
    const parts = name.split(/[\s()]+/).filter(Boolean);
    if (parts.some((p) => p.toLowerCase() === ql)) return { ticker, stock_name: name };
  }
  // 4. Check extra aliases
  const aliasTicker = stockLookupAliases[ql];
  if (aliasTicker && stockLookup[aliasTicker]) {
    return { ticker: aliasTicker, stock_name: stockLookup[aliasTicker] };
  }
  return null;
}
