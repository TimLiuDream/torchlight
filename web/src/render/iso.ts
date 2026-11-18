// 高清暗黑地牢地形绘制 (程序化手绘石板纹理 + 2.5D 立体石墙压边 + 三大生态主题)。
// 逻辑格尺寸 TW×TH = 52×52, 离屏纹理按 2x (104×104) 烘焙以适配 Retina 高清画布。

export const TW = 52;
export const TH = 52;
export const WALL_H = 12;

export interface Cam {
  x: number;
  y: number;
  shake: number;
  shakeT: number;
}

export interface ThemeSpec {
  name: string;
  bgKey: string; // 对应战斗场景背景 hdImg key
  ambient: string;
  fogTint: string;
  floorBase: [string, string, string];
  mortar: string;
  wallCap: string;
  wallCapHi: string;
  wallFace: [string, string, string];
  roofFill: string;
  accent: string;
  accentGlow: string;
}

const THEMES: ThemeSpec[] = [
  {
    name: "幽暗石牢",
    bgKey: "bg_crypt",
    ambient: "rgba(6, 7, 16, 0.58)",
    fogTint: "rgba(8, 7, 18, 0.56)",
    floorBase: ["#232133", "#28253a", "#1e1c2c"],
    mortar: "#110f1b",
    wallCap: "#38344f",
    wallCapHi: "#58527a",
    wallFace: ["#302b44", "#272338", "#38324f"],
    roofFill: "#0b0a14",
    accent: "rgba(130, 150, 220, 0.22)",
    accentGlow: "#6f8cff",
  },
  {
    name: "幽光菌穴",
    bgKey: "bg_fungal",
    ambient: "rgba(4, 13, 12, 0.58)",
    fogTint: "rgba(5, 14, 14, 0.56)",
    floorBase: ["#1b2928", "#20302e", "#172322"],
    mortar: "#0c1615",
    wallCap: "#2b4542",
    wallCapHi: "#48756e",
    wallFace: ["#223836", "#1c2e2c", "#29423f"],
    roofFill: "#071010",
    accent: "rgba(56, 235, 196, 0.34)",
    accentGlow: "#34f5c5",
  },
  {
    name: "熔火狱岩",
    bgKey: "bg_inferno",
    ambient: "rgba(16, 6, 5, 0.56)",
    fogTint: "rgba(18, 7, 7, 0.56)",
    floorBase: ["#291c1c", "#30201f", "#221717"],
    mortar: "#130a0a",
    wallCap: "#4a2d29",
    wallCapHi: "#75473e",
    wallFace: ["#3b2320", "#2e1b19", "#452925"],
    roofFill: "#100808",
    accent: "rgba(255, 108, 42, 0.42)",
    accentGlow: "#ff6b2b",
  },
];

let themeIdx = 0;

export function setDungeonTheme(floor: number): void {
  themeIdx = floor <= 5 ? 0 : floor <= 10 ? 1 : 2;
}
export function dungeonThemeName(): string {
  return THEMES[themeIdx].name;
}
export function dungeonCombatBgKey(): string {
  return THEMES[themeIdx].bgKey;
}
export function themeAmbient(): string {
  return THEMES[themeIdx].ambient;
}
export function currentTheme(): ThemeSpec {
  return THEMES[themeIdx];
}

export function worldToScreen(x: number, y: number): [number, number] {
  return [x * TW, y * TH];
}

/** 确定性二维哈希 [0, 1) */
export function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------- 离屏高清石板与墙体烘焙缓存 ----------------
const BAKE_SIZE = 104; // 2x 纹理分辨率
const floorCache = new Map<string, HTMLCanvasElement>();
const wallFaceCache = new Map<string, HTMLCanvasElement>();

function roundSlab(
  c: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  fill: string, hi: string, lo: string,
) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  // 顶左高光斜角
  c.strokeStyle = hi;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(x + r, y + 1);
  c.lineTo(x + w - r, y + 1);
  c.moveTo(x + 1, y + r);
  c.lineTo(x + 1, y + h - r);
  c.stroke();
  // 底右暗部斜角
  c.strokeStyle = lo;
  c.beginPath();
  c.moveTo(x + r, y + h - 1);
  c.lineTo(x + w - r, y + h - 1);
  c.moveTo(x + w - 1, y + r);
  c.lineTo(x + w - 1, y + h - r);
  c.stroke();
}

