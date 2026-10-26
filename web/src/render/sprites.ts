// 程序化像素精灵: 字符画 + 调色板, 启动时烘焙到离屏 canvas。
// 角色精灵 12x12, 渲染时在 16px tile 内居中; 地形纹理程序化生成。

type SpriteDef = {
  rows: string[];
  palette: Record<string, string>;
};

const P = {
  outline: "#14101e",
  skin: "#f2c9a0",
  skinDark: "#c99a72",
};

const DEFS: Record<string, SpriteDef> = {
  hero_mage: {
    rows: [
      ".....00.....",
      "....0220....",
      "...022220...",
      "..02222220..",
      "..01111110..",
      "..03133130..",
      "..03333330..",
      ".0777777770.",
      ".0777777770.",
      "..07777770..",
      "..070..070..",
      "..00....00..",
    ],
    palette: { "0": P.outline, "2": "#8a5cf0", "1": "#4a2f92", "3": P.skin, "7": "#5b3aa8" },
  },
  hero_berserker: {
    rows: [
      "....0220....",
      "...022220...",
      "...023320...",
      "...031130...",
      "....0330....",
      "..00777700..",
      ".0777777770.",
      ".0770770770.",
      "..07777770..",
      "..07777770..",
      "..070..070..",
      "..00....00..",
    ],
    palette: { "0": P.outline, "2": "#c8452e", "3": P.skin, "1": "#8c2f1e", "7": "#8c5a2b" },
  },
  hero_engineer: {
    rows: [
      "....0000....",
      "...044440...",
      "...041140...",
      "...031130...",
      "....0330....",
      "..07777770..",
      ".0777777770.",
      ".0770440770.",
      "..07777770..",
      "..07777770..",
      "..070..070..",
      "..00....00..",
    ],
    palette: { "0": P.outline, "4": "#e8b23a", "3": P.skin, "1": "#3a2c14", "7": "#3e7a4f" },
  },
  goblin: {
    rows: [
      "............",
      "...00..00...",
      "..05500550..",
      "..05555550..",
      "..01555510..",
      "..05555550..",
      "...05555 0..",
      "..06666660..",
      ".0666666660.",
      "..06666660..",
      "..060..060..",
      "..00....00..",
    ],
    palette: { "0": P.outline, "5": "#6aa832", "1": "#ffffff", "6": "#4d7a24" },
  },
  slime: {
    rows: [
      "............",
      "............",
      "....0000....",
      "..00555500..",
      ".0555555550.",
      ".0515551550.",
      ".0555555550.",
      ".0555555550.",
      ".0555555550.",
      ".0555555550.",
      "..00000000..",
      "............",
    ],
    palette: { "0": P.outline, "5": "#3ec8d8", "1": "#0e3a44" },
  },
  skeleton: {
    rows: [
      "....0000....",
      "...088880...",
      "...081180...",
      "...088880...",
      "....0880....",
      "..00888800..",
      ".0888888880.",
      "..08888880..",
      "...088880...",
      "...08..80...",
      "...08..80...",
      "...00..00...",
    ],
    palette: { "0": P.outline, "8": "#e8e4d4", "1": "#14101e" },
  },
  spider: {
    rows: [
      "............",
      "0.0......0.0",
      ".00555555 0.",
      "0055555550.0",
      "..05155150..",
      "..05555550..",
      ".0055555500.",
      "0.05555550.0",
      ".0055555500.",
      "0..000000..0",
      "............",
      "............",
    ],
    palette: { "0": P.outline, "5": "#3a2c4e", "1": "#ff4b4b" },
  },
  brute: {
    rows: [
      "............",
      "..00000000..",
      ".0555555550.",
      ".0515555150.",
      ".0555115550.",
      "..05555550..",
      ".0665555660.",
      "066655556660",
      "066055550660",
      "..05555550..",
      "..060..060..",
      "..00....00..",
    ],
    palette: { "0": P.outline, "5": "#a8704a", "1": "#14101e", "6": "#7a4a2e" },
  },
  ghost: {
    rows: [
      "....0000....",
      "...0888880..",
      "..0888888 0.",
      "..08188180..",
      "..08888880..",
      "..08888880..",
      "..08888880..",
      "..08888880..",
      "..0880880...",
      "...08.080...",
      "............",
      "............",
    ],
    palette: { "0": "#4a5a8c", "8": "#aebfe8", "1": "#3a2c4e" },
  },
  golem: {
    rows: [
      "..000..000..",
      "..07700770..",
      "..07700770..",
      "..00700700..",
      ".0077777700.",
      "00777077700.",
      "00777777770.",
      "00770770770.",
      ".0077777700.",
      "..077..770..",
      "..070..070..",
      "..00....00..",
    ],
    palette: { "0": P.outline, "7": "#8a8a94", "1": "#3a3a44" },
  },
  hound: {
    rows: [
      "............",
      "............",
      ".00.....00..",
      "05500000550.",
      "055555555550",
      "05155555550.",
      "055555555000",
      "0555555550..",
      ".05555550...",
      ".050..050...",
      ".00....00...",
      "............",
    ],
    palette: { "0": P.outline, "5": "#2c2438", "1": "#ff4b4b" },
  },
  mimic: {
    rows: [
      "............",
      "..00000000..",
      ".0222222220.",
      ".0212121210.",
      ".0111111110.",
      ".0818181810.",
      ".0888888880.",
      ".0222222220.",
      ".0222022220.",
      "..00000000..",
      "............",
      "............",
    ],
    palette: { "0": P.outline, "2": "#b06030", "1": "#14101e", "8": "#ffffff" },
  },
  boss: {
    rows: [
      ".0........0.",
      ".00.0000.00.",
      ".0550550550.",
      ".0555555550.",
      ".0515555150.",
      ".0555115550.",
      "..05555550..",
      ".0665555660.",
      "066655556660",
      "066055550660",
      "..05555550..",
      "..000..000..",
    ],
    palette: { "0": P.outline, "5": "#c8283c", "1": "#ffd23e", "6": "#8c1a28" },
  },
  merchant: {
    rows: [
      "....0000....",
      "...033330...",
      "...031310...",
      "...033330...",
      "....0330....",
      "..07777770..",
      ".0777777770.",
      ".0777447770.",
      "..07777770..",
      "..07777770..",
      "..070..070..",
      "..00....00..",
    ],
    palette: { "0": P.outline, "3": "#c99a72", "1": "#14101e", "7": "#4a3a6a", "4": "#ffd23e" },
  },
  chest: {
    rows: [
      "............",
      "............",
      "..00000000..",
      ".0666666660.",
      ".0666666660.",
      ".0000000000.",
      ".0666066660.",
      ".0666046660.",
      ".0666066660.",
      ".0000000000.",
      "............",
      "............",
    ],
    palette: { "0": P.outline, "6": "#8c5a2b", "4": "#ffd23e" },
  },
};

