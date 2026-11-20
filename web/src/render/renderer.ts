import type { CombatState, FloorMap, PlayerState } from "../game/types";
import { hdImg, monsterCombatFlip, monsterFacesRight, monsterHdKey } from "./hdAssets";
import {
  drawBloodVignette,
  drawHeroCompanionProps,
  drawProjectilesFx,
  drawPuppetSprite,
  drawUnderActorsFx,
  getCombatCamera,
  getHeroPose,
  getMonPose,
  playHeroAction,
  playMonsterAttack,
  resetCombatAnim,
  triggerMonsterHit,
  updateCombatAnim,
} from "./combatAnim";
import {
  currentTheme, drawFloorTile, drawShadow, drawWallBlock,
  dungeonCombatBgKey, dungeonThemeName, hash2, setDungeonTheme,
  TH, TW, themeAmbient, worldToScreen, type Cam,
} from "./iso";
import { drawLighting, drawVignette, type Light } from "./lighting";
import * as fx from "./particles";

export {
  playHeroAction,
  playMonsterAttack,
  resetCombatAnim,
  triggerMonsterHit,
};

export type LogicalCanvas = HTMLCanvasElement & { __logicalW?: number; __logicalH?: number };

let mainCanvas: LogicalCanvas | null = null;

function canvasLogicalSize(cv: LogicalCanvas | null): { w: number; h: number } {
  if (!cv) return { w: 880, h: 495 };
  return {
    w: cv.__logicalW ?? cv.width ?? 880,
    h: cv.__logicalH ?? cv.height ?? 495,
  };
}

/** 最近一帧渲染的逻辑画布尺寸 */
export function gameCanvasSize(): { w: number; h: number } {
  return canvasLogicalSize(mainCanvas);
}

// ---------------- 相机与演出状态 ----------------
const cam: Cam = { x: 0, y: 0, shake: 0, shakeT: 0 };
let camInit = false;
let lungeT = 0;
let hitStop = 0;
let facing = 1;
let bobT = 0;

let prx = 0, pry = 0, prInit = false;
const monIp = new Map<number, { x: number; y: number; dir: number }>();
const combatTrailHp = new Map<number, number>();

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
  resetCombatAnim();
  cam.shake = 0;
  camInit = false;
  lungeT = 0;
  hitStop = 0;
  bobT = 0;
  worldFloats.length = 0;
  monIp.clear();
  prInit = false;
  combatAlive.clear();
  combatTrailHp.clear();
}

export function faceDir(dx: number): void {
  if (dx !== 0) facing = dx > 0 ? 1 : -1;
  bobT = 1;
}

export { setDungeonTheme, dungeonThemeName };

// ---------------- 进层转场 ----------------
interface FloorTransition { t: number; dur: number; floor: number; theme: string; }
let trans: FloorTransition | null = null;
export function startFloorTransition(floor: number, theme: string): void {
  trans = { t: 0, dur: 1.45, floor, theme };
}

/** 世界格子中心 -> 当前相机下的逻辑画布坐标 */
export function worldToScreenCam(gx: number, gy: number): [number, number] {
  const [wx, wy] = worldToScreen(gx, gy);
  return [wx + TW * 0.5 + cam.x, wy + TH * 0.55 + cam.y];
}

interface WorldFloat {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}
const worldFloats: WorldFloat[] = [];
export function addWorldFloat(gx: number, gy: number, text: string, color: string): void {
  worldFloats.push({ x: gx, y: gy, text, color, t: 1.25 });
}

