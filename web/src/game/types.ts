// 全局类型定义。命名尽量与文字版 torchlight_text.py 对齐, 方便对照移植。
export type Rarity = "普通" | "魔法" | "稀有" | "传说";
export type Slot = "武器" | "护甲" | "饰品";
export type AffixKey = "atk" | "hp" | "crit" | "leech" | "regen";
export type StatKey = "str" | "vit" | "mag" | "agi";

// 主动技能行为类型(战斗结算按 kind 分派)
export type SkillKind =
  | "flame"      // 220% 单体 (法师基础)
  | "whirl"      // 160% 必暴 (战士基础)
  | "drone"      // 回25%血+80%伤 (工程师基础)
  | "nova"       // 300% 单体
  | "aoe"        // 180% 全体
  | "leechWhirl" // 200% 必暴+吸血10%
  | "healBig"    // 回50%血+60%伤
  | "summon";    // 150% 全体

export interface Skill {
  name: string;
  cost: number;
  desc: string;
  kind?: SkillKind;
}

export interface ClassDef {
  name: string;
  hp: number;
  atk: number;
  mp: number;
  skill: Skill;
  sprite: string; // 玩家精灵 key
}

export interface Equipment {
  slot: Slot;
  kind: string; // 细类型(短剑/法杖/皮甲/戒指...), 标注用
  rarity: Rarity;
  atk: number;
  hp: number;
  crit: number;
  leech: number;
  regen: number;
  name: string;
  value: number;
  setId?: string; // 所属套装 id
}

export interface PlayerState {
  cls: string;
  baseHp: number;
  baseAtk: number;
  maxMp: number;
  skill: Skill;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  equip: Record<Slot, Equipment | null>;
  bag: Equipment[];
  gold: number;
  potions: { 血瓶: number; 蓝瓶: number };
  kills: number;
  restUsed: boolean;
  // ---- 成长系统 ----
  statPoints: number; // 未分配属性点
  stats: Record<StatKey, number>; // 力量/体力/魔力/敏捷
  skillPoints: number; // 未使用技能点
  learned: string[]; // 已学技能树节点 id
}

// ---- 技能树节点 ----
export interface SkillNode {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  type: "passive" | "active";
  desc: string;
  cost: number; // 技能点
  // 被动效果(atkFlat/hpFlat 为扁平值, Pct 为百分比)
  effect?: Partial<Record<"atkFlat" | "hpFlat" | "mpFlat" | "crit" | "leech" | "regen" | "atkPct" | "hpPct", number>>;
  active?: Skill; // 主动: 学后替换职业技
}

export interface Monster {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  boss: boolean;
  elite: boolean;
  x: number;
  y: number;
  body: string; // 精灵 key, 如 "slime"
}

// ---- 地牢 ----
export type TileKind =
  | "wall"
  | "floor"
  | "stairs"
  | "campfire"
  | "spring"
  | "chest"
  | "portal"
  | "merchant";

export interface FloorMap {
  cols: number;
  rows: number;
  tiles: TileKind[]; // 长度 cols*rows, 行优先
  seen: boolean[]; // 已探索(记忆)
  visible: boolean[]; // 当前视野
  playerX: number;
  playerY: number;
  monsters: Monster[];
  isCamp: boolean;
  floor: number;
}

export interface FloatingText {
  text: string;
  x: number; // 归一化 0~1 (相对战斗画布)
  y: number;
  color: string;
  t: number; // 剩余寿命 秒
}

export interface CombatMonster extends Monster {
  hurtFlash: number; // 受击闪白 剩余秒
}

export interface CombatState {
  monsters: CombatMonster[];
  round: number;
  log: LogLine[];
  phase: "player" | "enemy" | "won" | "lost";
  floats: FloatingText[];
  floor: number;
}

export interface LogLine {
  text: string;
  kind: "info" | "damage" | "heal" | "loot" | "crit" | "death";
}