function getFloorVariant(tIdx: number, variant: number): HTMLCanvasElement {
  const key = `${tIdx}:${variant}`;
  let cv = floorCache.get(key);
  if (cv) return cv;
  const spec = THEMES[tIdx];
  cv = document.createElement("canvas");
  cv.width = BAKE_SIZE;
  cv.height = BAKE_SIZE;
  const c = cv.getContext("2d")!;
  const S = BAKE_SIZE;

  // 砖缝底色
  c.fillStyle = spec.mortar;
  c.fillRect(0, 0, S, S);

  // 2×2 交错石板布局
  const splitY = 46 + ((variant * 7) % 12);
  const splitTopX = 44 + ((variant * 13) % 18);
  const splitBotX = 58 - ((variant * 11) % 18);
  const pad = 2.2;

  const slabs: Array<[number, number, number, number, number]> = [
    [pad, pad, splitTopX - pad * 1.5, splitY - pad * 1.5, 0],
    [splitTopX + pad * 0.5, pad, S - splitTopX - pad * 1.5, splitY - pad * 1.5, 1],
    [pad, splitY + pad * 0.5, splitBotX - pad * 1.5, S - splitY - pad * 1.5, 2],
    [splitBotX + pad * 0.5, splitY + pad * 0.5, S - splitBotX - pad * 1.5, S - splitY - pad * 1.5, (variant + 1) % 3],
  ];

  for (const [sx, sy, sw, sh, ci] of slabs) {
    roundSlab(
      c, sx, sy, sw, sh, 4,
      spec.floorBase[ci % 3],
      "rgba(255,255,255,0.075)",
      "rgba(0,0,0,0.34)",
    );
  }

  // 细微石纹噪点与裂隙
  for (let i = 0; i < 18; i++) {
    const nx = hash2(variant * 31 + i, tIdx * 17 + 5) * S;
    const ny = hash2(variant * 19 + i, tIdx * 29 + 11) * S;
    const nr = 1.2 + hash2(i, variant) * 2.6;
    c.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.16)";
    c.beginPath();
    c.arc(nx, ny, nr, 0, Math.PI * 2);
    c.fill();
  }

  if (variant % 3 === 0) {
    // 自然石板细裂纹
    c.strokeStyle = "rgba(0,0,0,0.38)";
    c.lineWidth = 1.4;
    c.beginPath();
    const cx = 24 + (variant * 9) % 44;
    const cy = 22 + (variant * 7) % 40;
    c.moveTo(cx, cy);
    c.lineTo(cx + 12, cy + 9);
    c.lineTo(cx + 8, cy + 21);
    c.stroke();
  }

  // 生态主题细节: 菌穴荧光苔丝 / 狱岩熔火裂隙
  if (tIdx === 1 && variant >= 5) {
    c.fillStyle = spec.accent;
    c.beginPath();
    c.arc(splitTopX, splitY, 6, 0, Math.PI * 2);
    c.arc(splitTopX + 8, splitY + 3, 3.5, 0, Math.PI * 2);
    c.fill();
  } else if (tIdx === 2 && variant >= 5) {
    c.strokeStyle = spec.accent;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(splitTopX, pad + 4);
    c.lineTo(splitTopX, splitY);
    c.lineTo(splitBotX, splitY);
    c.stroke();
  }

  floorCache.set(key, cv);
  return cv;
}

function getWallFaceVariant(tIdx: number, variant: number): HTMLCanvasElement {
  const key = `${tIdx}:${variant}`;
  let cv = wallFaceCache.get(key);
  if (cv) return cv;
  const spec = THEMES[tIdx];
  cv = document.createElement("canvas");
  cv.width = BAKE_SIZE;
  cv.height = BAKE_SIZE;
  const c = cv.getContext("2d")!;
  const S = BAKE_SIZE;

  // 顶部立体压顶檐口 (0 ~ 28px)
  const capH = 26;
  const capGrad = c.createLinearGradient(0, 0, 0, capH);
  capGrad.addColorStop(0, spec.wallCapHi);
  capGrad.addColorStop(0.22, spec.wallCap);
  capGrad.addColorStop(0.88, spec.mortar);
  capGrad.addColorStop(1, "#09070f");
  c.fillStyle = capGrad;
  c.fillRect(0, 0, S, capH);

  // 檐口顶亮线 + 分石刻痕
  c.fillStyle = "rgba(255,255,255,0.16)";
  c.fillRect(0, 1, S, 2);
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.fillRect(48 + (variant % 3) * 6, 0, 2, capH - 4);

  // 立面砌石主体 (capH ~ S)
  c.fillStyle = spec.mortar;
  c.fillRect(0, capH, S, S - capH);

  const rows = [
    [capH + 2, 23, 14 + (variant * 9) % 20],
    [capH + 27, 23, 38 + (variant * 13) % 20],
    [capH + 52, S - (capH + 54), 20 + (variant * 7) % 20],
  ];
  for (let r = 0; r < rows.length; r++) {
    const [ry, rh, split] = rows[r];
    roundSlab(c, 2, ry, split - 3, rh, 3, spec.wallFace[(r + variant) % 3], "rgba(255,255,255,0.09)", "rgba(0,0,0,0.42)");
    roundSlab(c, split + 1, ry, S - split - 3, rh, 3, spec.wallFace[(r + variant + 1) % 3], "rgba(255,255,255,0.09)", "rgba(0,0,0,0.42)");
  }

  // 墙根踢脚压暗渐变
  const baseG = c.createLinearGradient(0, S - 22, 0, S);
  baseG.addColorStop(0, "rgba(0,0,0,0)");
  baseG.addColorStop(1, "rgba(0,0,0,0.52)");
  c.fillStyle = baseG;
  c.fillRect(0, S - 22, S, 22);

  wallFaceCache.set(key, cv);
  return cv;
}

