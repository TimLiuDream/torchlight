import type { FloorMap, PlayerState, StatKey } from "./types";

const SAVE_KEY = "torchlight_web_save";

export interface SaveData {
  player: PlayerState;
  floor: number;
  map: FloorMap;
}

export function saveGame(player: PlayerState, floor: number, map: FloorMap): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ player, floor, map }));
  } catch {
    // 隐身模式/容量不足等场景: 存档失败静默继续, 游戏仍可玩
  }
}

/** 旧档补默认字段(成长系统上线前的存档) */
function migratePlayer(p: PlayerState): void {
  if (typeof p.statPoints !== "number") p.statPoints = 0;
  if (!p.stats) p.stats = { str: 0, vit: 0, mag: 0, agi: 0 } as Record<StatKey, number>;
  if (typeof p.skillPoints !== "number") p.skillPoints = 0;
  if (!Array.isArray(p.learned)) p.learned = [];
  // 旧档装备缺 kind: 从名字兜底(取 · 前后段或原名)
  for (const e of [...Object.values(p.equip), ...p.bag]) {
    if (e && !e.kind) e.kind = e.name.includes("·") ? e.name.split("·").pop()! : e.name;
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (!d.player || !d.map || typeof d.floor !== "number") return null;
    migratePlayer(d.player);
    // 读档收拢: 旧档在属性定义变化后可能高于重算上限
    d.player.hp = Math.min(d.player.hp, playerMaxHp(d.player));
    d.player.mp = Math.min(d.player.mp, d.player.maxMp);
    return d;
  } catch {
    return null;
  }
}

// 避免与 player.ts 循环依赖, 这里内联 maxHp 计算(公式与 player.ts 对齐, 不含套装/被动)
function playerMaxHp(p: PlayerState): number {
  let equipHp = 0;
  for (const e of Object.values(p.equip)) if (e) equipHp += e.hp;
  return Math.floor(p.baseHp * (1 + (p.level - 1) * 0.15)) + equipHp + (p.stats?.vit ?? 0) * 8;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 同上 */
  }
}
