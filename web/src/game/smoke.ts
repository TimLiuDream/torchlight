// 逻辑层冒烟测试: 不碰 DOM, 用固定种子模拟"乱玩机器人"跑完多局。
// 运行: npm run smoke
import { CLASSES } from "./data";
import {
  adjacentMonsters, generateFloor, gatherCombatants, isCampFloor, isBossFloor,
  monsterTurn, removeMonsters, setTile, tileAt, tryMovePlayer,
} from "./dungeon";
import { createPlayer, gainExp, makeElite, maxHp, playerAtk, recLevel, resetMonsterIds, rollEquipment, wear } from "./player";
import { Rng } from "./rng";
import { enemyTurn, playerAction, settleVictory, startCombat, type Action } from "./combat";

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const resetIds = () => resetMonsterIds();

function runOnce(seed: number): { floor: number; kills: number } {
  const rng = new Rng(seed);
  const cls = CLASSES[rng.pick(["1", "2", "3"] as const)];
  const player = createPlayer(cls);
  player.baseHp += 500; // 机器人更耐打, 才能走深
  player.baseAtk += 12;
  player.hp = maxHp(player);

  let floor = 1;
  let map = generateFloor(rng, floor);
  resetIds();

  for (let step = 0; step < 4000 && player.hp > 0; step++) {
    const r = tryMovePlayer(map, ...rng.pick(DIRS));
    if (typeof r === "object") {
      // 进入战斗: 乱按行动直到结束
      const state = startCombat(player, r.combat, floor);
      let guard = 0;
      while (state.phase !== "won" && state.phase !== "lost" && guard++ < 500) {
        if (state.phase === "player") {
          const action: Action = rng.pick<Action>([
            { kind: "attack" }, { kind: "attack" }, { kind: "attack" },
            { kind: "skill" }, { kind: "potion", which: "血瓶" }, { kind: "potion", which: "蓝瓶" },
          ]);
          playerAction(state, player, rng, action);
        } else {
          enemyTurn(state, player, rng);
        }
      }
      if (state.phase === "lost") break;
      settleVictory(state, player, rng, (eq) => (player.bag.length >= 10 ? eq : null));
      removeMonsters(map, new Set(state.monsters.map((m) => m.id)));
      // 有装备就穿上
      for (let i = player.bag.length - 1; i >= 0; i--) {
        const eq = player.bag[i];
        const cur = player.equip[eq.slot];
        if (!cur || cur.value < eq.value) {
          player.bag.splice(i, 1);
          const old = wear(player, eq);
          if (old) player.bag.push(old);
        }
      }
      continue;
    }
    // 交互脚下特殊格
    const kind = tileAt(map, map.playerX, map.playerY);
    if (kind === "stairs") {
      const boss = map.monsters.find((m) => m.boss && m.hp > 0);
      if (boss) {
        const state = startCombat(player, gatherCombatants(map, boss), floor);
        let guard = 0;
        while (state.phase !== "won" && state.phase !== "lost" && guard++ < 500) {
          if (state.phase === "player") playerAction(state, player, rng, { kind: "attack" });
          else enemyTurn(state, player, rng);
        }
        if (state.phase === "lost") break;
        settleVictory(state, player, rng, (eq) => (player.bag.length >= 10 ? eq : null));
        removeMonsters(map, new Set(state.monsters.map((m) => m.id)));
        continue;
      }
      floor += 1;
      map = generateFloor(rng, floor);
    } else if (kind === "chest") {
      setTile(map, map.playerX, map.playerY, "floor");
      const cr = rng.next();
      if (cr < 0.1) {
        player.hp -= Math.max(5, Math.floor(maxHp(player) / 5));
      } else if (cr < 0.16) {
        const mimic = makeElite(rng, floor, map.playerX, map.playerY, true);
        const state = startCombat(player, [mimic], floor);
        while (state.phase !== "won" && state.phase !== "lost") {
          if (state.phase === "player") playerAction(state, player, rng, { kind: "attack" });
          else enemyTurn(state, player, rng);
        }
        if (state.phase === "lost") break;
        settleVictory(state, player, rng, (eq) => (player.bag.length >= 10 ? eq : null));
      } else if (cr < 0.54) {
        player.gold += (10 + floor * 5) * rng.int(2, 4);
      } else if (cr < 0.84) {
        player.bag.push(rollEquipment(rng, floor + rng.int(2, 5)));
      } else {
        player.potions[rng.pick(["血瓶", "蓝瓶"] as const)] += rng.int(1, 2);
      }
    } else if (kind === "spring") {
      setTile(map, map.playerX, map.playerY, "floor");
      player.hp = Math.min(maxHp(player), player.hp + Math.floor(maxHp(player) * rng.uniform(0.3, 1)));
      player.mp = Math.min(player.maxMp, player.mp + Math.floor(player.maxMp * rng.uniform(0.3, 1)));
    }
    const mt = monsterTurn(map, rng);
    if (mt !== "idle") {
      const state = startCombat(player, mt.combat, floor);
      let guard = 0;
      while (state.phase !== "won" && state.phase !== "lost" && guard++ < 500) {
        if (state.phase === "player") playerAction(state, player, rng, { kind: "attack" });
        else enemyTurn(state, player, rng);
      }
      if (state.phase === "lost") break;
      settleVictory(state, player, rng, (eq) => (player.bag.length >= 10 ? eq : null));
      removeMonsters(map, new Set(state.monsters.map((m) => m.id)));
    }
  }
  return { floor, kills: player.kills };
}

