import type { CombatState, FloorMap, PlayerState } from "../game/types";
import { sprite } from "./sprites";
import { frame, tex, TEX_SCALE } from "./atlas";
import {
  drawFloorTile, drawShadow, drawWallBlock, dungeonThemeName,
  hash2, setDungeonTheme, TH, TW, themeAmbient, WALL_H, worldToScreen, type Cam,
} from "./iso";
import { drawLighting, drawVignette, type Light } from "./lighting";
import * as fx from "./particles";

const W = 800;
const H = 450;

// ---------------- 相机与演出状态(模块级) ----------------
const cam: Cam = { x: 0, y: 0, shake: 0, shakeT: 0 };
let camInit = false;
let lungeT = 0; // 玩家前冲动画 0~1
let hitStop = 0; // 顿帧剩余秒
let facing = 1; // 1 右 / -1 左
let bobT = 0; // 走路弹跳相位
// 渲染插值: 逻辑格子即时更新, 画面坐标平滑追赶 => 连续移动观感
let prx = 0, pry = 0, prInit = false; // 玩家
const monIp = new Map<number, { x: number; y: number }>(); // 怪物(id -> 渲染格坐标)

export function shakeCam(strength = 6): void {
  cam.shake = Math.max(cam.shake, strength);
}

export function attackAnim(): void {
  lungeT = 1;
}

export function hitStopFx(sec = 0.06): void {
  hitStop = sec;
}

export function clearSceneFx(): void {
  fx.clearFx();
  cam.shake = 0;
  lungeT = 0;
  hitStop = 0;
  bobT = 0;
  worldFloats.length = 0;
  monIp.clear();
  prInit = false;
  combatAlive.clear();
}

/** 记录移动朝向并触发走路弹跳 */
export function faceDir(dx: number): void {
  if (dx !== 0) facing = dx > 0 ? 1 : -1;
  bobT = 1;
}

/** 切楼层时同步地牢主题(由 App 调用) */
export { setDungeonTheme, dungeonThemeName };

// ---------------- 0x72 精灵映射 ----------------
// 职业(spriteKey 来自 game/data) -> 动画基名 + 手持武器
const HERO_ANIM: Record<string, { idle: string; run: string; hit: string; weapon: string }> = {
  hero_mage: { idle: "wizzard_m_idle", run: "wizzard_m_run", hit: "wizzard_m_hit", weapon: "weapon_red_magic_staff" },
  hero_berserker: { idle: "knight_m_idle", run: "knight_m_run", hit: "knight_m_hit", weapon: "weapon_knight_sword" },
  hero_engineer: { idle: "elf_m_idle", run: "elf_m_run", hit: "elf_m_hit", weapon: "weapon_big_hammer" },
};
// 怪物 body(来自 game/data) -> 动画基名(idle / run 可选)
const MON_ANIM: Record<string, { idle: string; run?: string }> = {
  goblin: { idle: "goblin_idle", run: "goblin_run" },
  slime: { idle: "muddy_idle", run: "muddy_run" },
  skeleton: { idle: "skelet_idle", run: "skelet_run" },
  spider: { idle: "wogol_idle", run: "wogol_run" },
  brute: { idle: "masked_orc_idle", run: "masked_orc_run" },
  ghost: { idle: "swampy_idle", run: "swampy_run" },
  golem: { idle: "big_zombie_idle" },
  hound: { idle: "chort_idle", run: "chort_run" },
  mimic: { idle: "tiny_zombie_idle", run: "tiny_zombie_run" },
  boss: { idle: "big_demon_idle", run: "big_demon_run" },
};

/** 画一个 0x72 动画帧, 脚底中心对齐 (sx, sy+6), 帧尺寸自动放大。返回是否成功。 */
function blitActor(
  ctx: CanvasRenderingContext2D, base: string, animPhase: number, moving: boolean,
  sx: number, sy: number, scale: number, facingDir = 1,
): boolean {
  const def = moving ? (MON_ANIM[base]?.run ?? MON_ANIM[base]?.idle ?? base) : (MON_ANIM[base]?.idle ?? base);
  const img = frame(def, animPhase) ?? tex(def);
  if (!img) return false;
  const w = img.width * TEX_SCALE * scale;
  const h = img.height * TEX_SCALE * scale;
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy + 6));
  ctx.scale(facingDir, 1);
  ctx.drawImage(img, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
  ctx.restore();
  return true;
}

