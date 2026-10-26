import { AFFIX_N, LEGEND_NAMES, M_BODY, M_PREFIX, PREFIXES, RARITY_MULT } from "./data";
import type { Rng } from "./rng";
import type { AffixKey, ClassDef, Equipment, Monster, PlayerState, Rarity, Slot } from "./types";

// ---------------- 装备 ----------------
const AFFIX_KEYS: AffixKey[] = ["atk", "hp", "crit", "leech", "regen"];

export function rollEquipment(rng: Rng, floor: number, forceRarity?: Rarity): Equipment {
  const slot: Slot = rng.pick(["武器", "护甲", "饰品"] as const);
  let rarity: Rarity;
  if (forceRarity) {
    rarity = forceRarity;
  } else {
    // 层数越深, 高稀有概率越高
    const bonus = Math.min(floor * 0.015, 0.18);
    const r = rng.next();
    if (r < 0.03 + bonus * 0.3) rarity = "传说";
    else if (r < 0.15 + bonus) rarity = "稀有";
    else if (r < 0.5 + bonus) rarity = "魔法";
    else rarity = "普通";
  }

  const scale = RARITY_MULT[rarity] * (1 + floor * 0.12);
  const eq: Equipment = { slot, rarity, atk: 0, hp: 0, crit: 0, leech: 0, regen: 0, name: "", value: 0 };

  let base: string;
  if (slot === "武器") {
    base = rng.pick(["短剑", "战斧", "法杖", "火枪", "铁拳套"] as const);
    eq.atk = Math.max(1, Math.floor(rng.int(4, 8) * scale));
  } else if (slot === "护甲") {
    base = rng.pick(["皮甲", "锁子甲", "法师袍", "板甲"] as const);
    eq.hp = Math.max(1, Math.floor(rng.int(12, 22) * scale));
  } else {
    base = rng.pick(["戒指", "护符", "怀表", "魔晶"] as const);
    const main = rng.pick(["crit", "leech", "regen", "atk"] as const);
    if (main === "crit") eq.crit = rng.int(2, 5);
    else if (main === "leech") eq.leech = rng.int(1, 3);
    else if (main === "regen") eq.regen = rng.int(1, 3);
    else eq.atk = Math.max(1, Math.floor(rng.int(2, 5) * scale));
  }

  // 词缀: 从主属性之外的池子里抽
  const pool = AFFIX_KEYS.filter((k) => eq[k] === 0);
  rng.shuffle(pool);
  for (const key of pool.slice(0, AFFIX_N[rarity])) {
    if (key === "atk") eq.atk += Math.max(1, Math.floor(rng.int(2, 5) * scale * 0.6));
    else if (key === "hp") eq.hp += Math.max(1, Math.floor(rng.int(8, 16) * scale * 0.6));
    else if (key === "crit") eq.crit += rng.int(1, 4);
    else if (key === "leech") eq.leech += rng.int(1, 2);
    else eq.regen += rng.int(1, 2);
  }

  if (rarity === "传说") eq.name = `${LEGEND_NAMES[slot]}·${base}`;
  else if (rarity === "普通") eq.name = base;
  else eq.name = rng.pick(PREFIXES) + base;
  eq.value = Math.floor((10 + floor * 6) * RARITY_MULT[rarity]);
  return eq;
}

export function affixText(eq: Equipment): string {
  const parts: string[] = [];
  if (eq.atk) parts.push(`攻击+${eq.atk}`);
  if (eq.hp) parts.push(`生命+${eq.hp}`);
  if (eq.crit) parts.push(`暴击+${eq.crit}%`);
  if (eq.leech) parts.push(`吸血${eq.leech}%`);
  if (eq.regen) parts.push(`回蓝+${eq.regen}/回合`);
  return parts.join(", ");
}

// ---------------- 怪物 ----------------
let nextMonsterId = 1;
export function resetMonsterIds(): void {
  nextMonsterId = 1;
}

