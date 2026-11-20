import {
  gainExp, playerAtk, playerCrit, playerLeech, playerRegen, maxHp, rollEquipment, usePotion,
} from "./player";
import type { Rng } from "./rng";
import type { CombatMonster, CombatState, Equipment, LogLine, Monster, PlayerState } from "./types";

export type Action =
  | { kind: "attack" }
  | { kind: "skill" }
  | { kind: "potion"; which: "血瓶" | "蓝瓶" };

/** playerAction 的结果: ok=false 表示行动无效(法力/药剂不足), 不消耗回合; crit 供暴击演出。 */
export interface ActionResult {
  ok: boolean;
  crit: boolean;
}

export function log(state: CombatState, text: string, kind: LogLine["kind"] = "info"): void {
  state.log.push({ text, kind });
}

export function startCombat(_player: PlayerState, monsters: Monster[], floor: number): CombatState {
  const copies: CombatMonster[] = monsters.map((m) => ({ ...m, hurtFlash: 0 }));
  const state: CombatState = {
    monsters: copies,
    round: 0,
    log: [],
    phase: "player",
    floats: [],
    floor,
  };
  const names = copies.map((m) => m.name).join("、");
  log(state, `遭遇 ${copies.length} 只怪物: ${names}`, "info");
  return state;
}

export function livingTargets(state: CombatState): CombatMonster[] {
  return state.monsters.filter((m) => m.hp > 0);
}

function monsterFloatPos(idx: number, total: number): [number, number] {
  if (total <= 1) return [0.71, 0.42];
  if (total === 2) return idx === 0 ? [0.64, 0.44] : [0.81, 0.39];
  const x = 0.56 + 0.32 * (idx / Math.max(1, total - 1));
  const y = idx % 2 === 0 ? 0.45 : 0.39;
  return [x, y];
}

function dealDamage(state: CombatState, player: PlayerState, target: CombatMonster, dmg: number, crit: boolean): void {
  target.hp -= dmg;
  target.hurtFlash = 0.25;
  log(state, `你对 ${target.name} 造成 ${dmg} 点伤害${crit ? "(暴击!)" : ""}`, crit ? "crit" : "damage");
  const idx = Math.max(0, state.monsters.indexOf(target));
  const [fx, fy] = monsterFloatPos(idx, state.monsters.length);
  state.floats.push({
    text: `${dmg}${crit ? "!" : ""}`,
    x: fx,
    y: fy,
    color: crit ? "#ffd23e" : "#ffffff",
    t: 1.0,
  });
  if (playerLeech(player) > 0) {
    const heal = Math.max(1, (dmg * playerLeech(player)) / 100) | 0;
    player.hp = Math.min(maxHp(player), player.hp + heal);
    log(state, `  吸血回复 ${heal} 点。`, "heal");
  }
}

/**
 * 玩家一次行动。返回 ok=false 表示行动无效(法力/药剂不足), 不消耗回合。
 * 行动有效时推进 phase 到 enemy(除非战斗已结束)。crit 标记本次行动是否有暴击命中(演出用)。
 */
export function playerAction(state: CombatState, player: PlayerState, rng: Rng, action: Action): ActionResult {
  const targets = livingTargets(state);
  if (!targets.length) return { ok: true, crit: false };
  const target = targets[0];
  let crit = false;

  if (action.kind === "attack") {
    const dmg = Math.floor(playerAtk(player) * rng.uniform(0.9, 1.1));
    crit = rng.next() * 100 < playerCrit(player);
    dealDamage(state, player, target, dmg * (crit ? 2 : 1), crit);
  } else if (action.kind === "skill") {
    if (player.mp < player.skill.cost) {
      log(state, "法力不足!", "info");
      return { ok: false, crit: false };
    }
    player.mp -= player.skill.cost;
    const atk = playerAtk(player);
    switch (player.skill.kind) {
      case "whirl": {
        // 必暴
        crit = true;
        dealDamage(state, player, target, Math.floor(atk * 1.6 * 2), true);
        break;
      }
      case "drone": {
        const heal = Math.floor(maxHp(player) / 4);
        player.hp = Math.min(maxHp(player), player.hp + heal);
        log(state, `无人机修理了你的装甲, 回复 ${heal} 点。`, "heal");
        state.floats.push({ text: `+${heal}`, x: 0.28, y: 0.42, color: "#4ade80", t: 1.0 });
        dealDamage(state, player, target, Math.floor(atk * 0.8), false);
        break;
      }
      case "nova": {
        dealDamage(state, player, target, Math.floor(atk * 3), false);
        break;
      }
      case "aoe":
      case "summon": {
        const mult = player.skill.kind === "aoe" ? 1.8 : 1.5;
        for (const m of livingTargets(state)) {
          dealDamage(state, player, m, Math.floor(atk * mult * rng.uniform(0.95, 1.05)), false);
        }
        log(state, `${player.skill.name} 覆盖了全部敌人!`, "damage");
        break;
      }
      case "leechWhirl": {
        const dmg = Math.floor(atk * 2);
        crit = true;
        dealDamage(state, player, target, dmg, true);
        const heal = Math.max(1, Math.floor(dmg * 0.1));
        player.hp = Math.min(maxHp(player), player.hp + heal);
        log(state, `  嗜血吸取 ${heal} 点。`, "heal");
        break;
      }
      case "healBig": {
        const heal = Math.floor(maxHp(player) / 2);
        player.hp = Math.min(maxHp(player), player.hp + heal);
        log(state, `纳米修复回复了 ${heal} 点。`, "heal");
        state.floats.push({ text: `+${heal}`, x: 0.28, y: 0.42, color: "#4ade80", t: 1.0 });
        dealDamage(state, player, target, Math.floor(atk * 0.6), false);
        break;
      }
      default: {
        // flame
        dealDamage(state, player, target, Math.floor(atk * 2.2), false);
      }
    }
  } else {
    const restored = usePotion(player, action.which);
    if (restored === null) {
      log(state, `没有${action.which}了!`, "info");
      return { ok: false, crit: false };
    }
    if (action.which === "血瓶") {
      log(state, `喝下血瓶, 回复 ${restored} 点。`, "heal");
      state.floats.push({ text: `+${restored}`, x: 0.28, y: 0.42, color: "#4ade80", t: 1.0 });
    } else {
      log(state, `喝下蓝瓶, 回复 ${restored} 点法力。`, "heal");
    }
  }

  if (!livingTargets(state).length) {
    state.phase = "won";
  } else {
    state.phase = "enemy";
  }
  return { ok: true, crit };
}