/** 手持武器(0x72 weapon 帧): 柄底为轴, swing 1=高举 0=落下。scale 为精灵放大倍率。 */
function drawWeapon(ctx: CanvasRenderingContext2D, key: string, sx: number, sy: number, swing: number, facing: number, scale: number): void {
  const img = tex(key);
  if (!img) return;
  const w = img.width * scale * 0.6;
  const h = img.height * scale * 0.6;
  const k = scale / TEX_SCALE;
  const hx = sx + facing * 9 * k;
  const hy = sy - 24 * k;
  const angle = (-95 + (1 - swing) * 125) * (Math.PI / 180); // 高举 -95° → 扛着 30°
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(facing, 1);
  ctx.rotate(angle * facing);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}

/** 世界格子坐标 -> 当前相机下的画布坐标(供外部在正确位置发射粒子) */
export function worldToScreenCam(gx: number, gy: number): [number, number] {
  const [wx, wy] = worldToScreen(gx, gy);
  return [wx + cam.x, wy + cam.y];
}

// 地牢世界飘字(如捡金币)
interface WorldFloat {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}
const worldFloats: WorldFloat[] = [];
export function addWorldFloat(gx: number, gy: number, text: string, color: string): void {
  worldFloats.push({ x: gx, y: gy, text, color, t: 1.2 });
}

