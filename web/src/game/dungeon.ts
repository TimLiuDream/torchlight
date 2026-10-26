import { makeBoss, makeElite, makeMonster } from "./player";
import type { Rng } from "./rng";
import type { FloorMap, Monster, TileKind } from "./types";

export const FOV_RADIUS = 8;
export const CAMP_INTERVAL = 3; // 每 3 层一个营地
export const BOSS_INTERVAL = 5; // 每 5 层一个首领(与营地错开时)

export const isCampFloor = (floor: number) => floor % CAMP_INTERVAL === 0;
export const isBossFloor = (floor: number) => floor % BOSS_INTERVAL === 0 && !isCampFloor(floor);

// ---------------- 生成 ----------------
interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

function carveRoom(tiles: TileKind[], cols: number, r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) tiles[y * cols + x] = "floor";
}

function carveCorridor(tiles: TileKind[], cols: number, ax: number, ay: number, bx: number, by: number): void {
  // L 形走廊: 先横后纵
  for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) tiles[ay * cols + x] = "floor";
  for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) tiles[y * cols + bx] = "floor";
}

function roomCenter(r: Room): [number, number] {
  return [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
}

/** 生成一层地牢(非营地为随机迷宫, 营地为固定篝火房)。 */
export function generateFloor(rng: Rng, floor: number): FloorMap {
  if (isCampFloor(floor)) return generateCamp(floor);
  const cols = 40;
  const rows = 26;
  const tiles: TileKind[] = new Array(cols * rows).fill("wall");

  // 放置不重叠的房间
  const rooms: Room[] = [];
  for (let tries = 0; tries < 60 && rooms.length < 7 + Math.min(3, Math.floor(floor / 4)); tries++) {
    const w = rng.int(4, 9);
    const h = rng.int(3, 6);
    const x = rng.int(1, cols - w - 2);
    const y = rng.int(1, rows - h - 2);
    const r: Room = { x, y, w, h };
    if (rooms.some((o) => x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y)) continue;
    rooms.push(r);
    carveRoom(tiles, cols, r);
  }
  // 走廊按房间顺序串联
  for (let i = 1; i < rooms.length; i++) {
    const [ax, ay] = roomCenter(rooms[i - 1]);
    const [bx, by] = roomCenter(rooms[i]);
    carveCorridor(tiles, cols, ax, ay, bx, by);
  }

  const map: FloorMap = {
    cols, rows, tiles,
    seen: new Array(cols * rows).fill(false),
    visible: new Array(cols * rows).fill(false),
    playerX: 0, playerY: 0,
    monsters: [],
    isCamp: false,
    floor,
  };

  const first = rooms[0];
  map.playerX = first.x + 1;
  map.playerY = first.y + 1;

  // 出生房不放实体, 其余房间放楼梯/怪物/事件点
  const spawnRooms = rooms.slice(1);
  const last = spawnRooms.length ? spawnRooms[spawnRooms.length - 1] : first;
  {
    const [sx, sy] = [last.x + last.w - 2, last.y + Math.floor(last.h / 2)];
    tiles[sy * cols + sx] = "stairs";
    if (isBossFloor(floor)) {
      const boss = makeBoss(rng, floor, sx - 1, sy);
      map.monsters.push(boss);
    }
  }

  const freeSpot = (): [number, number] | null => {
    for (let tries = 0; tries < 80; tries++) {
      const r = rooms[1 + Math.floor(rng.next() * Math.max(1, rooms.length - 1))] ?? first;
      const [x, y] = [r.x + rng.int(0, r.w - 1), r.y + rng.int(0, r.h - 1)];
      const t = tiles[y * cols + x];
      const occupied =
        map.monsters.some((m) => m.x === x && m.y === y) ||
        (x === map.playerX && y === map.playerY);
      if (t === "floor" && !occupied) return [x, y];
    }
    return null;
  };

  // 怪物: 数量随层数上涨(对应文字版每层 1~5 只, 地牢化后多散布几只)
  const monsterCount = Math.min(9, rng.int(2, 4) + Math.floor(floor / 3));
  for (let i = 0; i < monsterCount; i++) {
    const spot = freeSpot();
    if (!spot) break;
    map.monsters.push(makeMonster(rng, floor, spot[0], spot[1]));
  }
  // 精英: 概率随层数
  if (rng.chance(Math.min(0.5, 0.15 + floor * 0.02))) {
    const spot = freeSpot();
    if (spot) map.monsters.push(makeElite(rng, floor, spot[0], spot[1]));
  }

  // 宝箱 0~2
  for (let i = 0; i < rng.int(0, 2); i++) {
    const spot = freeSpot();
    if (spot) tiles[spot[1] * cols + spot[0]] = "chest";
  }
  // 泉水 35%
  if (rng.chance(0.35)) {
    const spot = freeSpot();
    if (spot) tiles[spot[1] * cols + spot[0]] = "spring";
  }
  // 流浪商人 20%
  if (rng.chance(0.2)) {
    const spot = freeSpot();
    if (spot) tiles[spot[1] * cols + spot[0]] = "merchant";
  }

  computeFov(map);
  return map;
}

/** 营地: 固定小地图, 篝火/商人/传送门/楼梯。 */
function generateCamp(floor: number): FloorMap {
  const cols = 26;
  const rows = 16;
  const tiles: TileKind[] = new Array(cols * rows).fill("wall");
  const rx = 4, ry = 3, rw = 18, rh = 10;
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++) tiles[y * cols + x] = "floor";

  const map: FloorMap = {
    cols, rows, tiles,
    seen: new Array(cols * rows).fill(false),
    visible: new Array(cols * rows).fill(false),
    playerX: rx + 1,
    playerY: ry + Math.floor(rh / 2),
    monsters: [],
    isCamp: true,
    floor,
  };
  const cy = ry + Math.floor(rh / 2);
  tiles[cy * cols + rx + 8] = "campfire"; // 中央篝火
  tiles[(cy - 2) * cols + rx + 14] = "merchant"; // 商人
  tiles[(cy + 2) * cols + rx + 14] = "portal"; // 传送门
  tiles[cy * cols + rx + rw - 1] = "stairs"; // 右墙内侧楼梯
  computeFov(map);
  return map;
}

