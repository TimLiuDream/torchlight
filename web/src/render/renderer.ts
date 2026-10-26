import type { CombatState, FloorMap, PlayerState } from "../game/types";
import {
  campfireTile, chestTile, drawSprite, floorTile, merchantTile, portalTile,
  springTile, sprite, stairsTile, wallTile,
} from "./sprites";

const TILE = 16;

function tileCanvas(kind: string): HTMLCanvasElement {
  switch (kind) {
    case "wall": return wallTile();
    case "floor": return floorTile();
    case "stairs": return stairsTile();
    case "campfire": return campfireTile();
    case "spring": return springTile();
    case "chest": return chestTile();
    case "portal": return portalTile();
    case "merchant": return merchantTile();
    default: return floorTile();
  }
}

/** 地牢场景。 */
export function renderDungeon(ctx: CanvasRenderingContext2D, map: FloorMap, _player: PlayerState, playerSprite: string): void {
  const { cols, rows } = map;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#08060e";
  ctx.fillRect(0, 0, cols * TILE, rows * TILE);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!map.seen[i]) continue;
      const kind = map.tiles[i];
      ctx.drawImage(tileCanvas(kind), x * TILE, y * TILE);
      if (map.visible[i] && kind === "chest") {
        // 宝箱在视野内微光提示
        ctx.fillStyle = "rgba(255,210,62,0.06)";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      if (!map.visible[i]) {
        ctx.fillStyle = "rgba(5,4,10,0.62)";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  // 怪物(仅视野内)
  for (const m of map.monsters) {
    const i = m.y * cols + m.x;
    if (!map.visible[i]) continue;
    if (m.elite || m.boss) {
      ctx.fillStyle = m.boss ? "rgba(255,75,75,0.28)" : "rgba(180,100,255,0.26)";
      ctx.fillRect(m.x * TILE - 1, m.y * TILE - 1, TILE + 2, TILE + 2);
    }
    drawSprite(ctx, m.body, m.x, m.y, TILE, m.boss ? 1.3 : 1);
    if (m.hp < m.maxHp) {
      const w = TILE - 4;
      ctx.fillStyle = "#14101e";
      ctx.fillRect(m.x * TILE + 2, m.y * TILE - 3, w, 2);
      ctx.fillStyle = m.boss ? "#ff4b4b" : "#4ade80";
      ctx.fillRect(m.x * TILE + 2, m.y * TILE - 3, Math.max(1, Math.round((w * m.hp) / m.maxHp)), 2);
    }
  }

  // 玩家
  drawSprite(ctx, playerSprite, map.playerX, map.playerY, TILE);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(map.playerX * TILE, map.playerY * TILE, TILE, TILE);
}

/** 战斗场景: 左玩家右怪群, 血条与飘字。 */
export function renderCombat(
  ctx: CanvasRenderingContext2D, state: CombatState, player: PlayerState, playerSprite: string,
  hp: number, mp: number, maxHpV: number, maxMpV: number, dt: number,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.imageSmoothingEnabled = false;
  // 背景: 洞窟渐层 + 地面
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#141024");
  bg.addColorStop(1, "#0b0916");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a1626";
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.fillStyle = "#221c36";
  for (let x = 0; x < W; x += 24) ctx.fillRect(x, H * 0.72, 22, 2);

  const S = 6; // 角色精灵放大倍数 (12px -> 72px)

  // 玩家(左)
  const px = Math.round(W * 0.22 - 36);
  const py = Math.round(H * 0.72 - 72);
  ctx.drawImage(scaled(playerSprite, S), px, py);

  // 怪物(右, 最多 5 只纵向排开)
  const alive = state.monsters;
  for (let i = 0; i < alive.length; i++) {
    const m = alive[i];
    if (m.hp <= 0) {
      ctx.globalAlpha = 0.18;
      ctx.drawImage(scaled(m.body, S * 0.8), Math.round(W * (0.58 + i * 0.08)), Math.round(H * 0.72 - 58));
      ctx.globalAlpha = 1;
      continue;
    }
    const mx = Math.round(W * (0.58 + i * 0.08));
    const my = Math.round(H * 0.72 - (m.boss ? 86 : 58));
    if (m.hurtFlash > 0) {
      ctx.save();
      ctx.filter = "brightness(2.4)";
      ctx.drawImage(scaled(m.body, S * (m.boss ? 1.2 : 0.8)), mx, my);
      ctx.restore();
      m.hurtFlash -= dt;
    } else {
      ctx.drawImage(scaled(m.body, S * (m.boss ? 1.2 : 0.8)), mx, my);
    }
    // 怪物血条
    const bw = 44;
    ctx.fillStyle = "#14101e";
    ctx.fillRect(mx, my - 7, bw, 4);
    ctx.fillStyle = m.boss ? "#ff4b4b" : "#4ade80";
    ctx.fillRect(mx, my - 7, Math.max(1, Math.round((bw * m.hp) / m.maxHp)), 4);
    ctx.font = "8px monospace";
    ctx.fillStyle = m.boss ? "#ff9b9b" : "#c8c8d8";
    ctx.fillText(m.name.slice(0, 8), mx, my - 9);
  }

  // 玩家血蓝条
  drawBar(ctx, px, py - 16, 72, 5, hp / maxHpV, "#ff4b4b");
  drawBar(ctx, px, py - 9, 72, 4, mp / maxMpV, "#5b9cff");
  ctx.font = "9px monospace";
  ctx.fillStyle = "#c8c8d8";
  ctx.fillText(`Lv${player.level} ${player.cls}`, px, py - 19);

  // 飘字
  for (let i = state.floats.length - 1; i >= 0; i--) {
    const f = state.floats[i];
    f.t -= dt;
    if (f.t <= 0) {
      state.floats.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, f.t);
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = f.color;
    ctx.strokeStyle = "#14101e";
    ctx.lineWidth = 2;
    const fx = f.x * W;
    const fy = f.y * H - (1 - f.t) * 26;
    ctx.strokeText(f.text, fx, fy);
    ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha = 1;
  }
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string): void {
  ctx.fillStyle = "#14101e";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, Math.max(0, ratio)))), h);
}

const scaledCache = new Map<string, HTMLCanvasElement>();
function scaled(key: string, scale: number): HTMLCanvasElement {
  const ck = `${key}@${scale}`;
  let cv = scaledCache.get(ck);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = 12 * scale;
    cv.height = 12 * scale;
    const cctx = cv.getContext("2d")!;
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(sprite(key), 0, 0, cv.width, cv.height);
    scaledCache.set(ck, cv);
  }
  return cv;
}