let cache = new Map<string, HTMLCanvasElement>();

function bake(def: SpriteDef): HTMLCanvasElement {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = def.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const color = def.palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

export function sprite(key: string): HTMLCanvasElement {
  let cv = cache.get(key);
  if (!cv) {
    const def = DEFS[key];
    if (!def) throw new Error(`unknown sprite: ${key}`);
    cv = bake(def);
    cache.set(key, cv);
  }
  return cv;
}

/** 画一个角色精灵, 以 tile 中心对齐。 */
export function drawSprite(
  ctx: CanvasRenderingContext2D, key: string, tileX: number, tileY: number, tile = 16, scale = 1,
): void {
  const cv = sprite(key);
  const w = cv.width * scale;
  const h = cv.height * scale;
  const off = (tile - 12 * scale) / 2;
  ctx.drawImage(cv, Math.round(tileX * tile + off), Math.round(tileY * tile + off), w, h);
}

// ---------------- 程序化地形纹理 ----------------
let tileCache = new Map<string, HTMLCanvasElement>();

function makeTile(key: string, painter: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let cv = tileCache.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = 16;
    cv.height = 16;
    painter(cv.getContext("2d")!);
    tileCache.set(key, cv);
  }
  return cv;
}

/** 确定性伪随机(渲染噪点用, 与游戏 rng 无关)。 */
function noise(x: number, y: number, n: number): number {
  return ((x * 73856093) ^ (y * 19349663)) % n;
}

