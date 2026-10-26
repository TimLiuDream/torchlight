import type { ClassDef, Rarity, SkillNode, Slot } from "./types";

// ---- 文案/颜色 ----
export const RARITY_COLOR: Record<Rarity, string> = {
  普通: "#d8d8d8",
  魔法: "#5b8cff",
  稀有: "#ffd23e",
  传说: "#ff5b4a",
};

export const RARITY_MULT: Record<Rarity, number> = {
  普通: 1.0,
  魔法: 1.2,
  稀有: 1.45,
  传说: 1.8,
};

export const AFFIX_N: Record<Rarity, number> = { 普通: 0, 魔法: 1, 稀有: 2, 传说: 3 };

export const RARITIES: Rarity[] = ["普通", "魔法", "稀有", "传说"];

// ---- 名字池 ----
export const WEAPONS = ["短剑", "战斧", "法杖", "火枪", "铁拳套"] as const;
export const ARMORS = ["皮甲", "锁子甲", "法师袍", "板甲"] as const;
export const TRINKETS = ["戒指", "护符", "怀表", "魔晶"] as const;
export const PREFIXES = ["凶残的", "坚固的", "迅捷的", "焚烧的", "寒霜的", "嗜血的", "被诅咒的", "发光的"] as const;
export const LEGEND_NAMES: Record<Slot, string> = {
  武器: "火炬之心",
  护甲: "龙鳞战衣",
  饰品: "时之沙漏",
};

export const M_PREFIX = ["饥饿的", "狂暴的", "变异的", "被诅咒的", "巨大的", "阴险的"] as const;
// body[1] 是精灵 key
export const M_BODY: ReadonlyArray<readonly [string, string]> = [
  ["地精掠夺者", "goblin"],
  ["史莱姆", "slime"],
  ["骷髅弓手", "skeleton"],
  ["地穴蜘蛛", "spider"],
  ["穴居暴徒", "brute"],
  ["幽魂", "ghost"],
  ["岩石傀儡", "golem"],
  ["暗影猎犬", "hound"],
];
export const BOSS_NAMES = ["深渊领主", "熔岩魔王", "骸骨君王", "机械暴君"] as const;

export const CLASSES: Record<string, ClassDef> = {
  "1": {
    name: "灰烬法师",
    hp: 80,
    atk: 12,
    mp: 40,
    skill: { name: "烈焰风暴", cost: 20, desc: "造成 220% 攻击的火焰伤害", kind: "flame" },
    sprite: "hero_mage",
  },
  "2": {
    name: "狂战士",
    hp: 125,
    atk: 10,
    mp: 25,
    skill: { name: "旋风斩", cost: 15, desc: "160% 攻击且必定暴击", kind: "whirl" },
    sprite: "hero_berserker",
  },
  "3": {
    name: "工程师",
    hp: 100,
    atk: 11,
    mp: 30,
    skill: { name: "急救无人机", cost: 18, desc: "回复 25% 生命, 并造成 80% 攻击伤害", kind: "drone" },
    sprite: "hero_engineer",
  },
};

// ---- 套装 ----
export interface SetDef {
  id: string;
  name: string;
  pieces: Slot[];
  desc2: string; // 2 件效果描述
  bonus2: { atkPct?: number; hpPct?: number; crit?: number; leech?: number; regen?: number };
  desc3: string;
  bonus3: { atkPct?: number; hpPct?: number; crit?: number; leech?: number; regen?: number };
}

export const SETS: Record<string, SetDef> = {
  ashflame: {
    id: "ashflame",
    name: "灰烬誓约",
    pieces: ["武器", "护甲", "饰品"],
    desc2: "攻击 +15%",
    bonus2: { atkPct: 0.15 },
    desc3: "攻击 +15%, 暴击 +10%",
    bonus3: { atkPct: 0.15, crit: 10 },
  },
  bedrock: {
    id: "bedrock",
    name: "磐石壁垒",
    pieces: ["武器", "护甲", "饰品"],
    desc2: "生命 +25%",
    bonus2: { hpPct: 0.25 },
    desc3: "生命 +25%, 回蓝 +2/回合",
    bonus3: { hpPct: 0.25, regen: 2 },
  },
  gale: {
    id: "gale",
    name: "疾风猎手",
    pieces: ["武器", "护甲", "饰品"],
    desc2: "暴击 +8%",
    bonus2: { crit: 8 },
    desc3: "暴击 +8%, 吸血 5%",
    bonus3: { crit: 8, leech: 5 },
  },
};

// 套装掉落概率(稀有/传说件成为套装件)
export const SET_DROP_CHANCE: Record<"稀有" | "传说", number> = { 稀有: 0.25, 传说: 0.55 };

