import {
  AFFIX_N, LEGEND_NAMES, M_BODY, M_PREFIX, PREFIXES, RARITY_MULT,
  SETS, SET_DROP_CHANCE, SKILL_TREES, STAT_BONUS, STAT_POINTS_PER_LEVEL, SKILL_POINTS_PER_LEVEL,
} from "./data";
import type { Rng } from "./rng";
import type { AffixKey, ClassDef, Equipment, Monster, PlayerState, Rarity, Slot, SkillNode } from "./types";

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
  const eq: Equipment = { slot, kind: "", rarity, atk: 0, hp: 0, crit: 0, leech: 0, regen: 0, name: "", value: 0 };

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
  eq.kind = base;

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

  // 套装件: 稀有/传说有概率成为套装件(名字换为套装名)
  if ((rarity === "稀有" || rarity === "传说") && rng.next() < SET_DROP_CHANCE[rarity]) {
    eq.setId = rng.pick(Object.keys(SETS));
    eq.name = `${SETS[eq.setId].name}·${base}`;
  } else if (rarity === "传说") eq.name = `${LEGEND_NAMES[slot]}·${base}`;
  else if (rarity === "普通") eq.name = base;
  else eq.name = rng.pick(PREFIXES) + base;
  eq.value = Math.floor((10 + floor * 6) * RARITY_MULT[rarity] * (eq.setId ? 1.3 : 1));
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
    statPoints: 0,
    stats: { str: 0, vit: 0, mag: 0, agi: 0 },
    skillPoints: 0,
    learned: [],
  };
}

// ---------------- 套装/技能树被动聚合 ----------------
export function equipSum(p: PlayerState, key: AffixKey): number {
  let s = 0;
  for (const e of Object.values(p.equip)) if (e) s += e[key];
  return s;
}

export interface SetBonusState {
  atkPct: number;
  hpPct: number;
  atkFlat: number;
  hpFlat: number;
  crit: number;
  leech: number;
  regen: number;
  // 已激活套装描述(供 UI)
  lines: Array<{ name: string; text: string; count: number; need: number }>;
}

const emptyBonus = (): SetBonusState => ({ atkPct: 0, hpPct: 0, atkFlat: 0, hpFlat: 0, crit: 0, leech: 0, regen: 0, lines: [] });

export function setBonuses(p: PlayerState): SetBonusState {
  const st = emptyBonus();
  const count: Record<string, number> = {};
  for (const e of Object.values(p.equip)) {
    if (e?.setId) count[e.setId] = (count[e.setId] ?? 0) + 1;
  }
  for (const [id, n] of Object.entries(count)) {
    const set = SETS[id];
    if (!set || n < 2) {
      if (set && n === 1) st.lines.push({ name: set.name, text: "再集 1 件激活套装效果", count: 1, need: 2 });
      continue;
    }
    const b = n >= 3 ? { ...set.bonus2, ...set.bonus3 } : set.bonus2;
    st.atkPct += b.atkPct ?? 0;
    st.hpPct += b.hpPct ?? 0;
    st.crit += b.crit ?? 0;
    st.leech += b.leech ?? 0;
    st.regen += b.regen ?? 0;
    st.lines.push({ name: set.name, text: n >= 3 ? set.desc3 : set.desc2, count: n, need: 3 });
  }
  return st;
}

/** 已学技能树被动聚合 */
export function learnedBonus(p: PlayerState): SetBonusState {
  const st = emptyBonus();
  const all = Object.values(SKILL_TREES).flat();
  for (const id of p.learned) {
    const node = all.find((n) => n.id === id);
    if (!node?.effect) continue;
    st.atkPct += node.effect.atkPct ?? 0;
    st.hpPct += node.effect.hpPct ?? 0;
    st.atkFlat += node.effect.atkFlat ?? 0;
    st.hpFlat += node.effect.hpFlat ?? 0;
    st.crit += node.effect.crit ?? 0;
    st.leech += node.effect.leech ?? 0;
    st.regen += node.effect.regen ?? 0;
  }
  return st;
}