// monster id 全局递增, 多局之间重置避免干扰

// ---------------- 断言 ----------------
let failures = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    failures += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log("== 冒烟: 多局随机模拟 ==");
const results: Array<{ seed: number; floor: number; kills: number }> = [];
for (const seed of [1, 7, 42, 2026, 99999]) {
  resetIds();
  const r = runOnce(seed);
  results.push({ seed, ...r });
  console.log(`  seed=${seed} 倒在第 ${r.floor} 层, 击杀 ${r.kills}`);
}
check("至少一局走到第 3 层以后", results.some((r) => r.floor >= 3));
check("击杀数非负", results.every((r) => r.kills >= 0));

console.log("== 冒烟: 装备/成长/营地层数 ==");
{
  const rng = new Rng(7);
  resetIds();
  const cls = CLASSES["2"];
  const p = createPlayer(cls);
  check("初始 maxHp = baseHp", maxHp(p) === cls.hp);
  check("初始 atk = baseAtk", playerAtk(p) === cls.atk);
  const levels = gainExp(p, 1000);
  check("大量经验会连升", levels >= 5);
  check("升级回满", p.hp === maxHp(p) && p.mp === p.maxMp);
  let legendary = 0, rarityOk = true;
  for (let i = 0; i < 2000; i++) {
    const eq = rollEquipment(rng, 20);
    if (eq.rarity === "传说") legendary++;
    if (!["普通", "魔法", "稀有", "传说"].includes(eq.rarity)) rarityOk = false;
    if (eq.value <= 0) rarityOk = false;
  }
  check("2000 件装备稀有度/价值合法", rarityOk);
  check("传说有产出", legendary > 0);
  check("营地每 3 层", isCampFloor(3) && isCampFloor(6) && !isCampFloor(4));
  check("首领 5 层且避开营地", isBossFloor(5) && isBossFloor(10) && !isBossFloor(15));
  check("建议等级", recLevel(0) === 1 && recLevel(7) === 3);
}

console.log("== 冒烟: 地牢结构 ==");
{
  const rng = new Rng(123);
  resetIds();
  for (const f of [1, 2, 5, 8, 30]) {
    const m = generateFloor(rng, f);
    let floorTiles = 0, stairs = 0;
    const idx = (x: number, y: number) => y * m.cols + x;
    for (let y = 0; y < m.rows; y++)
      for (let x = 0; x < m.cols; x++) {
        const t = m.tiles[idx(x, y)];
        if (t === "floor") floorTiles++;
        if (t === "stairs") stairs++;
      }
    check(`f${f} 有地板`, floorTiles > 80);
    check(`f${f} 有楼梯`, stairs === 1);
    check(`f${f} 玩家不在墙里`, m.tiles[idx(m.playerX, m.playerY)] === "floor");
    check(`f${f} 出生点视野非空`, m.visible.some(Boolean));
    if (!m.isCamp) check(`f${f} 有怪物`, m.monsters.length > 0);
  }
  const camp = generateFloor(rng, 3);
  check("营地无怪物", camp.monsters.length === 0);
  check("营地有篝火/商人/传送/楼梯",
    camp.tiles.includes("campfire") && camp.tiles.includes("merchant") &&
    camp.tiles.includes("portal") && camp.tiles.includes("stairs"));
  const m1 = generateFloor(rng, 4);
  check("相邻判定正确", adjacentMonsters(m1).length === 0);
}

if (failures) {
  console.error(`\n冒烟失败: ${failures} 项`);
  process.exit(1);
}
console.log("\n冒烟通过 ✓");