// ---------------- 正交地牢 ----------------
export function renderDungeon(ctx: CanvasRenderingContext2D, map: FloorMap, _player: PlayerState, playerSprite: string, dt: number): void {
  if (hitStop > 0) {
    hitStop -= dt;
    dt *= 0.12; // 顿帧: 时间变慢
  }

  // 玩家渲染插值(传层瞬移直接吸附)
  if (!prInit || Math.abs(map.playerX - prx) + Math.abs(map.playerY - pry) > 3) {
    prx = map.playerX;
    pry = map.playerY;
    prInit = true;
  }
  prx += (map.playerX - prx) * Math.min(1, dt * 13);
  pry += (map.playerY - pry) * Math.min(1, dt * 13);

  // 相机跟随(平滑, 追玩家渲染位置)
  const [psx, psy] = worldToScreen(prx, pry);
  const targetX = W / 2 - psx - TW / 2;
  const targetY = H / 2 - psy - TH / 2;
  if (!camInit) {
    cam.x = targetX;
    cam.y = targetY;
    camInit = true;
  }
  cam.x += (targetX - cam.x) * Math.min(1, dt * 6);
  cam.y += (targetY - cam.y) * Math.min(1, dt * 6);
  cam.shakeT += dt;
  cam.shake = Math.max(0, cam.shake - dt * 22);
  const shakeX = cam.shake > 0 ? Math.sin(cam.shakeT * 70) * cam.shake : 0;
  const shakeY = cam.shake > 0 ? Math.cos(cam.shakeT * 63) * cam.shake * 0.7 : 0;
  const ox = cam.x + shakeX;
  const oy = cam.y + shakeY;

  const S = (gx: number, gy: number): [number, number] => {
    const [wx, wy] = worldToScreen(gx, gy);
    return [wx + ox, wy + oy];
  };

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#07060d";
  ctx.fillRect(0, 0, W, H);

  // 可视范围裁剪(只画屏内附近)
  const inView = (gx: number, gy: number): boolean => {
    const [sx, sy] = S(gx, gy);
    return sx > -TW * 2 && sx < W + TW * 2 && sy > -TH * 2 && sy < H + TH * 2;
  };
  const tileAt = (x: number, y: number): string =>
    x >= 0 && y >= 0 && x < map.cols && y < map.rows ? map.tiles[y * map.cols + x] : "void";

  // 第一轮: 地板 + 楼梯/传送门涂装
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      const t = map.tiles[i];
      if (!map.seen[i] || t === "wall") continue;
      if (!inView(x, y)) continue;
      const [sx, sy] = S(x, y);
      drawFloorTile(ctx, x, y, sx, sy);
      // 墙脚投影: 上格是墙的地板画顶部渐变阴影, 提升墙体体量感
      if (tileAt(x, y - 1) === "wall") {
        const g = ctx.createLinearGradient(0, sy, 0, sy + 18);
        g.addColorStop(0, "rgba(0,0,0,0.4)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx, sy, TW, 18);
      }
      if (!map.visible[i]) {
        ctx.fillStyle = "rgba(6,5,14,0.5)";
        ctx.fillRect(sx, sy, TW, TH);
      }
      if (t === "stairs") drawStairsDecal(ctx, sx, sy);
      else if (t === "portal") drawPortalDecal(ctx, sx, sy);
    }
  }

  // 第二轮: 墙与实体统一进列表按 y 排序(正交俯视遮挡: 近处覆盖远处)
  interface Draw {
    depth: number;
    fn: () => void;
  }
  const list: Draw[] = [];
  const torchLights: Light[] = [];
  const nowSec = performance.now() / 1000;
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      if (!map.seen[i]) continue;
      if (map.tiles[i] !== "wall" || !inView(x, y)) continue;
      const [sx, sy] = S(x, y);
      const vis = map.visible[i];
      const isFace = tileAt(x, y + 1) !== "wall" && tileAt(x, y + 1) !== "void";
      list.push({
        depth: y + 0.4,
        fn: () => drawWallBlock(ctx, x, y, sx, sy, vis, isFace),
      });
      // 立面装饰(hash 分段: 火把 0~0.2 / 旗子 0.2~0.3 / 石柱 0.3~0.36)
      if (vis && isFace) {
        const n = hash2(x * 13 + 7, y * 17 + 3);
        const cx = sx + TW / 2;
        if (n < 0.2) {
          torchLights.push({ x: cx, y: sy + WALL_H + 6, radius: 110, flicker: true, warm: "255,150,60" });
          list.push({ depth: y + 0.45, fn: () => drawWallTorch(ctx, cx, sy + WALL_H, nowSec + x) });
        } else if (n < 0.3) {
          const img = tex(n < 0.25 ? "wall_banner_red" : "wall_banner_blue");
          if (img) list.push({ depth: y + 0.45, fn: () => ctx.drawImage(img, cx - 12, sy + 8, 24, 24) });
        } else if (n < 0.36) {
          const img = tex("wall_column_mid");
          if (img) list.push({ depth: y + 0.45, fn: () => ctx.drawImage(img, cx - 16, sy + 4, 32, 32) });
        }
      }
    }
  }

  // 第三轮: 道具/怪物/玩家 追加进同一列表(墙后怪会被前方墙格正确遮挡)
  // 特殊 tile 道具
  const decorImg = (t: string): [string, number] | null => {
    if (t === "chest") return ["chest_empty_open_anim_f0", 1];
    if (t === "merchant") return ["necromancer_idle_anim_f0", 1];
    return null;
  };
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      const t = map.tiles[i];
      if (t === "wall" || !map.seen[i] || !inView(x, y)) continue;
      const [sx, sy] = S(x, y);
      if (t === "campfire") {
        list.push({
          depth: y + 0.2,
          fn: () => {
            drawShadow(ctx, sx, sy, 30);
            // 程序化篝火: 木堆 + 火焰(0x72 无篝火帧)
            ctx.drawImage(sprite("campfireProp"), Math.round(sx - 21), Math.round(sy - 22), 42, 42);
          },
        });
        continue;
      }
      if (t === "spring") {
        list.push({
          depth: y + 0.15,
          fn: () => {
            // 0x72 红色喷泉(水流动画)
            const basin = tex("wall_fountain_basin_red");
            if (basin) ctx.drawImage(basin, sx, sy, TW, TH);
            const mid = frame("wall_fountain_mid_red", Math.floor(performance.now() / 300));
            if (mid) ctx.drawImage(mid, sx, sy - 6, TW, TH);
          },
        });
        continue;
      }
      const d = decorImg(t);
      if (d) {
        const [key] = d;
        list.push({
          depth: y + 0.2,
          fn: () => {
            const img = tex(key);
            if (!img) return;
            drawShadow(ctx, sx, sy, 34);
            ctx.save();
            if (!map.visible[i]) ctx.filter = "brightness(0.45)";
            ctx.drawImage(img, sx - img.width * TEX_SCALE / 2, sy + 6 - img.height * TEX_SCALE, img.width * TEX_SCALE, img.height * TEX_SCALE);
            ctx.restore();
          },
        });
      }
    }
  }
  // 怪物(渲染位置插值 + idle/run 动画)
  for (const m of map.monsters) {
    if (m.hp <= 0) continue;
    const i = m.y * map.cols + m.x;
    if (!map.visible[i] || !inView(m.x, m.y)) continue;
    let ip = monIp.get(m.id);
    if (!ip || Math.abs(m.x - ip.x) + Math.abs(m.y - ip.y) > 3) { ip = { x: m.x, y: m.y }; monIp.set(m.id, ip); }
    const dx = m.x - ip.x, dy = m.y - ip.y;
    ip.x += dx * Math.min(1, dt * 11);
    ip.y += dy * Math.min(1, dt * 11);
    const [sx, sy] = S(ip.x, ip.y);
    const scale = m.boss ? 1.3 : m.elite ? 1.15 : 1;
    const moving = Math.abs(dx) + Math.abs(dy) > 0.05;
    const animPhase = Math.floor(performance.now() / 160 + m.id * 1.3);
    list.push({
      depth: m.y + 0.5,
      fn: () => {
        if (m.elite || m.boss) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = m.boss ? "#ff4b4b" : "#b464ff";
          ctx.beginPath();
          ctx.ellipse(sx, sy + 4, 24, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        drawShadow(ctx, sx, sy, 26 * scale);
        if (m.hp < m.maxHp) {
          const bw = 40;
          const by = sy - 52 * scale;
          ctx.fillStyle = "#0d0b16";
          ctx.fillRect(sx - bw / 2, by, bw, 4);
          ctx.fillStyle = m.boss ? "#ff4b4b" : "#4ade80";
          ctx.fillRect(sx - bw / 2, by, Math.max(1, (bw * m.hp) / m.maxHp), 4);
        }
        if (!blitActor(ctx, m.body, animPhase, moving, sx, sy, scale, 1)) {
          // 贴图未就绪时回退程序化精灵
          ctx.drawImage(sprite(m.body), Math.round(sx - 18), Math.round(sy - 42), 36, 36);
        }
      },
    });
  }
  // 玩家(前冲 + 朝向翻转 + 走路弹跳 + 待机呼吸)
  {
    const lunge = Math.sin(lungeT * Math.PI) * 10 * facing;
    const hop = Math.sin(bobT * Math.PI) * 4;
    const [sx, sy] = S(prx, pry);
    const anim = HERO_ANIM[playerSprite] ?? HERO_ANIM.hero_mage;
    const moving = bobT > 0.05 || Math.abs(map.playerX - prx) + Math.abs(map.playerY - pry) > 0.05;
    const animPhase = Math.floor(performance.now() / 150);
    list.push({
      depth: map.playerY + 0.6,
      fn: () => {
        drawShadow(ctx, sx, sy, 30);
        const ok = blitActor(ctx, moving ? anim.run : anim.idle, animPhase, false, sx + lunge, sy - hop, 1, facing);
        if (!ok) {
          ctx.save();
          ctx.translate(Math.round(sx + lunge), Math.round(sy - 26 - hop));
          ctx.scale(facing, 1);
          ctx.drawImage(sprite(playerSprite), -24, -24, 48, 48);
          ctx.restore();
        }
        drawWeapon(ctx, anim.weapon, sx + lunge, sy - hop, lungeT, facing, TEX_SCALE);
        // 选中圈
        ctx.strokeStyle = "rgba(255,230,150,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, 18, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      },
    });
  }
  list.sort((a, b) => a.depth - b.depth);
  for (const d of list) d.fn();

  // 粒子 tick(篝火/传送门/环境尘埃/火把火星)
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      if (!map.visible[i]) continue;
      const t = map.tiles[i];
      const [sx, sy] = S(x, y);
      if (t === "campfire") fx.campfireTick(sx, sy - 12, dt);
      else if (t === "portal") fx.portalTick(sx, sy, dt);
    }
  }
  // 悬浮尘埃: 可见区内低概率漂起, 经光照才显形
  if (Math.random() < dt * 5) {
    fx.dust(cam.x + Math.random() * W, cam.y + Math.random() * H);
  }
  // 火把火星
  for (const tl of torchLights) {
    if (Math.random() < dt * 3) {
      fx.campfireTick(tl.x, tl.y - 4, dt * 0.4);
    }
  }
  fx.updateFx(dt);
  fx.drawFx(ctx);

  // 光照(玩家暖光 + 火把 + 特殊地形)
  const lights: Light[] = [
    { x: psx + ox + TW / 2, y: psy + oy + TH / 2 - 14, radius: 240, intensity: 0.95, warm: "255,205,160" },
    ...torchLights,
  ];
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      if (!map.visible[i]) continue;
      const t = map.tiles[i];
      const [sx, sy] = S(x, y);
      if (t === "campfire") lights.push({ x: sx + TW / 2, y: sy, radius: 140, flicker: true, warm: "255,150,60" });
      else if (t === "portal") lights.push({ x: sx + TW / 2, y: sy + TH / 2, radius: 100, flicker: true, warm: "140,90,255" });
      else if (t === "spring") lights.push({ x: sx + TW / 2, y: sy + TH / 2, radius: 70, warm: "90,160,255" });
      else if (t === "stairs") lights.push({ x: sx + TW / 2, y: sy + TH / 2, radius: 80, warm: "255,215,120" });
      else if (t === "chest") lights.push({ x: sx + TW / 2, y: sy, radius: 55, flicker: true, warm: "255,205,90" });
      else if (t === "merchant") lights.push({ x: sx + TW / 2, y: sy, radius: 90, warm: "255,180,120" });
    }
  }
  drawLighting(ctx, W, H, lights, cam.shakeT + performance.now() / 1000, themeAmbient());
  drawVignette(ctx, W, H);

  // 地牢飘字
  for (let i = worldFloats.length - 1; i >= 0; i--) {
    const f = worldFloats[i];
    f.t -= dt;
    if (f.t <= 0) { worldFloats.splice(i, 1); continue; }
    const [sx, sy] = S(f.x, f.y);
    ctx.save();
    ctx.globalAlpha = Math.min(1, f.t);
    ctx.font = "bold 13px monospace";
    ctx.strokeStyle = "#0d0b16";
    ctx.lineWidth = 3;
    const fy = sy - 30 - (1.2 - f.t) * 26;
    ctx.strokeText(f.text, sx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, fy);
    ctx.restore();
  }

  lungeT = Math.max(0, lungeT - dt * 4);
  bobT = Math.max(0, bobT - dt * 5);
}

