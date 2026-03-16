export type Stock = {
  code: string;
  ticker: string;
  name: string;
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
      { code: "A1", ticker: "2379", name: "瑞昱" },
      { code: "A2", ticker: "2454", name: "聯發科" },
      { code: "A3", ticker: "5274", name: "信驊" },
    ],
  },
  {
    id: "B",
    label: "晶圓代工",
    stocks: [
      { code: "B1", ticker: "2303", name: "聯電" },
      { code: "B2", ticker: "2330", name: "台積電" },
      { code: "B3", ticker: "5347", name: "世界" },
    ],
  },
  {
    id: "C",
    label: "半導體封測",
    stocks: [
      { code: "C1", ticker: "3711", name: "日月光" },
      { code: "C2", ticker: "6239", name: "力成" },
      { code: "C3", ticker: "6257", name: "矽格" },
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
      { code: "E1", ticker: "1560", name: "中砂" },
      { code: "E2", ticker: "1727", name: "中華化" },
      { code: "E3", ticker: "3680", name: "家登" },
      { code: "E4", ticker: "6488", name: "環球晶" },
    ],
  },
  {
    id: "F",
    label: "半導體廠務",
    stocks: [
      { code: "F1", ticker: "6196", name: "帆宣" },
      { code: "F2", ticker: "6826", name: "和淞" },
    ],
  },
  {
    id: "G",
    label: "半導體設備",
    stocks: [
      { code: "G1", ticker: "2467", name: "志聖" },
      { code: "G2", ticker: "3131", name: "弘塑" },
      { code: "G3", ticker: "3455", name: "由田" },
      { code: "G4", ticker: "3563", name: "牧德" },
      { code: "G5", ticker: "6438", name: "迅得" },
      { code: "G6", ticker: "6664", name: "群翊" },
      { code: "G7", ticker: "6937", name: "天虹" },
      { code: "G8", ticker: "7822", name: "倍利科" },
      { code: "G9", ticker: "7853", name: "政美應用" },
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
      { code: "H4", ticker: "4991", name: "環宇-KY" },
      { code: "H5", ticker: "8086", name: "宏捷科" },
    ],
  },
  {
    id: "I",
    label: "記憶體",
    stocks: [
      { code: "I1", ticker: "2337", name: "旺宏" },
      { code: "I2", ticker: "2344", name: "華邦電" },
      { code: "I3", ticker: "2408", name: "南亞科" },
      { code: "I4", ticker: "3260", name: "威剛" },
      { code: "I5", ticker: "4967", name: "十銓" },
      { code: "I6", ticker: "6531", name: "愛普" },
      { code: "I7", ticker: "8299", name: "群聯" },
    ],
  },
  {
    id: "J",
    label: "品牌/ODM",
    stocks: [
      { code: "J1", ticker: "2317", name: "鴻海" },
      { code: "J2", ticker: "2376", name: "技嘉" },
      { code: "J3", ticker: "2382", name: "廣達" },
    ],
  },
  {
    id: "K",
    label: "電子零組件",
    stocks: [
      { code: "K1", ticker: "2059", name: "川湖" },
      { code: "K2", ticker: "2301", name: "光寶科" },
      { code: "K3", ticker: "2308", name: "台達電" },
      { code: "K4", ticker: "3017", name: "奇鋐" },
      { code: "K5", ticker: "3324", name: "雙鴻" },
      { code: "K6", ticker: "3357", name: "臺慶科" },
      { code: "K7", ticker: "3533", name: "嘉澤" },
      { code: "K8", ticker: "6449", name: "鈺邦" },
      { code: "K9", ticker: "6584", name: "南俊國際" },
      { code: "K10", ticker: "6805", name: "富世達" },
      { code: "K11", ticker: "8210", name: "勤誠" },
    ],
  },
  {
    id: "L",
    label: "PCB",
    stocks: [
      { code: "L1", ticker: "2313", name: "華通" },
      { code: "L2", ticker: "3037", name: "欣興" },
      { code: "L3", ticker: "3715", name: "定穎投控" },
      { code: "L4", ticker: "4958", name: "臻鼎-KY" },
      { code: "L5", ticker: "6191", name: "精成科" },
    ],
  },
  {
    id: "M",
    label: "車用零組件",
    stocks: [
      { code: "M1", ticker: "2351", name: "順德" },
      { code: "M2", ticker: "6271", name: "同欣電" },
      { code: "M3", ticker: "8255", name: "朋程" },
    ],
  },
  {
    id: "N",
    label: "功率元件",
    stocks: [{ code: "N1", ticker: "5425", name: "台半" }],
  },
  {
    id: "O",
    label: "航太軍工",
    stocks: [
      { code: "O1", ticker: "2645", name: "長榮航太" },
      { code: "O2", ticker: "3004", name: "豐達科" },
      { code: "O3", ticker: "5222", name: "全訊" },
      { code: "O4", ticker: "6753", name: "龍德造船" },
    ],
  },
  {
    id: "P",
    label: "銅箔基板",
    stocks: [
      { code: "P1", ticker: "2383", name: "台光電" },
      { code: "P2", ticker: "6274", name: "台燿" },
      { code: "P3", ticker: "8358", name: "金居" },
    ],
  },
  {
    id: "Q",
    label: "機器系統",
    stocks: [
      { code: "Q1", ticker: "4906", name: "正文" },
      { code: "Q2", ticker: "5388", name: "中磊" },
      { code: "Q3", ticker: "6285", name: "啟碁" },
    ],
  },
  {
    id: "R",
    label: "自行車",
    stocks: [
      { code: "R1", ticker: "9914", name: "美利達" },
      { code: "R2", ticker: "5306", name: "桂盟" },
    ],
  },
  {
    id: "S",
    label: "循環經濟",
    stocks: [
      { code: "S1", ticker: "6894", name: "衛司特" },
      { code: "S2", ticker: "8936", name: "國統" },
    ],
  },
  {
    id: "T",
    label: "紡織製鞋",
    stocks: [
      { code: "T1", ticker: "6768", name: "志強-KY" },
      { code: "T2", ticker: "6890", name: "來億-KY" },
      { code: "T3", ticker: "9802", name: "鈺齊-KY" },
      { code: "T4", ticker: "9938", name: "百和" },
    ],
  },
  {
    id: "U",
    label: "海外科技巨頭",
    stocks: [
      { code: "U1", ticker: "MU", name: "Micron" },
      { code: "U2", ticker: "INTC", name: "Intel" },
      { code: "U3", ticker: "AMD", name: "AMD" },
      { code: "U4", ticker: "NVDA", name: "NVIDIA" },
      { code: "U5", ticker: "AVGO", name: "Broadcom" },
      { code: "U6", ticker: "IFX", name: "Infineon" },
      { code: "U7", ticker: "QCOM", name: "Qualcomm" },
      { code: "U8", ticker: "AAPL", name: "Apple" },
      { code: "U9", ticker: "ASML", name: "ASML" },
      { code: "U10", ticker: "TSLA", name: "Tesla" },
      { code: "U11", ticker: "BA", name: "Boeing" },
      { code: "U12", ticker: "4062.T", name: "Ibiden" },
      { code: "U13", ticker: "005930.KS", name: "Samsung" },
      { code: "U14", ticker: "000660.KS", name: "SK Hynix" },
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
