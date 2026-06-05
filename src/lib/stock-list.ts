export type Stock = {
  code: string;
  ticker: string;
  name: string;
  market?: "tpex"; // undefined = TWSE
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
      { code: "A3", ticker: "5274", name: "信驊", market: "tpex" },
    ],
  },
  {
    id: "B",
    label: "晶圓代工",
    stocks: [
      { code: "B1", ticker: "2303", name: "聯電" },
      { code: "B2", ticker: "2330", name: "台積電" },
      { code: "B3", ticker: "5347", name: "世界", market: "tpex" },
    ],
  },
  {
    id: "C",
    label: "半導體封測",
    stocks: [
      { code: "C1", ticker: "3711", name: "日月光" },
      { code: "C2", ticker: "6239", name: "力成", market: "tpex" },
      { code: "C3", ticker: "6257", name: "矽格", market: "tpex" },
    ],
  },
  {
    id: "D",
    label: "半導體檢測",
    stocks: [{ code: "D1", ticker: "3587", name: "閎康", market: "tpex" }],
  },
  {
    id: "E",
    label: "半導體耗材",
    stocks: [
      { code: "E1", ticker: "1560", name: "中砂" },
      { code: "E2", ticker: "1727", name: "中華化" },
      { code: "E3", ticker: "3680", name: "家登", market: "tpex" },
      { code: "E4", ticker: "6488", name: "環球晶" },
    ],
  },
  {
    id: "F",
    label: "半導體廠務",
    stocks: [
      { code: "F1", ticker: "2404", name: "漢唐" },
      { code: "F2", ticker: "6196", name: "帆宣", market: "tpex" },
      { code: "F3", ticker: "6826", name: "和淞", market: "tpex" },
    ],
  },
  {
    id: "G",
    label: "半導體設備",
    stocks: [
      { code: "G01", ticker: "2467", name: "志聖" },
      { code: "G02", ticker: "3131", name: "弘塑", market: "tpex" },
      { code: "G03", ticker: "3455", name: "由田", market: "tpex" },
      { code: "G04", ticker: "3583", name: "辛耘", market: "tpex" },
      { code: "G05", ticker: "6438", name: "迅得", market: "tpex" },
      { code: "G06", ticker: "6664", name: "群翊", market: "tpex" },
      { code: "G07", ticker: "6937", name: "天虹", market: "tpex" },
      { code: "G08", ticker: "6953", name: "家碩", market: "tpex" },
      { code: "G09", ticker: "7822", name: "倍利科", market: "tpex" },
      { code: "G10", ticker: "7853", name: "政美應用", market: "tpex" },
      { code: "G11", ticker: "8027", name: "鈦昇", market: "tpex" },
    ],
  },
  {
    id: "H",
    label: "III-V族",
    stocks: [
      { code: "H1", ticker: "2455", name: "全新" },
      { code: "H2", ticker: "3081", name: "聯亞", market: "tpex" },
      { code: "H3", ticker: "3105", name: "穩懋", market: "tpex" },
      { code: "H4", ticker: "4979", name: "華星光", market: "tpex" },
      { code: "H5", ticker: "4991", name: "環宇-KY", market: "tpex" },
      { code: "H6", ticker: "8086", name: "宏捷科", market: "tpex" },
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
      { code: "I5", ticker: "6531", name: "愛普", market: "tpex" },
      { code: "I6", ticker: "8299", name: "群聯", market: "tpex" },
    ],
  },
  {
    id: "J",
    label: "品牌/ODM",
    stocks: [
      { code: "J1", ticker: "2317", name: "鴻海" },
      { code: "J2", ticker: "2382", name: "廣達" },
    ],
  },
  {
    id: "K",
    label: "電子零組件",
    stocks: [
      { code: "K01", ticker: "2059", name: "川湖" },
      { code: "K02", ticker: "2301", name: "光寶科" },
      { code: "K03", ticker: "2308", name: "台達電" },
      { code: "K04", ticker: "3017", name: "奇鋐", market: "tpex" },
      { code: "K05", ticker: "3324", name: "雙鴻", market: "tpex" },
      { code: "K06", ticker: "3533", name: "嘉澤", market: "tpex" },
      { code: "K07", ticker: "4931", name: "新盛力", market: "tpex" },
      { code: "K08", ticker: "6584", name: "南俊國際", market: "tpex" },
      { code: "K09", ticker: "6805", name: "富世達", market: "tpex" },
      { code: "K10", ticker: "8210", name: "勤誠", market: "tpex" },
    ],
  },
  {
    id: "L",
    label: "被動元件",
    stocks: [
      { code: "L1", ticker: "2472", name: "立隆電" },
      { code: "L2", ticker: "3026", name: "禾伸堂", market: "tpex" },
      { code: "L3", ticker: "3357", name: "臺慶科", market: "tpex" },
      { code: "L4", ticker: "6449", name: "鈺邦", market: "tpex" },
    ],
  },
  {
    id: "M",
    label: "PCB",
    stocks: [
      { code: "M1", ticker: "2313", name: "華通" },
      { code: "M2", ticker: "3037", name: "欣興" },
      { code: "M3", ticker: "3715", name: "定穎投控", market: "tpex" },
      { code: "M4", ticker: "4958", name: "臻鼎-KY" },
      { code: "M5", ticker: "6191", name: "精成科", market: "tpex" },
    ],
  },
  {
    id: "N",
    label: "車用零組件",
    stocks: [
      { code: "N1", ticker: "2351", name: "順德" },
      { code: "N2", ticker: "6271", name: "同欣電", market: "tpex" },
      { code: "N3", ticker: "8255", name: "朋程", market: "tpex" },
    ],
  },
  {
    id: "O",
    label: "功率元件",
    stocks: [{ code: "O1", ticker: "5425", name: "台半", market: "tpex" }],
  },
  {
    id: "P",
    label: "航太軍工",
    stocks: [
      { code: "P1", ticker: "2645", name: "長榮航太" },
      { code: "P2", ticker: "3004", name: "豐達科", market: "tpex" },
      { code: "P3", ticker: "5222", name: "全訊", market: "tpex" },
      { code: "P4", ticker: "6753", name: "龍德造船", market: "tpex" },
    ],
  },
  {
    id: "Q",
    label: "銅箔基板",
    stocks: [
      { code: "Q1", ticker: "2383", name: "台光電" },
      { code: "Q2", ticker: "6274", name: "台燿", market: "tpex" },
      { code: "Q3", ticker: "8358", name: "金居", market: "tpex" },
    ],
  },
  {
    id: "R",
    label: "機器系統",
    stocks: [
      { code: "R1", ticker: "4906", name: "正文" },
      { code: "R2", ticker: "5388", name: "中磊", market: "tpex" },
      { code: "R3", ticker: "6285", name: "啟碁", market: "tpex" },
    ],
  },
  {
    id: "S",
    label: "自行車",
    stocks: [
      { code: "S1", ticker: "9914", name: "美利達" },
      { code: "S2", ticker: "5306", name: "桂盟", market: "tpex" },
    ],
  },
  {
    id: "T",
    label: "循環經濟",
    stocks: [
      { code: "T1", ticker: "6894", name: "衛司特", market: "tpex" },
      { code: "T2", ticker: "8936", name: "國統", market: "tpex" },
    ],
  },
  {
    id: "U",
    label: "紡織製鞋",
    stocks: [
      { code: "U1", ticker: "6768", name: "志強-KY", market: "tpex" },
      { code: "U2", ticker: "6890", name: "來億-KY", market: "tpex" },
      { code: "U3", ticker: "9938", name: "百和" },
    ],
  },
];

export function getTwseStockCodes(): string[] {
  return categories
    .flatMap((cat) => cat.stocks)
    .map((s) => s.ticker)
    .filter((t) => /^\d+$/.test(t));
}