/** 程序化墙面火把(0x72 v1.3 无火把帧): 木杆 + 摇曳火头 */
function drawWallTorch(ctx: CanvasRenderingContext2D, cx: number, ty: number, t: number): void {
  ctx.save();
  // 木杆
  ctx.fillStyle = "#5a3a1e";
  ctx.fillRect(cx - 1, ty + 5, 3, 8);
  // 火头(摇曳)
  const sway = Math.sin(t * 6) * 1.2;
  ctx.fillStyle = "#ff6b2e";
  ctx.fillRect(cx - 2 + sway * 0.5, ty - 1, 5, 6);
  ctx.fillStyle = "#ffa03e";
  ctx.fillRect(cx - 1 + sway * 0.7, ty, 4, 4);
  ctx.fillStyle = "#fff8d8";
  ctx.fillRect(cx + sway, ty + 1, 2, 3);
  ctx.restore();
}

function drawStairsDecal(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const img = tex("floor_ladder");
  if (img) {
    ctx.drawImage(img, sx, sy, TW, TH);
  } else {
    ctx.fillStyle = "#0d0b16";
    ctx.fillRect(sx + 6, sy + 6, TW - 12, TH - 12);
  }
}

function drawPortalDecal(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const t = performance.now() / 1000;
  const cx = sx + TW / 2;
  const cy = sy + TH / 2;
  ctx.save();
  const rings: Array<[string, number]> = [
    ["rgba(74,47,146,0.85)", 20], ["rgba(138,92,240,0.8)", 13], ["rgba(200,176,255,0.75)", 7],
  ];
  for (const [color, r] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 3; i++) {
    const a = t * 2.2 + (i * Math.PI * 2) / 3;
    ctx.fillStyle = "#e8dcff";
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 13, cy + Math.sin(a) * 8, 2.4, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------- 战斗画面 ----------------
let combatT = 0;
const combatAlive = new Set<number>(); // 上一帧仍存活的怪 id(检测死亡瞬间放爆裂)

export function renderCombat(
  ctx: CanvasRenderingContext2D, state: CombatState, player: PlayerState, playerSprite: string,
  hp: number, mp: number, maxHpV: number, maxMpV: number, dt: number,
): void {
  if (hitStop > 0) {
    hitStop -= dt;
    dt *= 0.12;
  }
  combatT += dt;
  cam.shake = Math.max(0, cam.shake - dt * 22);
  ctx.imageSmoothingEnabled = false;

  // 背景: 洞窟 + 正交地面
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#131022");
  bg.addColorStop(0.7, "#0d0a18");
  bg.addColorStop(1, "#0a0812");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const gy0 = H * 0.74;
  // 背景墙: 立面排(带火把/旗子) + 上方四排墙顶, 构成完整洞窟后壁
  for (let col = -1; col < W / TW + 1; col++) {
    const face = tex("wall_mid");
    const top = tex("wall_top_mid");
    if (face) ctx.drawImage(face, col * TW, gy0 - TH, TW, TH);
    for (let r = 2; r <= 5; r++) {
      if (top) ctx.drawImage(top, col * TW, gy0 - r * TH, TW, TH);
    }
    // 立面装饰
    const n = hash2(col * 13 + 7, 3);
    const cx = col * TW + TW / 2;
    if (n < 0.22) {
      drawWallTorch(ctx, cx, gy0 - TH + WALL_H, combatT * 0.4 + col);
    } else if (n < 0.34) {
      const img = tex(n < 0.28 ? "wall_banner_red" : "wall_banner_blue");
      if (img) ctx.drawImage(img, cx - 12, gy0 - TH + 10, 24, 24);
    } else if (n < 0.4) {
      const img = tex("wall_column_mid");
      if (img) ctx.drawImage(img, cx - 16, gy0 - TH + 6, 32, 32);
    }
  }
  // 地平线雾气: 上排墙顶渐隐进黑暗
  const fog = ctx.createLinearGradient(0, gy0 - 4.2 * TH, 0, gy0 - 1.2 * TH);
  fog.addColorStop(0, "rgba(10,8,18,0.95)");
  fog.addColorStop(1, "rgba(20,16,38,0.1)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, gy0 - 4.2 * TH, W, 3 * TH);

  // 地面砖阵(0x72 地板, 行距 24 重叠铺出纵深)
  for (let row = 0; row < 6; row++) {
    for (let col = -1; col < W / TW + 1; col++) {
      drawFloorTile(ctx, col + row * 7, row, col * TW, gy0 + row * 24);
    }
  }
  ctx.fillStyle = "rgba(6,5,14,0.35)";
  ctx.fillRect(0, gy0 - 8, W, H - gy0 + 8);

  const shakeX = cam.shake > 0 ? Math.sin(combatT * 70) * cam.shake : 0;
  const shakeY = cam.shake > 0 ? Math.cos(combatT * 63) * cam.shake * 0.7 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const CS = 4; // 战斗精灵放大(帧 px * 4)
  const footY = gy0 + 44; // 站位: 脚底锚定

  // 怪物(右上排开, idle 动画, 死亡爆裂)
  for (let i = 0; i < state.monsters.length; i++) {
    const m = state.monsters[i];
    const mx = Math.round(W * (0.54 + i * 0.12));
    if (m.hp <= 0) {
      if (combatAlive.has(m.id)) {
        combatAlive.delete(m.id);
        fx.crit(mx + 32, footY - 56);
        fx.hit(mx + 32, footY - 56);
      }
      continue;
    }
    combatAlive.add(m.id);
    const img = frame(MON_ANIM[m.body]?.idle ?? m.body, Math.floor(combatT * 6 + i));
    if (!img) continue;
    // 按目标高度归一(不同怪帧高 16~28 不等, 视觉高度统一)
    const hTarget = 92 * (m.boss ? 1.35 : 1);
    const s = hTarget / img.height;
    const sw = img.width * s;
    const sh = img.height * s;
    const bob = Math.sin(combatT * 3 + i * 1.7) * 3;
    const kw = 52;
    ctx.fillStyle = "#0d0b16";
    ctx.fillRect(mx, footY - sh - 22 + bob, kw, 5);
    ctx.fillStyle = m.boss ? "#ff4b4b" : "#4ade80";
    ctx.fillRect(mx, footY - sh - 22 + bob, Math.max(1, (kw * m.hp) / m.maxHp), 5);
    ctx.font = "11px monospace";
    ctx.fillStyle = m.boss ? "#ff9b9b" : "#b8b8d0";
    ctx.fillText(m.name.slice(0, 9), mx, footY - sh - 26 + bob);
    drawShadow(ctx, mx + sw / 2, footY - 4, sw * 0.7);
    ctx.save();
    if (m.hurtFlash > 0) ctx.filter = "brightness(2.6) saturate(0.4)";
    ctx.drawImage(img, mx, footY - sh + bob, sw, sh);
    ctx.restore();
    m.hurtFlash -= dt;
  }

  // 玩家(左, 攻击前冲用 hit 帧)
  const lunge = Math.sin(lungeT * Math.PI) * 30;
  const anim = HERO_ANIM[playerSprite] ?? HERO_ANIM.hero_mage;
  const base = lungeT > 0.4 ? anim.hit : anim.idle;
  const px = Math.round(W * 0.2 + lunge);
  const pimg = frame(base, Math.floor(combatT * (lungeT > 0.4 ? 14 : 6)));
  if (pimg) {
    const sw = pimg.width * CS;
    const sh = pimg.height * CS;
    drawShadow(ctx, px + sw / 2, footY - 4, sw * 0.6);
    ctx.drawImage(pimg, px, footY - sh, sw, sh);
    drawWeapon(ctx, anim.weapon, px + sw / 2, footY, lungeT, facing, CS);
    // 玩家参照血蓝条锚在头顶
    bar(ctx, px + 8, footY - sh - 26, 96, 6, hp / maxHpV, "#ff4b4b");
    bar(ctx, px + 8, footY - sh - 15, 96, 5, mp / maxMpV, "#5b9cff");
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#e8e8f4";
    ctx.fillText(`Lv${player.level} ${player.cls}`, px + 8, footY - sh - 31);
  } else {
    bar(ctx, px + 8, footY - 138, 96, 6, hp / maxHpV, "#ff4b4b");
    bar(ctx, px + 8, footY - 127, 96, 5, mp / maxMpV, "#5b9cff");
  }
  lungeT = Math.max(0, lungeT - dt * 4);

  // 悬浮尘埃
  if (Math.random() < dt * 4) fx.dust(Math.random() * W, gy0 - Math.random() * 130);
  fx.updateFx(dt);
  fx.drawFx(ctx);
  ctx.restore();

  // 光照氛围(玩家暖光 + 怪物各自亮光, 暗幕调淡)
  drawLighting(ctx, W, H, [
    { x: px + 32, y: footY - 56, radius: 260, intensity: 0.92, warm: "255,205,160" },
    ...state.monsters.filter((m) => m.hp > 0).map((m) => ({
      x: W * (0.54 + state.monsters.indexOf(m) * 0.12) + 32,
      y: footY - 52,
      radius: 150,
      intensity: 0.92,
      flicker: !!m.boss,
      warm: m.boss ? "255,90,70" : "255,195,160",
    })),
  ], combatT, "rgba(5,6,14,0.48)");
  drawVignette(ctx, W, H);

  // 飘字(暴击金色大字)
  for (let i = state.floats.length - 1; i >= 0; i--) {
    const f = state.floats[i];
    f.t -= dt;
    if (f.t <= 0) { state.floats.splice(i, 1); continue; }
    const isCrit = f.color === "#ffd23e";
    ctx.save();
    ctx.globalAlpha = Math.min(1, f.t * 1.6);
    ctx.font = isCrit ? "bold 24px monospace" : "bold 15px monospace";
    ctx.strokeStyle = "#0d0b16";
    ctx.lineWidth = isCrit ? 4 : 3;
    const fx2 = f.x * W;
    const fy = f.y * H - (1 - f.t) * 34;
    ctx.strokeText(f.text, fx2, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx2, fy);
    ctx.restore();
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string): void {
  ctx.fillStyle = "#0d0b16";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, Math.max(0, ratio)))), h);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