/** 地板: 8 种手绘石板变体 + 暗黑战场痕迹 */
export function drawFloorTile(ctx: CanvasRenderingContext2D, gx: number, gy: number, sx: number, sy: number): void {
  const n = hash2(gx, gy);
  const v = Math.floor(n * 8);
  const img = getFloorVariant(themeIdx, v);
  ctx.drawImage(img, sx, sy, TW, TH);

  // 稀有地面细节: 远古符文刻痕 / 碎骨 / 暗红干涸血迹
  if (n > 0.968) {
    const cx = sx + TW * 0.5;
    const cy = sy + TH * 0.52;
    ctx.save();
    ctx.strokeStyle = currentTheme().accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (n > 0.87 && n < 0.892) {
    const bx = sx + TW * 0.5 + ((n * 977) % 1 - 0.5) * 14;
    const by = sy + TH * 0.5 + ((n * 613) % 1 - 0.5) * 10;
    ctx.fillStyle = "rgba(115, 22, 24, 0.34)";
    ctx.beginPath();
    ctx.ellipse(bx, by, 6.5, 4.2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(145, 32, 28, 0.24)";
    ctx.beginPath();
    ctx.ellipse(bx + 6, by + 3, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface WallNeighbors {
  nFloor: boolean;
  sFloor: boolean;
  wFloor: boolean;
  eFloor: boolean;
}

/** 2.5D 立体石墙: 正立面画雕花檐口+三层石砌, 墙顶画深色封顶+邻边立体石框压边 */
export function drawWallBlock(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number,
  sx: number, sy: number,
  visible: boolean,
  nb: WallNeighbors,
): void {
  const spec = THEMES[themeIdx];
  ctx.save();
  if (!visible) ctx.globalAlpha = 0.52;

  if (nb.sFloor) {
    const v = Math.floor(hash2(gx * 7 + 3, gy * 13 + 1) * 4);
    ctx.drawImage(getWallFaceVariant(themeIdx, v), sx, sy, TW, TH);
  } else {
    // 墙体顶盖封顶
    ctx.fillStyle = spec.roofFill;
    ctx.fillRect(sx, sy, TW + 0.5, TH + 0.5);
    // 微弱石纹格线, 避免死黑一片
    if (hash2(gx * 19, gy * 23) < 0.35) {
      ctx.fillStyle = "rgba(255,255,255,0.022)";
      ctx.fillRect(sx + 6, sy + 6, TW - 12, TH - 12);
    }
  }

  // 北/西/东邻接地板时绘制立体石框压边, 让走廊与房间边界清晰锐利
  const rim = 5;
  if (nb.nFloor) {
    const g = ctx.createLinearGradient(0, sy, 0, sy + rim + 3);
    g.addColorStop(0, spec.wallCapHi);
    g.addColorStop(0.6, spec.wallCap);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, TW, rim + 3);
  }
  if (nb.wFloor) {
    const g = ctx.createLinearGradient(sx, 0, sx + rim + 2, 0);
    g.addColorStop(0, spec.wallCapHi);
    g.addColorStop(0.65, spec.wallCap);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, rim + 2, TH);
  }
  if (nb.eFloor) {
    const g = ctx.createLinearGradient(sx + TW, 0, sx + TW - rim - 2, 0);
    g.addColorStop(0, spec.wallCapHi);
    g.addColorStop(0.65, spec.wallCap);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx + TW - rim - 2, sy, rim + 2, TH);
  }

  ctx.restore();
}

/** 实体脚下的柔和渐变接触阴影 (以脚底中心 cx, cy 为基准) */
export function drawShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
  const rx = Math.max(6, w * 0.5);
  const ry = Math.max(3, rx * 0.42);
  ctx.save();
  ctx.translate(cx, cy + 2);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
  g.addColorStop(0, "rgba(0, 0, 0, 0.62)");
  g.addColorStop(0.65, "rgba(0, 0, 0, 0.30)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