export function wallTile(): HTMLCanvasElement {
  return makeTile("wall", (ctx) => {
    ctx.fillStyle = "#2a2440";
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#1a1626";
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    for (let y = 0; y < 16; y += 4) {
      const shift = (y / 4) % 2 === 0 ? 0 : 4;
      for (let x = shift; x < 16; x += 8) ctx.fillRect(x, y, 1, 4);
    }
    ctx.fillStyle = "#332b4e";
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y + 1, 16, 1);
  });
}

export function floorTile(): HTMLCanvasElement {
  return makeTile("floor", (ctx) => {
    ctx.fillStyle = "#17141f";
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = noise(x, y, 5);
        if (n === 0) { ctx.fillStyle = "#1d1930"; ctx.fillRect(x, y, 1, 1); }
        else if (n === 1) { ctx.fillStyle = "#12101a"; ctx.fillRect(x, y, 1, 1); }
      }
  });
}

export function stairsTile(): HTMLCanvasElement {
  return makeTile("stairs", (ctx) => {
    ctx.drawImage(floorTile(), 0, 0);
    ctx.fillStyle = "#0e0c16";
    ctx.fillRect(2, 2, 12, 12);
    const grays = ["#4a4a5c", "#6a6a80", "#8a8aa0", "#b0b0c8"];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = grays[i];
      ctx.fillRect(3 + i * 0.5, 12 - i * 3, 10 - i, 2);
    }
  });
}

export function campfireTile(): HTMLCanvasElement {
  return makeTile("campfire", (ctx) => {
    ctx.drawImage(floorTile(), 0, 0);
    ctx.fillStyle = "#5a3a1e";
    ctx.fillRect(4, 11, 8, 2);
    ctx.fillStyle = "#7a5228";
    ctx.fillRect(3, 12, 10, 2);
    ctx.fillStyle = "#ff7a2e";
    ctx.fillRect(6, 6, 4, 5);
    ctx.fillRect(5, 8, 6, 3);
    ctx.fillStyle = "#ffd23e";
    ctx.fillRect(7, 8, 2, 3);
    ctx.fillRect(6, 9, 4, 2);
    ctx.fillStyle = "#fff4c8";
    ctx.fillRect(7, 10, 2, 1);
  });
}

export function springTile(): HTMLCanvasElement {
  return makeTile("spring", (ctx) => {
    ctx.drawImage(floorTile(), 0, 0);
    ctx.fillStyle = "#0e0c16";
    ctx.fillRect(2, 4, 12, 10);
    ctx.fillStyle = "#2e6ac8";
    ctx.fillRect(3, 5, 10, 8);
    ctx.fillStyle = "#5b9cff";
    ctx.fillRect(4, 6, 8, 2);
    ctx.fillRect(5, 10, 6, 2);
    ctx.fillStyle = "#c8e8ff";
    ctx.fillRect(6, 7, 2, 1);
  });
}

export function chestTile(): HTMLCanvasElement {
  return makeTile("chest", (ctx) => {
    ctx.drawImage(floorTile(), 0, 0);
    ctx.drawImage(sprite("chest"), 2, 2);
  });
}

export function portalTile(): HTMLCanvasElement {
  return makeTile("portal", (ctx) => {
    ctx.drawImage(floorTile(), 0, 0);
    const rings: Array<[string, number]> = [
      ["#4a2f92", 7], ["#8a5cf0", 5], ["#c8b0ff", 3], ["#ffffff", 1],
    ];
    for (const [color, r] of rings) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(8, 8, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function merchantTile(): HTMLCanvasElement {
  return makeTile("merchant", (ctx) => {
    ctx.drawImage(floorTile(), 0, 0);
    ctx.drawImage(sprite("merchant"), 2, 2);
  });
}

export function mimicTile(): HTMLCanvasElement {
  return makeTile("mimic", (ctx) => {
    ctx.drawImage(floorTile(), 0, 0);
    ctx.drawImage(sprite("mimic"), 2, 2);
  });
}