// ---------------- 视野 ----------------
export function isWall(map: FloorMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return true;
  return map.tiles[y * map.cols + x] === "wall";
}

export function walkable(map: FloorMap, x: number, y: number): boolean {
  return !isWall(map, x, y);
}

function hasLos(map: FloorMap, x0: number, y0: number, x1: number, y1: number): boolean {
  // Bresenham 视线
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (isWall(map, x, y)) return false;
  }
  return true;
}

export function computeFov(map: FloorMap): void {
  map.visible.fill(false);
  const { playerX: px, playerY: py } = map;
  for (let y = Math.max(0, py - FOV_RADIUS); y <= Math.min(map.rows - 1, py + FOV_RADIUS); y++) {
    for (let x = Math.max(0, px - FOV_RADIUS); x <= Math.min(map.cols - 1, px + FOV_RADIUS); x++) {
      const dist = Math.hypot(x - px, y - py);
      if (dist > FOV_RADIUS + 0.5) continue;
      if (hasLos(map, px, py, x, y)) {
        map.visible[y * map.cols + x] = true;
        map.seen[y * map.cols + x] = true;
      }
    }
  }
}

// ---------------- 移动与交互 ----------------
export function monsterAt(map: FloorMap, x: number, y: number): Monster | undefined {
  return map.monsters.find((m) => m.x === x && m.y === y && m.hp > 0);
}

/**
 * 玩家尝试移动。返回:
 *  - "moved" 已移动(内部刷新 FOV)
 *  - "blocked" 撞墙
 *  - { combat: Monster[] } 目标格有怪物(或移动后怪物已贴脸), 返回参战怪物
 */
export function tryMovePlayer(map: FloorMap, dx: number, dy: number): "moved" | "blocked" | { combat: Monster[] } {
  const nx = map.playerX + dx;
  const ny = map.playerY + dy;
  if (isWall(map, nx, ny)) return "blocked";
  const m = monsterAt(map, nx, ny);
  if (m) return { combat: gatherCombatants(map, m) };
  map.playerX = nx;
  map.playerY = ny;
  computeFov(map);
  const adj = adjacentMonsters(map);
  if (adj.length) return { combat: adj };
  return "moved";
}

/** 收集一场战斗的参战怪: 触发者 + 与玩家相邻的其他怪。 */
export function gatherCombatants(map: FloorMap, trigger: Monster): Monster[] {
  const set = new Map<number, Monster>();
  set.set(trigger.id, trigger);
  for (const m of adjacentMonsters(map)) set.set(m.id, m);
  return [...set.values()];
}

export function adjacentMonsters(map: FloorMap): Monster[] {
  const { playerX: px, playerY: py } = map;
  return map.monsters.filter(
    (m) => m.hp > 0 && Math.abs(m.x - px) + Math.abs(m.y - py) === 1,
  );
}

export function removeMonsters(map: FloorMap, ids: Set<number>): void {
  map.monsters = map.monsters.filter((m) => !ids.has(m.id));
}

/**
 * 怪物回合: 可见则追击, 否则低概率游荡。
 * 返回 { combat } 表示有怪物贴脸触发战斗; "idle" 表示无事发生。
 */
export function monsterTurn(map: FloorMap, rng: Rng): "idle" | { combat: Monster[] } {
  const px = map.playerX, py = map.playerY;
  for (const m of map.monsters) {
    if (m.hp <= 0) continue;
    const dist = Math.hypot(m.x - px, m.y - py);
    const canSee = dist <= FOV_RADIUS && hasLos(map, m.x, m.y, px, py);
    let dx = 0, dy = 0;
    if (canSee) {
      const sx = Math.sign(px - m.x), sy = Math.sign(py - m.y);
      const preferX = Math.abs(px - m.x) >= Math.abs(py - m.y);
      // 主轴被挡时退到副轴, 避免被墙体凸起卡死
      const candidates: Array<[number, number]> = preferX ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
      for (const [ddx, ddy] of candidates) {
        if (!ddx && !ddy) continue;
        const nx = m.x + ddx, ny = m.y + ddy;
        if (nx === px && ny === py) continue; // 不走玩家格(贴脸即战斗)
        if (isWall(map, nx, ny) || monsterAt(map, nx, ny)) continue;
        dx = ddx;
        dy = ddy;
        break;
      }
    } else if (rng.chance(0.25)) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
      [dx, dy] = rng.pick(dirs);
    }
    if (!dx && !dy) continue;
    const nx = m.x + dx, ny = m.y + dy;
    if (nx === px && ny === py) continue; // 不走玩家格(贴脸即战斗)
    if (isWall(map, nx, ny) || monsterAt(map, nx, ny)) continue;
    m.x = nx;
    m.y = ny;
  }
  const adj = adjacentMonsters(map);
  if (adj.length) return { combat: gatherCombatants(map, adj[0]) };
  return "idle";
}

export function tileAt(map: FloorMap, x: number, y: number): TileKind {
  return map.tiles[y * map.cols + x];
}

export function setTile(map: FloorMap, x: number, y: number, t: TileKind): void {
  map.tiles[y * map.cols + x] = t;
}
