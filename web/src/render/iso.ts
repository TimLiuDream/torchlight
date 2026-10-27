// 正交俯视地形绘制(0x72 DungeonTileset II v1.3, CC0)。
// 屏幕坐标: sx = x*TILE, sy = y*TILE。实体与地形按 y 升序绘制。
// 墙体规则: 下方(y+1)是地板的墙格画立面 wall_mid, 其余画 wall_top_* 系列。

import { tex, TEX_SCALE } from "./atlas";

export const TW = 48; // tile 显示边长 (16px * 3)
export const TH = 48;
export const WALL_H = 10; // 立面墙上挂件(火把)的 y 偏移

export interface Cam {
  x: number; // 屏幕平移
  y: number;
  shake: number; // 震动强度 px
  shakeT: number; // 震动相位
}

/** 楼层主题: 仅影响光照暗幕色调与装饰色(0x72 地形为固定色系) */
const THEMES = [
  { ambient: "rgba(5,6,14,0.62)", deco: "rgba(150,165,220,0.18)" }, // 石牢
  { ambient: "rgba(4,12,7,0.64)", deco: "rgba(120,210,140,0.2)" }, // 菌穴
  { ambient: "rgba(14,4,4,0.62)", deco: "rgba(235,110,70,0.2)" }, // 狱岩
];
let themeIdx = 0;

/** 按楼层深度切换地牢主题(1-5 石牢 / 6-10 菌穴 / 11+ 狱岩) */
export function setDungeonTheme(floor: number): void {
  themeIdx = floor <= 5 ? 0 : floor <= 10 ? 1 : 2;
}
export function dungeonThemeName(): string {
  return ["石牢", "菌穴", "狱岩"][themeIdx];
}
export function themeAmbient(): string {
  return THEMES[themeIdx].ambient;
}
export function themeDeco(): string {
  return THEMES[themeIdx].deco;
}

export function worldToScreen(x: number, y: number): [number, number] {
  return [x * TW, y * TH];
}

/** 确定性噪点(与位置绑定, 避免每帧闪烁)。乘法混合+位移雪崩。 */
export function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function blit(key: string, sx: number, sy: number, w = TW, h = TH): boolean {
  const img = tex(key);
  if (!img) return false;
  ctxDraw(img, sx, sy, w, h);
  return true;
}
// 模块内转发, 供 blit 使用
let _ctx: CanvasRenderingContext2D | null = null;
function ctxDraw(img: HTMLImageElement, sx: number, sy: number, w: number, h: number): void {
  if (_ctx) _ctx.drawImage(img, sx, sy, w, h);
}

/** 地板: 8 种砖面变体按噪声挑选 */
export function drawFloorTile(ctx: CanvasRenderingContext2D, gx: number, gy: number, sx: number, sy: number): void {
  _ctx = ctx;
  const n = hash2(gx, gy);
  const v = 1 + Math.floor(n * 8);
  if (!blit(`floor_${v}`, sx, sy)) {
    ctx.fillStyle = "#1b1728";
    ctx.fillRect(sx, sy, TW, TH);
  }
  // 少量装饰: 头骨 / 坑洞 / 主题色污渍 / 血迹
  if (n > 0.965) blit("skull", sx, sy);
  else if (n < 0.02) blit("hole", sx, sy);
  else if (n > 0.9 && n < 0.93) {
    ctx.fillStyle = themeDeco();
    ctx.beginPath();
    ctx.ellipse(sx + TW / 2, sy + TH / 2, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (n > 0.86 && n < 0.885) {
    // 地面血迹(前人战斗的痕迹): 暗红斑点簇
    const bx = sx + TW / 2 + ((n * 977) % 1) * 14 - 7;
    const by = sy + TH / 2 + ((n * 613) % 1) * 10 - 5;
    ctx.fillStyle = "rgba(122,26,26,0.38)";
    ctx.beginPath();
    ctx.ellipse(bx, by, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(152,38,32,0.3)";
    ctx.beginPath();
    ctx.ellipse(bx + 7, by + 3, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bx - 5, by + 5, 2.5, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  _ctx = null;
}

/** 墙格: face(下邻是地板)画正常亮度砖面, 内部画压暗砖面 —— 无透明悬空 */
export function drawWallBlock(
  ctx: CanvasRenderingContext2D, gx: number, gy: number, sx: number, sy: number,
  visible: boolean, isFloorBelow: boolean,
): void {
  _ctx = ctx;
  ctx.save();
  if (!visible) ctx.filter = "brightness(0.5)";
  if (isFloorBelow) {
    // 朝向地板的墙: 正常亮度砖面
    if (!blit("wall_mid", sx, sy)) {
      ctx.fillStyle = "#2a2440";
      ctx.fillRect(sx, sy, TW, TH);
    }
  } else {
    // 墙体内部: 同贴图满格砖面 + 压暗, 彻底消除 0x72 top 贴图透明区造成的悬空砖带
    if (blit("wall_mid", sx, sy)) {
      ctx.fillStyle = "rgba(8,6,18,0.5)";
      ctx.fillRect(sx, sy, TW, TH);
    } else {
      ctx.fillStyle = "#181428";
      ctx.fillRect(sx, sy, TW, TH);
    }
    if (hash2(gx * 31, gy * 57) < 0.04) blit(hash2(gx, gy) < 0.5 ? "wall_hole_1" : "wall_hole_2", sx, sy);
  }
  ctx.restore();
  _ctx = null;
}

/** 独立装饰: 石柱(顶/身/基 三段拼在墙格上, 替代部分火把位) */
export function drawColumn(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  _ctx = ctx;
  blit("column_mid", sx, sy);
  _ctx = null;
}

/** 实体脚下的椭圆阴影 */
export function drawShadow(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + 4, w / 2, w / 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

export { TEX_SCALE };