// ---- 技能树 ----
export const SKILL_TREES: Record<string, SkillNode[]> = {
  灰烬法师: [
    { id: "m1a", name: "烈焰专精", tier: 1, type: "passive", desc: "攻击 +10%", cost: 1, effect: { atkPct: 0.10 } },
    { id: "m1b", name: "秘法吸纳", tier: 1, type: "passive", desc: "回蓝 +2/回合", cost: 1, effect: { regen: 2 } },
    { id: "m2a", name: "灼热心法", tier: 2, type: "passive", desc: "暴击 +8%", cost: 2, effect: { crit: 8 } },
    { id: "m2b", name: "法力护盾", tier: 2, type: "passive", desc: "生命 +12%", cost: 2, effect: { hpPct: 0.12 } },
    { id: "m3a", name: "炎爆术", tier: 3, type: "active", desc: "单体 300% 攻击 (30蓝), 替换烈焰风暴", cost: 3,
      active: { name: "炎爆术", cost: 30, desc: "造成 300% 攻击的火焰伤害", kind: "nova" } },
    { id: "m3b", name: "流星火雨", tier: 3, type: "active", desc: "全体 180% 攻击 (26蓝), 替换烈焰风暴", cost: 3,
      active: { name: "流星火雨", cost: 26, desc: "对全部敌人造成 180% 攻击伤害", kind: "aoe" } },
  ],
  狂战士: [
    { id: "b1a", name: "狂暴之力", tier: 1, type: "passive", desc: "攻击 +12%", cost: 1, effect: { atkPct: 0.12 } },
    { id: "b1b", name: "铁血体魄", tier: 1, type: "passive", desc: "生命 +14%", cost: 1, effect: { hpPct: 0.14 } },
    { id: "b2a", name: "致命本能", tier: 2, type: "passive", desc: "暴击 +10%", cost: 2, effect: { crit: 10 } },
    { id: "b2b", name: "战意回复", tier: 2, type: "passive", desc: "回蓝 +2/回合", cost: 2, effect: { regen: 2 } },
    { id: "b3a", name: "嗜血旋风", tier: 3, type: "active", desc: "200% 必暴+吸血10% (20蓝), 替换旋风斩", cost: 3,
      active: { name: "嗜血旋风", cost: 20, desc: "200% 必暴, 并吸取 10% 伤害回血", kind: "leechWhirl" } },
    { id: "b3b", name: "裂地战吼", tier: 3, type: "active", desc: "全体 150% 攻击 (24蓝), 替换旋风斩", cost: 3,
      active: { name: "裂地战吼", cost: 24, desc: "对全部敌人造成 150% 攻击伤害", kind: "aoe" } },
  ],
  工程师: [
    { id: "e1a", name: "机械改造", tier: 1, type: "passive", desc: "攻击 +10%", cost: 1, effect: { atkPct: 0.10 } },
    { id: "e1b", name: "装甲强化", tier: 1, type: "passive", desc: "生命 +15%", cost: 1, effect: { hpPct: 0.15 } },
    { id: "e2a", name: "精密校准", tier: 2, type: "passive", desc: "暴击 +8%", cost: 2, effect: { crit: 8 } },
    { id: "e2b", name: "能量核心", tier: 2, type: "passive", desc: "回蓝 +3/回合", cost: 2, effect: { regen: 3 } },
    { id: "e3a", name: "炮台支援", tier: 3, type: "active", desc: "全体 150% 攻击 (30蓝), 替换急救无人机", cost: 3,
      active: { name: "炮台支援", cost: 30, desc: "召唤炮台轰击全部敌人, 150% 攻击伤害", kind: "summon" } },
    { id: "e3b", name: "纳米修复", tier: 3, type: "active", desc: "回 50% 生命+60% 攻击伤害 (26蓝), 替换急救无人机", cost: 3,
      active: { name: "纳米修复", cost: 26, desc: "回复 50% 生命, 并造成 60% 攻击伤害", kind: "healBig" } },
  ],
};

export const STAT_POINTS_PER_LEVEL = 3;
export const SKILL_POINTS_PER_LEVEL = 1;
// 每点属性加成
export const STAT_BONUS = { str: { atk: 2 }, vit: { hp: 8 }, mag: { mp: 4 }, agi: { crit: 0.5 } } as const;

export const BAG_MAX = 10;
export const POTIONS = { healBase: 50, healPerLevel: 10, mana: 25 } as const;
export const EMPTY_LINES = [
  "风声在石壁间回荡, 这里空无一物。",
  "只剩前人留下的篝火余烬。",
  "地面刻着一行模糊的小字: '回头是岸'。",
];