/** 单只怪物发起一次攻击结算。返回本次伤害与玩家是否存活。 */
export function enemySingleAttack(
  state: CombatState,
  m: CombatMonster,
  player: PlayerState,
  rng: Rng,
): { dmg: number; alive: boolean } {
  if (m.hp <= 0 || player.hp <= 0) return { dmg: 0, alive: player.hp > 0 };
  const dmg = Math.max(1, Math.floor(m.atk * rng.uniform(0.85, 1.15)));
  player.hp -= dmg;
  log(state, `${m.name} 对你造成 ${dmg} 点伤害。`, "damage");
  state.floats.push({ text: `-${dmg}`, x: 0.23, y: 0.43, color: "#ff6b6b", t: 1.0 });
  if (player.hp <= 0) {
    player.hp = 0;
    state.phase = "lost";
    return { dmg, alive: false };
  }
  return { dmg, alive: true };
}

/** 敌方全体行动完毕后的回合收尾(回蓝 + 推进回合)。 */
export function finishEnemyRound(state: CombatState, player: PlayerState): void {
  player.mp = Math.min(player.maxMp, player.mp + playerRegen(player));
  state.round += 1;
  if (!livingTargets(state).length) state.phase = "won";
  else state.phase = "player";
}

/** 敌方一轮行动(供无头测试同步调用)。返回 false 表示玩家死亡。 */
export function enemyTurn(state: CombatState, player: PlayerState, rng: Rng): boolean {
  for (const m of livingTargets(state)) {
    const { alive } = enemySingleAttack(state, m, player, rng);
    if (!alive) return false;
  }
  finishEnemyRound(state, player);
  return true;
}

export interface VictoryResult {
  gold: number;
  exp: number;
  levels: number;
  drops: Equipment[];
  bossKilled: boolean;
}

/** 战斗胜利结算: 金币/经验/掉落。掉落是否拾取由 UI 层决定。 */
export function settleVictory(state: CombatState, player: PlayerState, rng: Rng, bagFull: (eq: Equipment) => Equipment | null): VictoryResult {
  const res: VictoryResult = { gold: 0, exp: 0, levels: 0, drops: [], bossKilled: false };
  for (const m of state.monsters) {
    player.kills += 1;
    let gold = (m.boss ? 10 : 3) + state.floor * 3;
    let exp = (2 + state.floor) * (m.boss ? 3 : 1);
    if (m.elite) {
      gold *= 2;
      exp *= 2;
    }
    res.gold += gold;
    res.exp += exp;
    log(state, `✓ ${m.name} 被击杀! 掉落 ${gold} 金币, 获得 ${exp} 点经验。`, "loot");
    if (m.boss) res.bossKilled = true;

    let drop: Equipment | null = null;
    if (m.boss) drop = rollEquipment(rng, state.floor, rng.pick(["稀有", "传说"] as const));
    else if (m.elite) drop = rollEquipment(rng, state.floor + 2, "稀有");
    else if (rng.chance(0.35)) drop = rollEquipment(rng, state.floor);
    if (drop) {
      const sold = bagFull(drop);
      if (sold) {
        res.gold += sold.value;
        log(state, `  背包已满, 宠物把它叼回城镇卖掉, 换回 ${sold.value} 金币。`, "loot");
      } else {
        res.drops.push(drop);
      }
    }
  }
  player.gold += res.gold;
  res.levels = gainExp(player, res.exp);
  return res;
}