/** 地牢探索角色绘制: 支持步伐颠簸摆动与待机呼吸变形 */
function drawDungeonActor(
  ctx: CanvasRenderingContext2D,
  key: string,
  cx: number,
  footY: number,
  targetH: number,
  flipX: number,
  opts: {
    breathPhase?: number;
    moving?: boolean;
    leanRad?: number;
    fallbackColor?: string;
  } = {},
): void {
  const img = hdImg(key);
  const bp = opts.breathPhase ?? 0;
  const breath = Math.sin(bp) * 0.03;
  const stride = opts.moving ? Math.sin(bp * 4.2) * 0.11 : 0;
  const hop = opts.moving ? Math.abs(Math.sin(bp * 4.2)) * (targetH * 0.1) : 0;

  if (!img) {
    const w = targetH * 0.62;
    ctx.save();
    ctx.translate(cx, footY - hop);
    ctx.fillStyle = opts.fallbackColor ?? "#6d5dfc";
    ctx.beginPath();
    ctx.ellipse(0, -targetH * 0.48, w * 0.42, targetH * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const h = targetH;
  const w = h * aspect;

  ctx.save();
  ctx.translate(cx, footY - hop);
  ctx.scale(flipX * (1 - breath * 0.6), 1 + breath);
  if (opts.leanRad || stride) {
    ctx.rotate((opts.leanRad ?? 0) + stride);
  }
  ctx.drawImage(img, -w * 0.5, -h, w, h);
  ctx.restore();
}

function drawAuraCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, time: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.46);
  ctx.rotate(time * 0.9);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ================================================================
// 1. 地牢探索渲染
// ================================================================
export function renderDungeon(
  ctx: CanvasRenderingContext2D,
  map: FloorMap,
  _player: PlayerState,
  playerSprite: string,
  dt: number,
): void {
  const cv = ctx.canvas as LogicalCanvas;
  mainCanvas = cv;
  const { w: W, h: H } = canvasLogicalSize(cv);

  if (hitStop > 0) {
    hitStop -= dt;
    dt *= 0.12;
  }

  if (!prInit || Math.abs(map.playerX - prx) + Math.abs(map.playerY - pry) > 3) {
    prx = map.playerX;
    pry = map.playerY;
    prInit = true;
  }
  prx += (map.playerX - prx) * Math.min(1, dt * 13);
  pry += (map.playerY - pry) * Math.min(1, dt * 13);

  const [psx, psy] = worldToScreen(prx, pry);
  const targetX = W * 0.5 - (psx + TW * 0.5);
  const targetY = H * 0.5 - (psy + TH * 0.5);
  if (!camInit) {
    cam.x = targetX;
    cam.y = targetY;
    camInit = true;
  }
  cam.x += (targetX - cam.x) * Math.min(1, dt * 6.5);
  cam.y += (targetY - cam.y) * Math.min(1, dt * 6.5);
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

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const theme = currentTheme();

  ctx.fillStyle = theme.roofFill;
  ctx.fillRect(0, 0, W, H);

  const inView = (gx: number, gy: number): boolean => {
    const [sx, sy] = S(gx, gy);
    return sx > -TW * 2 && sx < W + TW * 2 && sy > -TH * 2 && sy < H + TH * 2;
  };
  const kindAt = (x: number, y: number): string =>
    x >= 0 && y >= 0 && x < map.cols && y < map.rows ? map.tiles[y * map.cols + x] : "void";
  const isWalkableAt = (x: number, y: number): boolean => {
    const k = kindAt(x, y);
    return k !== "wall" && k !== "void";
  };

  const nowSec = performance.now() / 1000;

  // 第一遍: 地板与阴影
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      const t = map.tiles[i];
      if (!map.seen[i] || t === "wall" || !inView(x, y)) continue;
      const [sx, sy] = S(x, y);
      drawFloorTile(ctx, x, y, sx, sy);

      if (kindAt(x, y - 1) === "wall") {
        const g = ctx.createLinearGradient(0, sy, 0, sy + 20);
        g.addColorStop(0, "rgba(0,0,0,0.52)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx, sy, TW, 20);
      }
      if (kindAt(x - 1, y) === "wall") {
        const g = ctx.createLinearGradient(sx, 0, sx + 10, 0);
        g.addColorStop(0, "rgba(0,0,0,0.34)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx, sy, 10, TH);
      }
      if (kindAt(x + 1, y) === "wall") {
        const g = ctx.createLinearGradient(sx + TW, 0, sx + TW - 10, 0);
        g.addColorStop(0, "rgba(0,0,0,0.34)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx + TW - 10, sy, 10, TH);
      }

      if (t === "stairs") drawStairsDecal(ctx, sx, sy, nowSec);
      else if (t === "portal") drawPortalDecal(ctx, sx, sy, nowSec);

      if (!map.visible[i]) {
        ctx.fillStyle = theme.fogTint;
        ctx.fillRect(sx, sy, TW, TH);
      }
    }
  }

  // 第二遍: 墙体、道具、怪物、主角 Y 排序
  interface DrawCmd {
    depth: number;
    fn: () => void;
  }
  const list: DrawCmd[] = [];
  const torchLights: Light[] = [];

  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      if (!map.seen[i] || map.tiles[i] !== "wall" || !inView(x, y)) continue;
      const [sx, sy] = S(x, y);
      const vis = map.visible[i];
      const nb = {
        nFloor: isWalkableAt(x, y - 1),
        sFloor: isWalkableAt(x, y + 1),
        wFloor: isWalkableAt(x - 1, y),
        eFloor: isWalkableAt(x + 1, y),
      };
      list.push({
        depth: y + 0.35,
        fn: () => drawWallBlock(ctx, x, y, sx, sy, vis, nb),
      });

      if (vis && nb.sFloor) {
        const n = hash2(x * 13 + 7, y * 17 + 3);
        const cx = sx + TW * 0.5;
        if (n < 0.2) {
          torchLights.push({ x: cx, y: sy + 24, radius: 132, flicker: true, warm: "255,155,65" });
          list.push({ depth: y + 0.42, fn: () => drawWallTorch(ctx, cx, sy + 18, nowSec + x * 0.7) });
        } else if (n < 0.29) {
          const crimson = n < 0.245;
          list.push({ depth: y + 0.42, fn: () => drawWallBanner(ctx, cx, sy + 14, crimson) });
        } else if (n < 0.36) {
          list.push({ depth: y + 0.42, fn: () => drawWallPilaster(ctx, cx, sy + 11) });
        }
      }
    }
  }

  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      const t = map.tiles[i];
      if (t === "wall" || !map.seen[i] || !inView(x, y)) continue;
      const [sx, sy] = S(x, y);
      const cx = sx + TW * 0.5;
      const cy = sy + TH * 0.56;
      const vis = map.visible[i];

      if (t === "campfire") {
        list.push({ depth: y + 0.48, fn: () => drawCampfireProp(ctx, cx, cy, nowSec, vis) });
      } else if (t === "spring") {
        list.push({ depth: y + 0.48, fn: () => drawSpringProp(ctx, cx, cy, nowSec, vis) });
      } else if (t === "chest") {
        list.push({ depth: y + 0.5, fn: () => drawChestProp(ctx, cx, cy + 4, nowSec, vis) });
      } else if (t === "merchant") {
        list.push({ depth: y + 0.52, fn: () => drawMerchantProp(ctx, sx, sy, cx, cy + 6, nowSec, vis) });
      }
    }
  }

  for (const m of map.monsters) {
    if (m.hp <= 0) continue;
    const i = m.y * map.cols + m.x;
    if (!map.visible[i] || !inView(m.x, m.y)) continue;
    let ip = monIp.get(m.id);
    if (!ip || Math.abs(m.x - ip.x) + Math.abs(m.y - ip.y) > 3) {
      ip = { x: m.x, y: m.y, dir: -1 };
      monIp.set(m.id, ip);
    }
    const dx = m.x - ip.x;
    const dy = m.y - ip.y;
    if (Math.abs(dx) > 0.02) ip.dir = dx > 0 ? 1 : -1;
    ip.x += dx * Math.min(1, dt * 11);
    ip.y += dy * Math.min(1, dt * 11);

    const [sx, sy] = S(ip.x, ip.y);
    const cx = sx + TW * 0.5;
    const footY = sy + TH * 0.8;
    const moving = Math.abs(dx) + Math.abs(dy) > 0.04;
    const targetH = m.boss ? 84 : m.elite ? 66 : 54;
    // 素材原始朝向不同: 面右素材的镜像方向需要反过来
    const flipX = monsterFacesRight(m.body) ? (ip.dir > 0 ? 1 : -1) : ip.dir > 0 ? -1 : 1;

    if (m.elite || m.boss) {
      fx.orbitTick(cx, footY - 8, 24, m.id, dt, m.boss ? "#ff7849" : "#c084fc");
    }

    list.push({
      depth: ip.y + 0.62,
      fn: () => {
        if (m.elite || m.boss) {
          drawAuraCircle(ctx, cx, footY - 2, m.boss ? 28 : 22, m.boss ? "#ff5238" : "#b36bff", nowSec);
        }
        drawShadow(ctx, cx, footY, targetH * 0.58);
        drawDungeonActor(ctx, monsterHdKey(m.body), cx, footY, targetH, flipX, {
          breathPhase: nowSec * 3.4 + m.id * 1.7,
          moving,
          fallbackColor: m.boss ? "#ef4444" : "#a855f7",
        });
        if (m.hp < m.maxHp) {
          drawMiniBar(ctx, cx - 22, footY - targetH - 8, 44, 5, m.hp / m.maxHp, m.boss ? "#ff5238" : "#4ade80");
        }
      },
    });
  }

  {
    const playerMoving = Math.abs(map.playerX - prx) + Math.abs(map.playerY - pry) > 0.03 || bobT > 0.15;
    const lunge = Math.sin(lungeT * Math.PI) * 12 * facing;
    const [sx, sy] = S(prx, pry);
    const cx = sx + TW * 0.5 + lunge;
    const footY = sy + TH * 0.82;
    const heroH = 64;

    list.push({
      depth: pry + 0.68,
      fn: () => {
        ctx.save();
        ctx.strokeStyle = "rgba(245, 202, 92, 0.45)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(cx - lunge, footY - 1, 18, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        drawShadow(ctx, cx, footY, 38);
        drawDungeonActor(ctx, playerSprite, cx, footY, heroH, facing, {
          breathPhase: nowSec * 3.2,
          moving: playerMoving,
          leanRad: lungeT > 0.05 ? 0.14 * facing : 0,
          fallbackColor: "#eab308",
        });
      },
    });
  }

  list.sort((a, b) => a.depth - b.depth);
  for (const cmd of list) cmd.fn();

  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      if (!map.visible[i] || !inView(x, y)) continue;
      const t = map.tiles[i];
      const [sx, sy] = S(x, y);
      const cx = sx + TW * 0.5;
      const cy = sy + TH * 0.5;
      if (t === "campfire") fx.campfireTick(cx, cy - 6, dt);
      else if (t === "portal") fx.portalTick(cx, cy, dt);
    }
  }
  if (Math.random() < dt * 6) {
    fx.dust(Math.random() * W, Math.random() * H, theme.accentGlow);
  }
  for (const tl of torchLights) {
    if (Math.random() < dt * 3.2) {
      fx.campfireTick(tl.x, tl.y - 4, dt * 0.45);
    }
  }
  fx.updateFx(dt);
  fx.drawFx(ctx);

  const pCenterX = psx + ox + TW * 0.5;
  const pCenterY = psy + oy + TH * 0.45;
  const lights: Light[] = [
    { x: pCenterX, y: pCenterY, radius: 275, intensity: 0.86, warm: "255,205,155" },
    { x: pCenterX, y: pCenterY - 4, radius: 110, intensity: 1, warm: "255,228,192" },
    ...torchLights,
  ];
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      if (!map.visible[i] || !inView(x, y)) continue;
      const t = map.tiles[i];
      const [sx, sy] = S(x, y);
      const cx = sx + TW * 0.5;
      const cy = sy + TH * 0.5;
      if (t === "campfire") lights.push({ x: cx, y: cy - 4, radius: 165, flicker: true, warm: "255,148,58" });
      else if (t === "portal") lights.push({ x: cx, y: cy, radius: 120, flicker: true, warm: "168,105,255" });
      else if (t === "spring") lights.push({ x: cx, y: cy, radius: 95, warm: "72,202,255" });
      else if (t === "stairs") lights.push({ x: cx, y: cy, radius: 92, warm: "255,210,115" });
      else if (t === "chest") lights.push({ x: cx, y: cy, radius: 68, flicker: true, warm: "255,208,96" });
      else if (t === "merchant") lights.push({ x: cx, y: cy - 4, radius: 110, warm: "255,186,120" });
    }
  }
  drawLighting(ctx, W, H, lights, nowSec, themeAmbient());
  drawVignette(ctx, W, H);

  if (trans) {
    trans.t += dt;
    const p = trans.t / trans.dur;
    if (p >= 1) {
      trans = null;
    } else {
      let a: number;
      if (p < 0.28) a = (p / 0.28) * 0.9;
      else if (p < 0.64) a = 0.9;
      else a = ((1 - (p - 0.64) / 0.36) ** 1.4) * 0.9;
      ctx.fillStyle = `rgba(5, 4, 11, ${a})`;
      ctx.fillRect(0, 0, W, H);
      if (p > 0.2 && p < 0.84) {
        const ta = Math.min(1, (0.84 - Math.abs(p - 0.52) * 4.8) * 1.8);
        ctx.save();
        ctx.globalAlpha = ta;
        ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(212, 164, 76, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W * 0.34, H * 0.5 + 4);
        ctx.lineTo(W * 0.66, H * 0.5 + 4);
        ctx.stroke();

        ctx.font = '700 36px "Cinzel", "Noto Serif SC", Georgia, serif';
        ctx.strokeStyle = "#08060e";
        ctx.lineWidth = 6;
        ctx.strokeText(`第 ${trans.floor} 层`, W * 0.5, H * 0.5 - 10);
        ctx.fillStyle = "#f4cb69";
        ctx.fillText(`第 ${trans.floor} 层`, W * 0.5, H * 0.5 - 10);

        ctx.font = '600 15px "Noto Serif SC", "PingFang SC", sans-serif';
        ctx.fillStyle = "#c4bed8";
        ctx.fillText(`✦  ${trans.theme}  ✦`, W * 0.5, H * 0.5 + 28);
        ctx.textAlign = "left";
        ctx.restore();
      }
    }
  }

  for (let i = worldFloats.length - 1; i >= 0; i--) {
    const f = worldFloats[i];
    f.t -= dt;
    if (f.t <= 0) { worldFloats.splice(i, 1); continue; }
    const [sx, sy] = S(f.x, f.y);
    const cx = sx + TW * 0.5;
    const fy = sy - 10 - (1.25 - f.t) * 28;
    ctx.save();
    ctx.globalAlpha = Math.min(1, f.t);
    ctx.textAlign = "center";
    ctx.font = '700 15px "Cinzel", "Noto Serif SC", sans-serif';
    ctx.strokeStyle = "#090712";
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, cx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, cx, fy);
    ctx.restore();
  }

  lungeT = Math.max(0, lungeT - dt * 4.2);
  bobT = Math.max(0, bobT - dt * 5);
}

