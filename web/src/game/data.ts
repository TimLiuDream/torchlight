import type { ClassDef, Rarity, Slot } from "./types";

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
    skill: { name: "烈焰风暴", cost: 20, desc: "造成 220% 攻击的火焰伤害" },
    sprite: "hero_mage",
  },
  "2": {
    name: "狂战士",
    hp: 125,
    atk: 10,
    mp: 25,
    skill: { name: "旋风斩", cost: 15, desc: "160% 攻击且必定暴击" },
    sprite: "hero_berserker",
  },
  "3": {
    name: "工程师",
    hp: 100,
    atk: 11,
    mp: 30,
    skill: { name: "急救无人机", cost: 18, desc: "回复 25% 生命, 并造成 80% 攻击伤害" },
    sprite: "hero_engineer",
  },
};

export const BAG_MAX = 10;
export const POTIONS = { healBase: 50, healPerLevel: 10, mana: 25 } as const;
export const EMPTY_LINES = [
  "风声在石壁间回荡, 这里空无一物。",
  "只剩前人留下的篝火余烬。",
  "地面刻着一行模糊的小字: '回头是岸'。",
];
