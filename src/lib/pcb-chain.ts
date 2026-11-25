// PCB 產業鏈：/pcb 比較頁的分組與成分股。
// 台股列入報價比較；國外／中國同業只列名稱當參考（沒有對應的報價來源）。

export type ChainStock = { ticker: string; name: string };

export type ChainSegment = {
  id: string;
  label: string;
  note?: string;
  stocks: ChainStock[];
  peers?: { name: string; ticker?: string }[];
};

export type ChainLayer = {
  layer: string;
  segments: ChainSegment[];
};

export const pcbChain: ChainLayer[] = [
  {
    layer: "上游：材料",
    segments: [
      {
        id: "copper-foil",
        label: "銅箔",
        stocks: [
          { ticker: "8358", name: "金居" },
          { ticker: "1303", name: "南亞" },
        ],
        peers: [
          { name: "三井金屬", ticker: "5706.T" },
          { name: "古河電工", ticker: "5801.T" },
        ],
      },
      {
        id: "glass-fiber",
        label: "玻纖布／紗",
        stocks: [
          { ticker: "1802", name: "台玻" },
          { ticker: "1815", name: "富喬" },
          { ticker: "5475", name: "德宏" },
        ],
        peers: [{ name: "日東紡(Nittobo)", ticker: "3110.T" }],
      },
      {
        id: "ccl",
        label: "銅箔基板（CCL）",
        stocks: [
          { ticker: "2383", name: "台光電" },
          { ticker: "6274", name: "台燿" },
          { ticker: "6213", name: "聯茂" },
          { ticker: "1303", name: "南亞" },
        ],
        peers: [
          { name: "松下(Panasonic)", ticker: "6752.T" },
          { name: "生益科技", ticker: "600183.SS" },
          { name: "建滔積層板", ticker: "1888.HK" },
        ],
      },
    ],
  },
  {
    layer: "中游：PCB 製造",
    segments: [
      {
        id: "leader",
        label: "綜合型龍頭",
        note: "全球最大，旗下有鵬鼎",
        stocks: [{ ticker: "4958", name: "臻鼎-KY" }],
      },
      {
        id: "hdi",
        label: "硬板／HDI",
        stocks: [
          { ticker: "2313", name: "華通" },
          { ticker: "3044", name: "健鼎" },
          { ticker: "2368", name: "金像電" },
          { ticker: "3715", name: "定穎投控" },
          { ticker: "8155", name: "博智" },
          { ticker: "2316", name: "楠梓電" },
          { ticker: "2355", name: "敬鵬" },
          { ticker: "2367", name: "燿華" },
        ],
        peers: [
          { name: "TTM", ticker: "TTMI" },
          { name: "滬電股份", ticker: "002463.SZ" },
          { name: "勝宏科技", ticker: "300476.SZ" },
          { name: "深南電路", ticker: "002916.SZ" },
        ],
      },
      {
        id: "fpc",
        label: "軟板（FPC）",
        stocks: [
          { ticker: "6269", name: "台郡" },
          { ticker: "6153", name: "嘉聯益" },
        ],
        peers: [
          { name: "東山精密", ticker: "002384.SZ" },
          { name: "日本旗勝(Mektron)" },
        ],
      },
      {
        id: "substrate",
        label: "IC 載板",
        stocks: [
          { ticker: "3037", name: "欣興" },
          { ticker: "8046", name: "南電" },
          { ticker: "3189", name: "景碩" },
        ],
        peers: [
          { name: "Ibiden", ticker: "4062.T" },
          { name: "新光電氣" },
          { name: "AT&S" },
          { name: "三星電機(SEMCO)", ticker: "009150.KS" },
        ],
      },
    ],
  },
  {
    layer: "設備與耗材",
    segments: [
      { id: "drill", label: "鑽針", stocks: [{ ticker: "8021", name: "尖點" }] },
      {
        id: "equipment",
        label: "壓合、烘烤等製程設備",
        stocks: [
          { ticker: "2467", name: "志聖" },
          { ticker: "6664", name: "群翊" },
        ],
      },
      { id: "chemical", label: "化學品、電鍍設備", stocks: [{ ticker: "2493", name: "揚博" }] },
      { id: "aoi", label: "AOI 光學檢測", stocks: [{ ticker: "3563", name: "牧德" }] },
    ],
  },
];

// 頁面上所有台股代碼（去重；南亞同時在銅箔與 CCL）
export const pcbTickers: string[] = [
  ...new Set(pcbChain.flatMap((l) => l.segments.flatMap((s) => s.stocks.map((x) => x.ticker)))),
];