function nodeById(id: string): SkillNode | undefined {
  return Object.values(SKILL_TREES).flat().find((n) => n.id === id);
}

// ---------------- 属性公式(加点 + 装备 + 套装 + 被动) ----------------
export const maxHp = (p: PlayerState) => {
  const set = setBonuses(p), lb = learnedBonus(p);
  const flat = p.baseHp * (1 + (p.level - 1) * 0.15) + equipSum(p, "hp") + p.stats.vit * STAT_BONUS.vit.hp + lb.hpFlat;
  return Math.floor(flat * (1 + set.hpPct + lb.hpPct));
};
export const playerAtk = (p: PlayerState) => {
  const set = setBonuses(p), lb = learnedBonus(p);
  const flat = p.baseAtk * (1 + (p.level - 1) * 0.12) + equipSum(p, "atk") + p.stats.str * STAT_BONUS.str.atk + lb.atkFlat;
  return Math.floor(flat * (1 + set.atkPct + lb.atkPct));
};
export const playerCrit = (p: PlayerState) =>
  Math.floor(5 + equipSum(p, "crit") + p.stats.agi * STAT_BONUS.agi.crit + setBonuses(p).crit + learnedBonus(p).crit);
export const playerLeech = (p: PlayerState) => equipSum(p, "leech") + setBonuses(p).leech + learnedBonus(p).leech;
export const playerRegen = (p: PlayerState) => equipSum(p, "regen") + setBonuses(p).regen + learnedBonus(p).regen;
export const expNeed = (p: PlayerState) => p.level * 30;
export const recLevel = (floor: number) => Math.max(1, Math.floor(floor / 2));

/** 升级检查, 返回升了几级(供 UI 提示)。升级回满血蓝, 并发放成长点。 */
export function gainExp(p: PlayerState, exp: number): number {
  p.exp += exp;
  let leveled = 0;
  while (p.exp >= expNeed(p)) {
    p.exp -= expNeed(p);
    p.level += 1;
    leveled += 1;
  }
  if (leveled) {
    p.statPoints += leveled * STAT_POINTS_PER_LEVEL;
    p.skillPoints += leveled * SKILL_POINTS_PER_LEVEL;
    p.hp = maxHp(p);
    p.mp = p.maxMp;
  }
  return leveled;
}

/** 分配属性点(mag 直接加到 maxMp 上, 其余走公式)。返回 false 表示点数不足。 */
export function spendStat(p: PlayerState, key: "str" | "vit" | "mag" | "agi"): boolean {
  if (p.statPoints <= 0) return false;
  p.statPoints -= 1;
  p.stats[key] += 1;
  if (key === "mag") p.maxMp += STAT_BONUS.mag.mp;
  if (key === "vit") p.hp = Math.min(maxHp(p), p.hp + STAT_BONUS.vit.hp);
  return true;
}

/** 学习技能树节点。返回 null=成功, 否则为失败原因。 */
export function learnSkillNode(p: PlayerState, node: SkillNode): string | null {
  if (p.learned.includes(node.id)) return "已学习";
  if (p.skillPoints < node.cost) return "技能点不足";
  // 层级解锁: 学 tier n 需已学至少 1 个 tier n-1 节点
  if (node.tier > 1 && !p.learned.some((id) => nodeById(id)?.tier === node.tier - 1)) {
    return `需要先学习 ${node.tier - 1} 层技能`;
  }
  p.skillPoints -= node.cost;
  p.learned.push(node.id);
  if (node.active) p.skill = { ...node.active };
  p.hp = Math.min(p.hp, maxHp(p));
  return null;
}

/** 穿装备, 返回换下的旧装备。hp 超上限收拢。 */
export function wear(p: PlayerState, eq: Equipment): Equipment | null {
  const old = p.equip[eq.slot];
  p.equip[eq.slot] = eq;
  p.hp = Math.min(p.hp, maxHp(p));
  return old;
}
