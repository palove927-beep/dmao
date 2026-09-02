// 「一到三線類股及水溫狀況」表格的族群成分股。
// 代碼是拿表格上的名稱去比對證交所上市清單與櫃買中心上櫃清單得到的，
// 名稱維持表格原樣（含 -KY、-創、* 等官方後綴）。
// market: "tpex" = 上櫃，undefined = 上市，語意與 stock-list.ts 一致。

export type SectorStock = {
  ticker: string;
  name: string;
  market?: "tpex";
};

export type SectorGroup = {
  id: string;
  label: string;
  stocks: SectorStock[];
};

export type SectorTier = {
  tier: string;
  groups: SectorGroup[];
};

export const sectorTiers: SectorTier[] = [
  {
    tier: "一線",
    groups: [
      {
        id: "t1-1",
        label: "光學鏡頭",
        stocks: [
          { ticker: "3008", name: "大立光" },
          { ticker: "3406", name: "玉晶光" },
          { ticker: "3441", name: "聯一光", market: "tpex" },
          { ticker: "3362", name: "先進光", market: "tpex" },
          { ticker: "3504", name: "揚明光" },
          { ticker: "6668", name: "中揚光" },
          { ticker: "6517", name: "保勝光學", market: "tpex" },
          { ticker: "6209", name: "今國光" },
          { ticker: "3019", name: "亞光" },
          { ticker: "4976", name: "佳凌" },
        ],
      },
      {
        id: "t1-2",
        label: "塑化",
        stocks: [
          { ticker: "1303", name: "南亞" },
          { ticker: "1301", name: "台塑" },
          { ticker: "1326", name: "台化" },
          { ticker: "1312", name: "國喬" },
          { ticker: "6505", name: "台塑化" },
        ],
      },
      {
        id: "t1-3",
        label: "散熱",
        stocks: [
          { ticker: "3653", name: "健策" },
          { ticker: "3017", name: "奇鋐" },
          { ticker: "3324", name: "雙鴻", market: "tpex" },
          { ticker: "2421", name: "建準" },
          { ticker: "2354", name: "鴻準" },
        ],
      },
      {
        id: "t1-4",
        label: "連接器",
        stocks: [
          { ticker: "3605", name: "宏致" },
          { ticker: "3003", name: "健和興" },
          { ticker: "8103", name: "瀚荃" },
          { ticker: "6913", name: "鴻呈", market: "tpex" },
          { ticker: "3023", name: "信邦" },
          { ticker: "2392", name: "正崴" },
          { ticker: "6279", name: "胡連", market: "tpex" },
          { ticker: "3689", name: "湧德", market: "tpex" },
          { ticker: "3665", name: "貿聯-KY" },
          { ticker: "6190", name: "萬泰科", market: "tpex" },
          { ticker: "6134", name: "萬旭", market: "tpex" },
          { ticker: "6197", name: "佳必琪" },
        ],
      },
    ],
  },
  {
    tier: "二線",
    groups: [
      {
        id: "t2-5",
        label: "記憶體",
        stocks: [
          { ticker: "2408", name: "南亞科" },
          { ticker: "3006", name: "晶豪科" },
          { ticker: "5351", name: "鈺創", market: "tpex" },
          { ticker: "8271", name: "宇瞻" },
          { ticker: "2451", name: "創見" },
          { ticker: "3260", name: "威剛", market: "tpex" },
          { ticker: "4973", name: "廣穎", market: "tpex" },
          { ticker: "2344", name: "華邦電" },
          { ticker: "2337", name: "旺宏" },
          { ticker: "4967", name: "十銓" },
          { ticker: "8299", name: "群聯", market: "tpex" },
        ],
      },
      {
        id: "t2-6",
        label: "IC封測",
        stocks: [
          { ticker: "3450", name: "聯鈞" },
          { ticker: "3374", name: "精材", market: "tpex" },
          { ticker: "3265", name: "台星科", market: "tpex" },
          { ticker: "2449", name: "京元電子" },
          { ticker: "6257", name: "矽格" },
          { ticker: "3264", name: "欣銓", market: "tpex" },
          { ticker: "6239", name: "力成" },
          { ticker: "2441", name: "超豐" },
          { ticker: "3711", name: "日月光投控" },
          { ticker: "2369", name: "菱生" },
        ],
      },
      {
        id: "t2-7",
        label: "工業電腦",
        stocks: [
          { ticker: "2395", name: "研華" },
          { ticker: "6206", name: "飛捷" },
          { ticker: "3416", name: "融程電" },
          { ticker: "3022", name: "威強電" },
          { ticker: "6414", name: "樺漢" },
          { ticker: "6579", name: "研揚" },
          { ticker: "3479", name: "安勤", market: "tpex" },
          { ticker: "3088", name: "艾訊", market: "tpex" },
          { ticker: "6245", name: "立端", market: "tpex" },
          { ticker: "8114", name: "振樺電" },
          { ticker: "6166", name: "凌華" },
          { ticker: "8050", name: "廣積", market: "tpex" },
        ],
      },
      {
        id: "t2-8",
        label: "運輸",
        stocks: [
          { ticker: "2603", name: "長榮" },
          { ticker: "2609", name: "陽明" },
          { ticker: "2615", name: "萬海" },
          { ticker: "2637", name: "慧洋-KY" },
          { ticker: "2606", name: "裕民" },
          { ticker: "2605", name: "新興" },
          { ticker: "2612", name: "中航" },
          { ticker: "2617", name: "台航" },
          { ticker: "5608", name: "四維航" },
          { ticker: "2636", name: "台驊控股" },
          { ticker: "2618", name: "長榮航" },
          { ticker: "2610", name: "華航" },
          { ticker: "2646", name: "星宇航空" },
          { ticker: "6757", name: "台灣虎航" },
        ],
      },
      {
        id: "t2-9",
        label: "電腦與週邊設備",
        stocks: [
          { ticker: "2301", name: "光寶科" },
          { ticker: "7711", name: "永擎" },
          { ticker: "2357", name: "華碩" },
          { ticker: "2376", name: "技嘉" },
          { ticker: "2377", name: "微星" },
          { ticker: "2324", name: "仁寶" },
          { ticker: "2356", name: "英業達" },
          { ticker: "3231", name: "緯創" },
          { ticker: "2362", name: "藍天" },
          { ticker: "2382", name: "廣達" },
          { ticker: "4938", name: "和碩" },
          { ticker: "2353", name: "宏碁" },
        ],
      },
      {
        id: "t2-10",
        label: "CCL、FCCL",
        stocks: [
          { ticker: "8039", name: "台虹" },
          { ticker: "4939", name: "亞電", market: "tpex" },
          { ticker: "6213", name: "聯茂" },
          { ticker: "2383", name: "台光電" },
          { ticker: "6274", name: "台燿", market: "tpex" },
          { ticker: "8358", name: "金居", market: "tpex" },
          { ticker: "6672", name: "騰輝電子-KY" },
        ],
      },
      {
        id: "t2-11",
        label: "光通訊",
        stocks: [
          { ticker: "3081", name: "聯亞", market: "tpex" },
          { ticker: "3234", name: "光環", market: "tpex" },
          { ticker: "2455", name: "全新" },
          { ticker: "3163", name: "波若威", market: "tpex" },
          { ticker: "4979", name: "華星光", market: "tpex" },
          { ticker: "3363", name: "上詮", market: "tpex" },
          { ticker: "4908", name: "前鼎", market: "tpex" },
          { ticker: "4977", name: "眾達-KY" },
          { ticker: "6426", name: "統新" },
          { ticker: "6530", name: "創威", market: "tpex" },
          { ticker: "3491", name: "昇達科", market: "tpex" },
        ],
      },
    ],
  },
  {
    tier: "三線",
    groups: [
      {
        id: "t3-12",
        label: "PCB",
        stocks: [
          { ticker: "3037", name: "欣興" },
          { ticker: "8046", name: "南電" },
          { ticker: "3189", name: "景碩" },
          { ticker: "2368", name: "金像電" },
          { ticker: "2313", name: "華通" },
          { ticker: "3044", name: "健鼎" },
          { ticker: "6269", name: "台郡" },
          { ticker: "8155", name: "博智", market: "tpex" },
          { ticker: "4958", name: "臻鼎-KY" },
          { ticker: "2316", name: "楠梓電" },
          { ticker: "2355", name: "敬鵬" },
        ],
      },
      {
        id: "t3-13",
        label: "被動元件",
        stocks: [
          { ticker: "3042", name: "晶技" },
          { ticker: "2484", name: "希華" },
          { ticker: "3026", name: "禾伸堂" },
          { ticker: "6173", name: "信昌電", market: "tpex" },
          { ticker: "2428", name: "興勤" },
          { ticker: "6175", name: "立敦", market: "tpex" },
          { ticker: "2472", name: "立隆電" },
          { ticker: "2492", name: "華新科" },
          { ticker: "2327", name: "國巨*" },
          { ticker: "2375", name: "凱美" },
          { ticker: "3090", name: "日電貿" },
        ],
      },
      {
        id: "t3-14",
        label: "電機",
        stocks: [
          { ticker: "1590", name: "亞德客-KY" },
          { ticker: "7750", name: "新代" },
          { ticker: "4590", name: "富田-創" },
          { ticker: "2049", name: "上銀" },
          { ticker: "4576", name: "大銀微系統" },
          { ticker: "1597", name: "直得" },
          { ticker: "1519", name: "華城" },
          { ticker: "1503", name: "士電" },
          { ticker: "1513", name: "中興電" },
          { ticker: "1514", name: "亞力" },
          { ticker: "1504", name: "東元" },
          { ticker: "4566", name: "時碩工業" },
        ],
      },
      {
        id: "t3-15",
        label: "電線電纜",
        stocks: [
          { ticker: "1605", name: "華新" },
          { ticker: "1608", name: "華榮" },
          { ticker: "1612", name: "宏泰" },
          { ticker: "1615", name: "大山" },
          { ticker: "1618", name: "合機" },
          { ticker: "1603", name: "華電" },
          { ticker: "1441", name: "大東" },
        ],
      },
      {
        id: "t3-16",
        label: "IC設計",
        stocks: [
          { ticker: "3443", name: "創意" },
          { ticker: "3661", name: "世芯-KY" },
          { ticker: "3034", name: "聯詠" },
          { ticker: "3094", name: "聯傑" },
          { ticker: "2454", name: "聯發科" },
          { ticker: "6533", name: "晶心科" },
          { ticker: "5471", name: "松翰" },
          { ticker: "3227", name: "原相", market: "tpex" },
          { ticker: "2436", name: "偉詮電" },
          { ticker: "2379", name: "瑞昱" },
          { ticker: "5269", name: "祥碩" },
        ],
      },
      {
        id: "t3-17",
        label: "資訊軟體",
        stocks: [
          { ticker: "6214", name: "精誠" },
          { ticker: "3029", name: "零壹" },
          { ticker: "2480", name: "敦陽科" },
          { ticker: "6811", name: "宏碁資訊", market: "tpex" },
          { ticker: "4953", name: "緯致", market: "tpex" },
          { ticker: "3147", name: "大綜", market: "tpex" },
        ],
      },
      {
        id: "t3-18",
        label: "個股表現",
        stocks: [
          { ticker: "2881", name: "富邦金" },
          { ticker: "6782", name: "視陽" },
          { ticker: "1815", name: "富喬", market: "tpex" },
          { ticker: "2351", name: "順德" },
          { ticker: "6805", name: "富世達" },
          { ticker: "2882", name: "國泰金" },
          { ticker: "3376", name: "新日興" },
          { ticker: "2476", name: "鉅祥" },
          { ticker: "1802", name: "台玻" },
          { ticker: "6278", name: "台表科" },
          { ticker: "6491", name: "晶碩" },
          { ticker: "4771", name: "望隼" },
          { ticker: "1102", name: "亞泥" },
          { ticker: "1402", name: "遠東新" },
        ],
      },
    ],
  },
];

// 攤平後的全部成分股（含跨族群重複時只留一份），供批次抓價與 API 查詢使用
export const allSectorStocks: SectorStock[] = (() => {
  const seen = new Map<string, SectorStock>();
  for (const t of sectorTiers) {
    for (const g of t.groups) {
      for (const s of g.stocks) if (!seen.has(s.ticker)) seen.set(s.ticker, s);
    }
  }
  return [...seen.values()];
})();

export function findSectorGroup(id: string): { tier: string; group: SectorGroup } | null {
  for (const t of sectorTiers) {
    const group = t.groups.find((g) => g.id === id);
    if (group) return { tier: t.tier, group };
  }
  return null;
}