// ---------------- 高清矢量手绘地牢物件 ----------------
function drawWallTorch(ctx: CanvasRenderingContext2D, cx: number, ty: number, t: number): void {
  ctx.save();
  ctx.strokeStyle = "#1c1826";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, ty + 14);
  ctx.lineTo(cx, ty + 4);
  ctx.stroke();
  ctx.fillStyle = "#5d4632";
  ctx.fillRect(cx - 2.5, ty + 3, 5, 10);
  ctx.fillStyle = "#8c6d46";
  ctx.fillRect(cx - 3.5, ty + 2, 7, 2.5);

  const sway = Math.sin(t * 6.5) * 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - 4.5, ty + 2);
  ctx.quadraticCurveTo(cx - 5 + sway * 0.4, ty - 6, cx + sway, ty - 11);
  ctx.quadraticCurveTo(cx + 5 + sway * 0.4, ty - 6, cx + 4.5, ty + 2);
  ctx.closePath();
  ctx.fillStyle = "#ff6b2b";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - 2.6, ty + 2);
  ctx.quadraticCurveTo(cx + sway * 0.6, ty - 7, cx + 2.6, ty + 2);
  ctx.fillStyle = "#ffd166";
  ctx.fill();
  ctx.restore();
}

function drawWallBanner(ctx: CanvasRenderingContext2D, cx: number, ty: number, crimson: boolean): void {
  ctx.save();
  ctx.fillStyle = "#8a6d3b";
  ctx.fillRect(cx - 10, ty, 20, 2.5);
  ctx.beginPath();
  ctx.moveTo(cx - 8, ty + 2.5);
  ctx.lineTo(cx + 8, ty + 2.5);
  ctx.lineTo(cx + 8, ty + 24);
  ctx.lineTo(cx, ty + 19);
  ctx.lineTo(cx - 8, ty + 24);
  ctx.closePath();
  ctx.fillStyle = crimson ? "#7c1d26" : "#23386b";
  ctx.fill();
  ctx.strokeStyle = "#d4a44c";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawWallPilaster(ctx: CanvasRenderingContext2D, cx: number, ty: number): void {
  ctx.save();
  const g = ctx.createLinearGradient(cx - 8, 0, cx + 8, 0);
  g.addColorStop(0, "#1d1a2b");
  g.addColorStop(0.45, "#464060");
  g.addColorStop(1, "#181524");
  ctx.fillStyle = g;
  ctx.fillRect(cx - 7, ty + 3, 14, 34);
  ctx.fillStyle = "#564f74";
  ctx.fillRect(cx - 9, ty, 18, 4);
  ctx.fillRect(cx - 9, ty + 35, 18, 4);
  ctx.restore();
}

function drawStairsDecal(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
  const pad = 7;
  const w = TW - pad * 2;
  const h = TH - pad * 2;
  ctx.save();
  ctx.fillStyle = "#08060e";
  ctx.beginPath();
  ctx.roundRect(sx + pad, sy + pad, w, h, 4);
  ctx.fill();

  for (let s = 0; s < 4; s++) {
    const syStep = sy + pad + 3 + s * 8.5;
    const shade = 68 - s * 13;
    ctx.fillStyle = `rgb(${shade}, ${shade - 6}, ${shade + 14})`;
    ctx.fillRect(sx + pad + 3 + s * 1.5, syStep, w - 6 - s * 3, 6.5);
  }

  const pulse = 0.28 + Math.sin(t * 3) * 0.08;
  const g = ctx.createRadialGradient(sx + TW * 0.5, sy + TH - 10, 2, sx + TW * 0.5, sy + TH - 10, 22);
  g.addColorStop(0, `rgba(255, 200, 92, ${pulse})`);
  g.addColorStop(1, "rgba(255, 160, 50, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(sx + pad, sy + pad, w, h);

  ctx.strokeStyle = "#8a7248";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(sx + pad, sy + pad, w, h, 4);
  ctx.stroke();
  ctx.restore();
}

function drawPortalDecal(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
  const cx = sx + TW * 0.5;
  const cy = sy + TH * 0.54;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.62);

  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 23);
  g.addColorStop(0, "#fff0c2");
  g.addColorStop(0.38, "#a855f7");
  g.addColorStop(0.78, "rgba(88, 28, 135, 0.72)");
  g.addColorStop(1, "rgba(46, 16, 101, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 23, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(t * 1.5);
  ctx.strokeStyle = "#e9d5ff";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCampfireProp(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, vis: boolean): void {
  ctx.save();
  if (!vis) ctx.filter = "brightness(0.45)";
  drawShadow(ctx, cx, cy + 6, 40);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rx = cx + Math.cos(a) * 16;
    const ry = cy + 4 + Math.sin(a) * 8;
    ctx.fillStyle = i % 2 ? "#4a465c" : "#383448";
    ctx.beginPath();
    ctx.ellipse(rx, ry, 4.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#4f311c";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy + 6);
  ctx.lineTo(cx + 11, cy - 1);
  ctx.moveTo(cx + 11, cy + 6);
  ctx.lineTo(cx - 11, cy - 1);
  ctx.stroke();

  const sway = Math.sin(t * 7.2) * 2.4;
  const hBoost = Math.cos(t * 9.5) * 2;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy + 3);
  ctx.quadraticCurveTo(cx - 11, cy - 12, cx + sway, cy - 22 - hBoost);
  ctx.quadraticCurveTo(cx + 11, cy - 12, cx + 10, cy + 3);
  ctx.closePath();
  ctx.fillStyle = "#ff5c24";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - 6.5, cy + 3);
  ctx.quadraticCurveTo(cx - 6, cy - 8, cx + sway * 0.7, cy - 15 - hBoost * 0.6);
  ctx.quadraticCurveTo(cx + 6, cy - 8, cx + 6.5, cy + 3);
  ctx.closePath();
  ctx.fillStyle = "#ffb703";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 3.5, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#fff8d6";
  ctx.fill();
  ctx.restore();
}

function drawSpringProp(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, vis: boolean): void {
  ctx.save();
  if (!vis) ctx.filter = "brightness(0.45)";
  drawShadow(ctx, cx, cy + 7, 42);

  ctx.fillStyle = "#494d63";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3, 19, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#767d9c";
  ctx.lineWidth = 2;
  ctx.stroke();

  const g = ctx.createRadialGradient(cx, cy + 2, 2, cx, cy + 2, 15);
  g.addColorStop(0, "#e0faff");
  g.addColorStop(0.45, "#38bdf8");
  g.addColorStop(1, "#0369a1");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 15, 8.2, 0, 0, Math.PI * 2);
  ctx.fill();

  const r = 4 + ((t * 9) % 10);
  ctx.strokeStyle = `rgba(255,255,255,${1 - (r - 4) / 10})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, r, r * 0.52, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawChestProp(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, vis: boolean): void {
  ctx.save();
  if (!vis) ctx.filter = "brightness(0.45)";
  drawShadow(ctx, cx, cy + 4, 36);

  const w = 28, h = 20;
  const x = cx - w * 0.5;
  const y = cy - h + 4;

  ctx.fillStyle = "#6e3d1e";
  ctx.strokeStyle = "#16111f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y + 6, w, h - 6, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#8c5129";
  ctx.beginPath();
  ctx.roundRect(x - 1, y, w + 2, 9, [5, 5, 1, 1]);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e6b347";
  ctx.fillRect(x + 4, y + 1, 3.5, h - 2);
  ctx.fillRect(x + w - 7.5, y + 1, 3.5, h - 2);
  ctx.fillRect(cx - 3.5, y + 6, 7, 6);

  if (vis && Math.sin(t * 3.2) > 0.65) {
    ctx.fillStyle = "#fff9db";
    ctx.beginPath();
    ctx.arc(cx + 5, y + 3, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMerchantProp(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, cx: number, cy: number, t: number, vis: boolean,
): void {
  ctx.save();
  if (!vis) ctx.filter = "brightness(0.45)";
  ctx.fillStyle = "rgba(126, 29, 38, 0.85)";
  ctx.beginPath();
  ctx.roundRect(sx + 5, sy + 9, TW - 10, TH - 14, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(229, 179, 75, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx + 8, sy + 12, TW - 16, TH - 20);

  drawShadow(ctx, cx, cy, 34);
  const bob = Math.sin(t * 2.5) * 1.2;
  ctx.fillStyle = "#2d2246";
  ctx.strokeStyle = "#120d1d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy);
  ctx.quadraticCurveTo(cx - 10, cy - 28 + bob, cx, cy - 34 + bob);
  ctx.quadraticCurveTo(cx + 10, cy - 28 + bob, cx + 12, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#d4a44c";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy - 24 + bob, 6, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.fillStyle = "#7dd3fc";
  ctx.fillRect(cx - 3, cy - 24 + bob, 2, 2);
  ctx.fillRect(cx + 1.5, cy - 24 + bob, 2, 2);

  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(cx + 13, cy - 13 + bob, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ================================================================
// 2. 横版高清插画战斗剧场 (含骨骼切片木偶变形 + 冲刺残影 + 飞行弹道 + 镜头推拉)
// ================================================================
let combatT = 0;
const combatAlive = new Set<number>();

/** 计算战斗中第 idx 只怪物的站位脚底坐标 */
export function combatMonsterSlot(W: number, H: number, idx: number, total: number): [number, number] {
  const baseFootY = H * 0.81;
  if (total <= 1) return [W * 0.71, baseFootY];
  if (total === 2) {
    return idx === 0 ? [W * 0.64, baseFootY + 8] : [W * 0.81, baseFootY - 12];
  }
  const minX = W * 0.56;
  const maxX = W * 0.88;
  const t = idx / Math.max(1, total - 1);
  const x = minX + (maxX - minX) * t;
  const y = idx % 2 === 0 ? baseFootY + 12 : baseFootY - 14;
  return [x, y];
}

/** 战斗演出锚点 */
export function combatAnchor(
  canvas: { width: number; height: number },
  targetIdx: number,
  totalMonsters = 1,
): { px: number; py: number; tx: number; ty: number } {
  const W = canvas.width;
  const H = canvas.height;
  const [mx, my] = combatMonsterSlot(W, H, targetIdx, totalMonsters);
  return {
    px: W * 0.22 + 28,
    py: H * 0.83 - H * 0.2,
    tx: mx,
    ty: my - H * 0.16,
  };
}

function drawCoverBg(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, ox = 0, oy = 0): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * 1.06;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) * 0.5 + ox;
  const dy = (h - dh) * 0.5 + oy;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export function renderCombat(
  ctx: CanvasRenderingContext2D,
  state: CombatState,
  player: PlayerState,
  playerSprite: string,
  hp: number,
  mp: number,
  maxHpV: number,
  maxMpV: number,
  dt: number,
): void {
  const cv = ctx.canvas as LogicalCanvas;
  mainCanvas = cv;
  const { w: W, h: H } = canvasLogicalSize(cv);

  // 编排时间轴使用真实帧时间推进, 确保顿帧期间动作衔接不卡死
  updateCombatAnim(dt);

  let fxDt = dt;
  if (hitStop > 0) {
    hitStop -= dt;
    fxDt *= 0.14;
  }
  combatT += fxDt;
  cam.shake = Math.max(0, cam.shake - dt * 22);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const shakeX = cam.shake > 0 ? Math.sin(combatT * 70) * cam.shake : 0;
  const shakeY = cam.shake > 0 ? Math.cos(combatT * 63) * cam.shake * 0.7 : 0;
  const { zoom, fx: zfx, fy: zfy, blood } = getCombatCamera();

  // 开启镜头推拉特写与震动矩阵
  ctx.save();
  ctx.translate(zfx, zfy);
  ctx.scale(zoom, zoom);
  ctx.translate(-zfx + shakeX, -zfy + shakeY);

  // 1) 高清手绘主题战斗背景 (带微呼吸平移)
  const bgImg = hdImg(dungeonCombatBgKey());
  const idleDriftX = Math.sin(combatT * 0.45) * 4;
  if (bgImg) {
    drawCoverBg(ctx, bgImg, W, H, idleDriftX - shakeX * 0.4, -shakeY * 0.4);
    const stageOverlay = ctx.createLinearGradient(0, 0, 0, H);
    stageOverlay.addColorStop(0, "rgba(6, 5, 14, 0.34)");
    stageOverlay.addColorStop(0.65, "rgba(8, 6, 16, 0.16)");
    stageOverlay.addColorStop(1, "rgba(5, 4, 12, 0.48)");
    ctx.fillStyle = stageOverlay;
    ctx.fillRect(-30, -30, W + 60, H + 60);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#151126");
    bg.addColorStop(1, "#090712");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // 2) 脚下吟唱法阵与高速冲刺残影
  drawUnderActorsFx(ctx, combatT);

  const totalM = state.monsters.length;
  const primaryTarget = state.monsters.find((m) => m.hp > 0);
  const heroBaseX = W * 0.22;
  const heroFootY = H * 0.83;
  const heroH = H * 0.42;
  const heroPose = getHeroPose();

  // 3) 收集全体参战实体(怪物 + 主角), 按实时 Y 站位排序(冲刺到近景的单位自然覆盖后排!)
  interface ActorRenderItem {
    sortY: number;
    draw: () => void;
  }
  const actorDraws: ActorRenderItem[] = [];
  const lightAnchors: Light[] = [
    { x: heroBaseX + heroPose.ox, y: heroFootY - heroH * 0.5, radius: 260, intensity: 0.95, warm: "255,205,155" },
  ];

  state.monsters.forEach((m, i) => {
    const [mx, my] = combatMonsterSlot(W, H, i, totalM);
    if (m.hp <= 0) {
      if (combatAlive.has(m.id)) {
        combatAlive.delete(m.id);
        fx.crit(mx, my - H * 0.16);
        fx.hit(mx, my - H * 0.16);
      }
      return;
    }
    combatAlive.add(m.id);

    const prevTrail = combatTrailHp.get(m.id) ?? m.hp;
    const nextTrail = prevTrail > m.hp ? Math.max(m.hp, prevTrail - m.maxHp * dt * 1.6) : m.hp;
    combatTrailHp.set(m.id, nextTrail);

    const monPose = getMonPose(m.id);
    const targetH = H * (m.boss ? 0.48 : m.elite ? 0.39 : 0.33);
    const curX = mx + monPose.ox;
    const curFootY = my + monPose.oy;

    lightAnchors.push({
      x: curX,
      y: curFootY - targetH * 0.5,
      radius: m.boss ? 220 : 165,
      intensity: 0.92,
      flicker: m.boss,
      warm: m.boss ? "255,96,64" : "255,195,155",
    });

    actorDraws.push({
      sortY: my + (Math.abs(monPose.ox) > 30 ? 25 : 0),
      draw: () => {
        if (primaryTarget && primaryTarget.id === m.id && Math.abs(monPose.ox) < 25) {
          drawTargetReticle(ctx, curX, my - 2, m.boss ? 48 : 36, combatT);
        } else if ((m.boss || m.elite) && Math.abs(monPose.ox) < 25) {
          drawAuraCircle(ctx, curX, my - 2, m.boss ? 46 : 34, m.boss ? "#ff5238" : "#b36bff", combatT);
        }

        drawShadow(ctx, curX, my, targetH * 0.66 * Math.max(0.65, 1 + monPose.oy / 140));
        drawPuppetSprite(ctx, monsterHdKey(m.body), mx, my, targetH, monsterCombatFlip(m.body), combatT, i * 1.7 + 0.8, monPose);

        const barW = m.boss ? 92 : 68;
        const barY = curFootY - targetH - 14;
        drawCombatHpBar(
          ctx,
          curX - barW * 0.5,
          barY,
          barW,
          6,
          m.hp / m.maxHp,
          nextTrail / m.maxHp,
          m.boss ? "#ff4b3e" : m.elite ? "#c084fc" : "#ef4444",
        );
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = '600 12px "Noto Serif SC", "PingFang SC", sans-serif';
        ctx.strokeStyle = "rgba(6, 5, 14, 0.92)";
        ctx.lineWidth = 3.5;
        const title = m.name.length > 10 ? m.name.slice(0, 10) : m.name;
        ctx.strokeText(title, curX, barY - 5);
        ctx.fillStyle = m.boss ? "#ffb4a2" : m.elite ? "#e9d5ff" : "#e2e0f0";
        ctx.fillText(title, curX, barY - 5);
        ctx.restore();

        m.hurtFlash = Math.max(0, m.hurtFlash - dt);
      },
    });
  });

  // 主角进同一深度列表(冲刺斩击时位于前排!)
  actorDraws.push({
    sortY: heroFootY + (heroPose.ox > 40 ? 28 : 0),
    draw: () => {
      const curHeroX = heroBaseX + heroPose.ox;
      const curHeroFootY = heroFootY + heroPose.oy;
      if (Math.abs(heroPose.ox) < 35) {
        drawAuraCircle(ctx, heroBaseX, heroFootY - 2, 38, "rgba(244, 203, 105, 0.65)", -combatT * 0.6);
      }
      drawShadow(ctx, curHeroX, heroFootY, heroH * 0.64 * Math.max(0.6, 1 + heroPose.oy / 140));
      drawPuppetSprite(ctx, playerSprite, heroBaseX, heroFootY, heroH, 1, combatT, 0, heroPose);
      drawHeroCompanionProps(ctx, player.cls, heroBaseX, heroFootY, heroH, combatT);

      const hBarW = 86;
      const hBarY = curHeroFootY - heroH - 16;
      drawCombatHpBar(ctx, curHeroX - hBarW * 0.5, hBarY, hBarW, 6, hp / maxHpV, hp / maxHpV, "#22c55e");
      drawMiniBar(ctx, curHeroX - hBarW * 0.5, hBarY + 8, hBarW, 4, mp / maxMpV, "#3b82f6");
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = '700 12px "Noto Serif SC", "PingFang SC", sans-serif';
      ctx.strokeStyle = "rgba(6, 5, 14, 0.92)";
      ctx.lineWidth = 3.5;
      ctx.strokeText(`Lv.${player.level} ${player.cls}`, curHeroX, hBarY - 5);
      ctx.fillStyle = "#f6d88c";
      ctx.fillText(`Lv.${player.level} ${player.cls}`, curHeroX, hBarY - 5);
      ctx.restore();
    },
  });

  actorDraws.sort((a, b) => a.sortY - b.sortY);
  for (const item of actorDraws) item.draw();

  // 4) 飞行弹道实体 + 刀光与爆裂粒子
  drawProjectilesFx(ctx, combatT);
  if (Math.random() < fxDt * 6) {
    fx.dust(Math.random() * W, H * (0.3 + Math.random() * 0.55), currentTheme().accentGlow);
  }
  fx.updateFx(fxDt);
  fx.drawFx(ctx);

  // 结束镜头缩放矩阵
  ctx.restore();

  // 5) 屏幕级光照、电影暗角与受击血色脉冲边缘
  drawLighting(ctx, W, H, lightAnchors, combatT, "rgba(5, 5, 14, 0.26)");
  drawVignette(ctx, W, H);
  drawBloodVignette(ctx, W, H, blood);

  // 6) 伤害/治疗飘字
  for (let i = state.floats.length - 1; i >= 0; i--) {
    const f = state.floats[i];
    f.t -= dt;
    if (f.t <= 0) { state.floats.splice(i, 1); continue; }
    const isCrit = f.color === "#ffd23e";
    const progress = 1 - f.t;
    const pop = progress < 0.16 ? 0.7 + (progress / 0.16) * 0.55 : Math.max(1, 1.25 - (progress - 0.16) * 0.35);
    const fx2 = f.x * W;
    const fy = f.y * H - progress * 46;

    ctx.save();
    ctx.translate(fx2, fy);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, f.t * 1.7);
    ctx.textAlign = "center";
    ctx.font = isCrit
      ? '800 28px "Cinzel", "Noto Serif SC", serif'
      : '700 18px "Cinzel", "Noto Serif SC", sans-serif';
    ctx.strokeStyle = "#080610";
    ctx.lineWidth = isCrit ? 5.5 : 3.8;
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}

function drawTargetReticle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.44);
  ctx.rotate(-t * 1.4);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 4; i++) {
    const a0 = (i * Math.PI) / 2 + 0.22;
    const a1 = ((i + 1) * Math.PI) / 2 - 0.22;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMiniBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, ratio: number, color: string,
): void {
  const r = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = "rgba(10, 8, 18, 0.88)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * r), h);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawCombatHpBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  ratio: number, trailRatio: number, color: string,
): void {
  const r = Math.max(0, Math.min(1, ratio));
  const tr = Math.max(r, Math.min(1, trailRatio));
  ctx.fillStyle = "rgba(9, 7, 16, 0.9)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();

  if (tr > r) {
    ctx.fillStyle = "rgba(255, 240, 200, 0.85)";
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(2, w * tr), h, 3);
    ctx.fill();
  }

  if (r > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(2, w * r), h, 3);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(212, 164, 76, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 3);
  ctx.stroke();
}