function rollBody(rng: Rng): { name: string; body: string } {
  const [bodyName, bodyKey] = rng.pick(M_BODY);
  return { name: rng.pick(M_PREFIX) + bodyName, body: bodyKey };
}

export function makeMonster(rng: Rng, floor: number, x: number, y: number): Monster {
  const { name, body } = rollBody(rng);
  const hp = Math.floor((28 + floor * 12) * rng.uniform(0.85, 1.15));
  const atk = Math.max(2, Math.floor((5 + floor * 3) * rng.uniform(0.85, 1.15)));
  return { id: nextMonsterId++, name, hp, maxHp: hp, atk, boss: false, elite: false, x, y, body };
}

export function makeElite(rng: Rng, floor: number, x: number, y: number, mimic = false): Monster {
  const { name, body } = rollBody(rng);
  const hp = Math.floor((28 + floor * 12) * (mimic ? 1.6 : 2.2));
  const atk = Math.floor((5 + floor * 3) * (mimic ? 1.2 : 1.5));
  return {
    id: nextMonsterId++,
    name: mimic ? "拟态怪" : "精英·" + name,
    hp, maxHp: hp, atk,
    boss: false, elite: true, x, y,
    body: mimic ? "mimic" : body,
  };
}

export function makeBoss(rng: Rng, floor: number, x: number, y: number): Monster {
  const name = "首领·" + rng.pick(["深渊领主", "熔岩魔王", "骸骨君王", "机械暴君"] as const);
  const hp = Math.floor((28 + floor * 12) * 3);
  const atk = Math.floor((5 + floor * 3) * 2);
  return { id: nextMonsterId++, name, hp, maxHp: hp, atk, boss: true, elite: false, x, y, body: "boss" };
}

// ---------------- 玩家 ----------------
export function createPlayer(cls: ClassDef): PlayerState {
  return {
    cls: cls.name,
    baseHp: cls.hp,
    baseAtk: cls.atk,
    maxMp: cls.mp,
    skill: { ...cls.skill },
    level: 1,
    exp: 0,
    hp: cls.hp,
    mp: cls.mp,
    equip: { 武器: null, 护甲: null, 饰品: null },
    bag: [],
    gold: 30,
    potions: { 血瓶: 2, 蓝瓶: 1 },
    kills: 0,
    restUsed: false,
  };
}

export function equipSum(p: PlayerState, key: AffixKey): number {
  let s = 0;
  for (const e of Object.values(p.equip)) if (e) s += e[key];
  return s;
}

export const maxHp = (p: PlayerState) => Math.floor(p.baseHp * (1 + (p.level - 1) * 0.15)) + equipSum(p, "hp");
export const playerAtk = (p: PlayerState) => Math.floor(p.baseAtk * (1 + (p.level - 1) * 0.12)) + equipSum(p, "atk");
export const playerCrit = (p: PlayerState) => 5 + equipSum(p, "crit");
export const playerLeech = (p: PlayerState) => equipSum(p, "leech");
export const playerRegen = (p: PlayerState) => equipSum(p, "regen");
export const expNeed = (p: PlayerState) => p.level * 30;
export const recLevel = (floor: number) => Math.max(1, Math.floor(floor / 2));

/** 升级检查, 返回升了几级(供 UI 提示)。升级回满血蓝。 */
export function gainExp(p: PlayerState, exp: number): number {
  p.exp += exp;
  let leveled = 0;
  while (p.exp >= expNeed(p)) {
    p.exp -= expNeed(p);
    p.level += 1;
    leveled += 1;
  }
  if (leveled) {
    p.hp = maxHp(p);
    p.mp = p.maxMp;
  }
  return leveled;
}

/** 穿装备, 返回换下的旧装备。hp 超上限收拢。 */
export function wear(p: PlayerState, eq: Equipment): Equipment | null {
  const old = p.equip[eq.slot];
  p.equip[eq.slot] = eq;
  p.hp = Math.min(p.hp, maxHp(p));
  return old;
}
