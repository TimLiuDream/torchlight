import { useEffect, useReducer, useRef, useState } from "react";
import { CLASSES, EMPTY_LINES } from "./game/data";
import { createPlayer, learnSkillNode, makeElite, maxHp, recLevel, rollEquipment, spendStat } from "./game/player";
import { Rng } from "./game/rng";
import { clearSave, loadGame, saveGame } from "./game/save";
import {
  generateFloor, gatherCombatants, monsterTurn,
  removeMonsters, setTile, tileAt, tryMovePlayer, isBossFloor,
} from "./game/dungeon";
import {
  enemyTurn, playerAction, settleVictory, startCombat,
} from "./game/combat";
import type { Action } from "./game/combat";
import type { CombatState, Equipment, FloorMap, LogLine, Monster, PlayerState, SkillNode, StatKey } from "./game/types";
import {
  addWorldFloat, attackAnim, clearSceneFx, combatAnchor, dungeonThemeName, faceDir, gameCanvasSize, hitStopFx, renderCombat, renderDungeon, setDungeonTheme, shakeCam, startFloorTransition,
  worldToScreenCam,
} from "./render/renderer";
import * as fx from "./render/particles";
import { ActionBar, BossBar, Minimap, Orb } from "./ui/Hud";
import {
  CreateScreen, DeadScreen, GameCanvas,
  InventoryPanel, LootPanel, LogPanel, MerchantPanel, MerchantOffer, PortalPanel, SkillTreePanel, TitleScreen,
} from "./ui/components";
import { TouchControls } from "./ui/TouchControls";

type Scene = "title" | "create" | "play" | "dead";
type OverlayKind = "inv" | "skill" | "merchant" | "portal" | "loot" | null;

// playerAction/enemyTurn 会就地修改 state.phase, TS 的属性收窄看不到 mutation,
// 经由函数返回值重新读取以获得联合类型。
const phaseOf = (s: CombatState) => s.phase;

const CANVAS_W = 800;
const CANVAS_H = 450;
// 触屏设备: 画布内部分辨率跟随容器, 游戏区撑满屏幕
const IS_TOUCH = typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);

export default function App() {
  const [scene, setScene] = useState<Scene>("title");
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);

  // 命令式游戏状态(与文字版同样的就地修改风格), force() 触发 UI 刷新
  const playerRef = useRef<PlayerState | null>(null);
  const mapRef = useRef<FloorMap | null>(null);
  const combatRef = useRef<CombatState | null>(null);
  const floorRef = useRef(1);
  const rngRef = useRef(new Rng(Date.now() & 0xffffffff));
  const lootQueueRef = useRef<Equipment[]>([]);
  const merchantRef = useRef<MerchantOffer | null>(null);
  const dungeonLogRef = useRef<LogLine[]>([]);
  const enemyTimerRef = useRef<number | null>(null);
  const victoryGoldRef = useRef({ gold: 0, exp: 0, levels: 0 });
  const spriteKeyRef = useRef("hero_mage");

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const dlog = (text: string, kind: LogLine["kind"] = "info") => {
    dungeonLogRef.current.push({ text, kind });
    if (dungeonLogRef.current.length > 60) dungeonLogRef.current.splice(0, 20);
  };

  const persist = () => {
    if (playerRef.current && mapRef.current) saveGame(playerRef.current, floorRef.current, mapRef.current);
  };

  // ---------------- 开局 ----------------
  const startNewRun = () => setScene("create");

  const beginRun = (clsKey: string) => {
    const cls = CLASSES[clsKey];
    const p = createPlayer(cls);
    playerRef.current = p;
    spriteKeyRef.current = cls.sprite;
    floorRef.current = 1;
    setDungeonTheme(1);
    rngRef.current = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
    mapRef.current = generateFloor(rngRef.current, 1);
    dungeonLogRef.current = [{ text: `你踏入了地牢。第 1 层, 建议 Lv${recLevel(1)}。`, kind: "info" }];
    clearSave();
    persist();
    clearSceneFx();
    setOverlay(null);
    setScene("play");
    force();
  };

  const continueRun = () => {
    const d = loadGame();
    if (!d) { showToast("存档不存在"); return; }
    playerRef.current = d.player;
    mapRef.current = d.map;
    floorRef.current = d.floor;
    setDungeonTheme(d.floor);
    const cls = Object.values(CLASSES).find((c) => c.name === d.player.cls);
    spriteKeyRef.current = cls?.sprite ?? "hero_mage";
    dungeonLogRef.current = [{ text: `读档: ${d.player.cls} Lv${d.player.level}, 第 ${d.floor} 层。`, kind: "info" }];
    clearSceneFx();
    setScene("play");
    force();
  };

  // ---------------- 死亡 ----------------
  const die = () => {
    if (enemyTimerRef.current) window.clearTimeout(enemyTimerRef.current);
    clearSave();
    setOverlay(null);
    setScene("dead");
    force();
  };

  // ---------------- 下楼/传送 ----------------
  const enterFloor = (floor: number, fromCamp: boolean) => {
    const p = playerRef.current!;
    if (fromCamp) p.restUsed = false;
    floorRef.current = floor;
    setDungeonTheme(floor);
    mapRef.current = generateFloor(rngRef.current, floor);
    const bossTag = isBossFloor(floor) ? " · 首领出没!" : "";
    dlog(`—— 第 ${floor} 层 · ${dungeonThemeName()} · 建议 Lv${recLevel(floor)}${bossTag}`, "loot");
    if (p.level < recLevel(floor)) dlog("! 你的等级低于建议值, 小心行事。", "damage");
    startFloorTransition(floor, dungeonThemeName());
    persist();
    force();
  };

  const goDown = () => {
    const map = mapRef.current!;
    enterFloor(floorRef.current + 1, map.isCamp);
  };

  // ---------------- 战斗 ----------------
  const startCombatWith = (monsters: Monster[]) => {
    if (!monsters.length) return;
    combatRef.current = startCombat(playerRef.current!, monsters, floorRef.current);
    setOverlay(null);
    force();
  };

  const finishCombat = () => {
    const state = combatRef.current!;
    const p = playerRef.current!;
    const map = mapRef.current!;
    const bagFull = (eq: Equipment): Equipment | null => {
      if (p.bag.length >= 10) return eq;
      return null;
    };
    const res = settleVictory(state, p, rngRef.current, bagFull);
    victoryGoldRef.current = { gold: res.gold, exp: res.exp, levels: res.levels };
    removeMonsters(map, new Set(state.monsters.map((m) => m.id)));
    combatRef.current = null;
    lootQueueRef.current = res.drops;
    dlog(`战斗胜利! 掉落 ${res.gold} 金币, 获得 ${res.exp} 经验。`, "loot");
    if (res.levels > 0) {
      showToast(`✦ 升级! 等级 ${p.level} · 属性点+${res.levels * 3} 技能点+${res.levels} (I 背包 / K 技能树)`);
      const [wx, wy] = worldToScreenCam(map.playerX, map.playerY);
      fx.levelUp(wx, wy - 20);
    }
    if (res.drops.length) {
      const [wx, wy] = worldToScreenCam(map.playerX, map.playerY);
      fx.lootBeam(wx, wy);
    }
    persist();
    if (res.drops.length) setOverlay("loot");
    force();
  };

  const onCombatAction = (action: Action) => {
    const state = combatRef.current;
    const p = playerRef.current;
    if (!state || !p || phaseOf(state) !== "player") return;
    // 战斗演出锚点(与 renderer 布局同一坐标系), 目标取第一只活怪
    const targetIdx = Math.max(0, state.monsters.findIndex((m) => m.hp > 0));
    const { w: CW, h: CH } = gameCanvasSize();
    const anchor = combatAnchor({ width: CW, height: CH }, targetIdx);
    const px = anchor.px;
    const py = anchor.py;
    const tx = anchor.tx;
    const ty = anchor.ty;
    const consumed = playerAction(state, p, rngRef.current, action);
    if (!consumed) { force(); return; }

    if (action.kind === "attack" || action.kind === "skill") {
      attackAnim();
      const isCrit = state.log[state.log.length - 1]?.text.includes("(暴击!)") ?? false;
      if (action.kind === "skill") {
        if (p.cls === "灰烬法师") fx.flame(px + 40, py - 60, tx, ty);
        else if (p.cls === "狂战士") fx.whirl(tx, ty);
        else { fx.repairSpark(px + 40, py - 50); fx.heal(px + 40, py - 60); }
      }
      fx.hit(tx, ty);
      if (isCrit) {
        fx.crit(tx, ty);
        shakeCam(9);
        hitStopFx(0.05);
      } else {
        shakeCam(3.5);
      }
    } else if (action.kind === "potion" && action.which === "血瓶") {
      fx.heal(px + 40, py - 60);
    }

    if (phaseOf(state) === "won") { finishCombat(); return; }
    if (phaseOf(state) === "lost") { die(); return; }
    force();
    enemyTimerRef.current = window.setTimeout(() => {
      const s = combatRef.current;
      if (!s) return;
      const hpBefore = p.hp;
      const alive = enemyTurn(s, p, rngRef.current);
      if (!alive) { shakeCam(11); die(); return; }
      if (p.hp < hpBefore) shakeCam(6);
      if (phaseOf(s) === "won") { finishCombat(); return; }
      force();
    }, 420);
  };

  // ---------------- 地牢交互 ----------------
  const afterPlayerAct = () => {
    const map = mapRef.current!;
    const mt = monsterTurn(map, rngRef.current);
    if (mt !== "idle") { startCombatWith(mt.combat); return; }
    persist();
    force();
  };

  const onMove = (dx: number, dy: number) => {
    if (combatRef.current || overlay) return;
    const map = mapRef.current!;
    faceDir(dx);
    const r = tryMovePlayer(map, dx, dy);
    if (r === "blocked") return;
    if (typeof r === "object") { startCombatWith(r.combat); return; }
    afterPlayerAct();
  };

  const openChest = () => {
    const map = mapRef.current!;
    const p = playerRef.current!;
    const floor = floorRef.current;
    setTile(map, map.playerX, map.playerY, "floor");
    const r = rngRef.current.next();
    if (r < 0.1) {
      const dmg = Math.max(5, Math.floor(maxHp(p) / 5));
      p.hp -= dmg;
      dlog(`是陷阱箱! 爆炸对你造成 ${dmg} 点伤害!`, "damage");
      if (p.hp <= 0) { p.hp = 0; die(); return; }
    } else if (r < 0.16) {
      dlog("箱子突然咧开一排牙齿——拟态怪!", "damage");
      const mimic = makeElite(rngRef.current, floor, map.playerX, map.playerY, true);
      startCombatWith([mimic]);
      return;
    } else if (r < 0.54) {
      const gold = (10 + floor * 5) * rngRef.current.int(2, 4);
      p.gold += gold;
      dlog(`满满一箱金币! 获得 ${gold} 金。`, "loot");
      const [wx, wy] = worldToScreenCam(map.playerX, map.playerY);
      addWorldFloat(map.playerX, map.playerY, `+${gold}金`, "#ffd23e");
      fx.burst(wx, wy - 14, { colors: ["#ffd23e", "#fff3b0"], count: 16, speed: 140, life: 0.6 });
    } else if (r < 0.84) {
      dlog("箱底垫着一件装备……", "loot");
      const [wx, wy] = worldToScreenCam(map.playerX, map.playerY);
      fx.lootBeam(wx, wy - 10);
      lootQueueRef.current = [rollAt(floor + rngRef.current.int(2, 5))];
      setOverlay("loot");
      persist();
      force();
      return;
    } else {
      const n = rngRef.current.int(1, 2);
      const kind = rngRef.current.pick(["血瓶", "蓝瓶"] as const);
      p.potions[kind] += n;
      dlog(`箱子里码着药剂: ${kind}×${n}!`, "heal");
    }
    persist();
    force();
  };

  // 延迟封装: 统一入口生成装备
  const rollAt = (floor: number, forceRarity?: Equipment["rarity"]) =>
    rollEquipment(rngRef.current, floor, forceRarity);

  const drinkSpring = () => {
    const map = mapRef.current!;
    const p = playerRef.current!;
    setTile(map, map.playerX, map.playerY, "floor");
    const hpHeal = Math.floor(maxHp(p) * rngRef.current.uniform(0.3, 1.0));
    const mpHeal = Math.floor(p.maxMp * rngRef.current.uniform(0.3, 1.0));
    p.hp = Math.min(maxHp(p), p.hp + hpHeal);
    p.mp = Math.min(p.maxMp, p.mp + mpHeal);
    dlog(`清冽的泉水恢复了你 ${hpHeal} 点生命、${mpHeal} 点法力。`, "heal");
    const [wx, wy] = worldToScreenCam(map.playerX, map.playerY);
    fx.heal(wx, wy - 20);
    persist();
    force();
  };

  const restAtFire = () => {
    const p = playerRef.current!;
    const map = mapRef.current!;
    if (p.restUsed) { dlog("这次营地的火已经烤过一遍了。", "info"); force(); return; }
    p.restUsed = true;
    p.hp = Math.min(maxHp(p), p.hp + Math.floor(maxHp(p) * 0.6));
    p.mp = Math.min(p.maxMp, p.mp + Math.floor(p.maxMp * 0.6));
    dlog("在篝火边休息片刻…… 生命法力大幅恢复。", "heal");
    const [wx, wy] = worldToScreenCam(map.playerX, map.playerY);
    fx.heal(wx, wy - 20);
    persist();
    force();
  };

  const openMerchant = () => {
    const map = mapRef.current!;
    const floor = floorRef.current;
    const rng = rngRef.current;
    const camp = map.isCamp;
    const eq = camp
      ? rollAt(floor, rng.pick(["魔法", "稀有"] as const))
      : rollAt(floor + rng.int(0, 3), rng.pick(["魔法", "稀有"] as const));
    merchantRef.current = camp
      ? { kind: "camp", potionPrice: 20 + floor * 5, manaPrice: 15 + floor * 4, potionCount: 1, manaCount: 1, eq, eqPrice: eq.value }
      : { kind: "wander", potionPrice: 3 * (15 + floor * 4), manaPrice: 3 * (12 + floor * 3), potionCount: 3, manaCount: 3, eq, eqPrice: eq.value };
    setOverlay("merchant");
    force();
  };

  const onInteract = () => {
    if (combatRef.current || overlay) return;
    const map = mapRef.current!;
    const kind = tileAt(map, map.playerX, map.playerY);
    if (kind === "stairs") {
      const boss = map.monsters.find((m) => m.boss && m.hp > 0);
      if (boss) {
        dlog("首领的咆哮震得楼梯簌簌落灰——先击败它!", "damage");
        startCombatWith(gatherCombatants(map, boss));
        return;
      }
      goDown();
    } else if (kind === "chest") openChest();
    else if (kind === "spring") drinkSpring();
    else if (kind === "campfire") restAtFire();
    else if (kind === "portal") setOverlay("portal");
    else if (kind === "merchant") openMerchant();
    else {
      // 空地: 文字版的"空房间"趣味文案, 低概率捡钱
      if (rngRef.current.chance(0.06)) {
        const gold = rngRef.current.int(2, 5) + floorRef.current;
        playerRef.current!.gold += gold;
        dlog(`角落里散落着几枚金币, 捡起 ${gold} 金。`, "loot");
        persist();
      } else if (rngRef.current.chance(0.04)) {
        dlog(rngRef.current.pick(EMPTY_LINES), "info");
      }
      force();
    }
  };

  // ---------------- 商店操作 ----------------
  const buyPotion = () => {
    const p = playerRef.current!;
    const o = merchantRef.current!;
    if (p.gold < o.potionPrice) return;
    p.gold -= o.potionPrice;
    p.potions["血瓶"] += o.potionCount;
    dlog(`成交! 血瓶×${o.potionCount}。`, "loot");
    persist(); force();
  };
  const buyMana = () => {
    const p = playerRef.current!;
    const o = merchantRef.current!;
    if (p.gold < o.manaPrice) return;
    p.gold -= o.manaPrice;
    p.potions["蓝瓶"] += o.manaCount;
    dlog(`成交! 蓝瓶×${o.manaCount}。`, "loot");
    persist(); force();
  };
  const buyEq = () => {
    const p = playerRef.current!;
    const o = merchantRef.current!;
    if (p.gold < o.eqPrice || p.bag.length >= 10) return;
    p.gold -= o.eqPrice;
    p.bag.push(o.eq);
    dlog("成交!", "loot");
    merchantRef.current = null;
    setOverlay(null);
    persist(); force();
  };
  const sellAll = () => {
    const p = playerRef.current!;
    if (!p.bag.length) return;
    const gold = p.bag.reduce((s, e) => s + e.value, 0);
    p.gold += gold;
    p.bag = [];
    dlog(`宠物把一包装备叼回城镇卖掉, 换回 ${gold} 金币。`, "loot");
    persist(); force();
  };

  // ---------------- 背包/掉落 ----------------
  const onSpendStat = (key: StatKey) => {
    const p = playerRef.current!;
    if (spendStat(p, key)) { persist(); force(); }
  };
  const onLearnSkill = (node: SkillNode) => {
    const p = playerRef.current!;
    const err = learnSkillNode(p, node);
    if (err) { showToast(err); return; }
    dlog(`✦ 习得 ${node.name}!`, "loot");
    persist(); force();
  };

  const wearFromBag = (eq: Equipment) => {
    const p = playerRef.current!;
    const idx = p.bag.indexOf(eq);
    if (idx < 0) return;
    p.bag.splice(idx, 1);
    const old = p.equip[eq.slot];
    p.equip[eq.slot] = eq;
    p.hp = Math.min(p.hp, maxHp(p));
    if (old) p.bag.push(old);
    persist(); force();
  };
  const dropFromBag = (eq: Equipment) => {
    const p = playerRef.current!;
    const idx = p.bag.indexOf(eq);
    if (idx >= 0) p.bag.splice(idx, 1);
    persist(); force();
  };

  const takeLoot = () => {
    const p = playerRef.current!;
    const eq = lootQueueRef.current.shift();
    if (eq && p.bag.length < 10) p.bag.push(eq);
    if (lootQueueRef.current.length) { force(); return; }
    setOverlay(null);
    persist(); force();
  };
  const skipLoot = () => {
    lootQueueRef.current = [];
    setOverlay(null);
    force();
  };

  const portalGo = (target: number) => {
    dlog(`传送门闪过一道光…… 你出现在第 ${target} 层。`, "loot");
    enterFloor(target, true);
    setOverlay(null);
  };

  // ---------------- 键盘 ----------------
  const keysDown = useRef(new Set<string>());
  const lastMoveAt = useRef(0);
  useEffect(() => {
    const DIR_KEYS: Record<string, string> = {
      w: "w", arrowup: "w", s: "s", arrowdown: "s",
      a: "a", arrowleft: "a", d: "d", arrowright: "d",
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      const dir = DIR_KEYS[k];
      if (dir) { keysDown.current.add(dir); return; }
      if (scene === "play") {
        if (overlay === "loot") {
          if (k === "y") takeLoot();
          else if (k === "escape") skipLoot();
          return;
        }
        if (overlay === "merchant") { if (k === "escape") { setOverlay(null); force(); } return; }
        if (overlay === "portal") { if (k === "escape") { setOverlay(null); force(); } return; }
        if (overlay === "skill") {
          if (k === "k" || k === "escape") { setOverlay(null); force(); }
          return;
        }
        if (overlay === "inv") {
          if (k === "i" || k === "escape") { setOverlay(null); force(); }
          return;
        }
        if (combatRef.current) {
          if (k === "1") onCombatAction({ kind: "attack" });
          else if (k === "2") onCombatAction({ kind: "skill" });
          else if (k === "3") onCombatAction({ kind: "potion", which: "血瓶" });
          else if (k === "4") onCombatAction({ kind: "potion", which: "蓝瓶" });
          return;
        }
        if (k === "e" || k === " ") onInteract();
        else if (k === "i") { setOverlay("inv"); force(); }
        else if (k === "k") { setOverlay("skill"); force(); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = DIR_KEYS[e.key.toLowerCase()];
      if (dir) keysDown.current.delete(dir);
    };
    const onBlur = () => keysDown.current.clear();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    // 按住持续走: 轮询按键集合, 斜向时先试主轴再退副轴
    const timer = window.setInterval(() => {
      if (scene !== "play" || combatRef.current || overlay) return;
      const dir = keysDown.current;
      const dx = (dir.has("d") ? 1 : 0) - (dir.has("a") ? 1 : 0);
      const dy = (dir.has("s") ? 1 : 0) - (dir.has("w") ? 1 : 0);
      if (!dx && !dy) return;
      const now = performance.now();
      if (now - lastMoveAt.current < 130) return;
      lastMoveAt.current = now;
      if (dx && dy) {
        faceDir(dx);
        const r = tryMovePlayer(mapRef.current!, dx, 0);
        if (typeof r === "object") { startCombatWith(r.combat); return; }
        if (r === "moved") { afterPlayerAct(); return; }
        // 主轴被挡, 试副轴
        const r2 = tryMovePlayer(mapRef.current!, 0, dy);
        if (typeof r2 === "object") { startCombatWith(r2.combat); return; }
        if (r2 === "blocked") return;
        afterPlayerAct();
      } else {
        onMove(dx, dy);
      }
    }, 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.clearInterval(timer);
    };
  });

  // ---------------- 绘制 ----------------
  const drawRef = useRef<(ctx: CanvasRenderingContext2D, dt: number) => void>(() => {});
  drawRef.current = (ctx, dt) => {
    const map = mapRef.current;
    const p = playerRef.current;
    if (!map || !p) return;
    if (combatRef.current) {
      renderCombat(ctx, combatRef.current, p, spriteKeyRef.current, p.hp, p.mp, maxHp(p), p.maxMp, dt);
    } else {
      renderDungeon(ctx, map, p, spriteKeyRef.current, dt);
    }
  };

  // ---------------- 渲染 ----------------
  if (scene === "title") {
    const d = loadGame();
    return (
      <div className="game-wrap">
        <TitleScreen
          hasSave={!!d}
          saveInfo={d ? `${d.player.cls} Lv${d.player.level} · 第${d.floor}层` : ""}
          onContinue={continueRun}
          onNew={startNewRun}
        />
      </div>
    );
  }

  if (scene === "create") {
    return (
      <div className="game-wrap">
        <CreateScreen classes={CLASSES} onPick={beginRun} />
      </div>
    );
  }

  if (scene === "dead") {
    const p = playerRef.current;
    if (!p) { setScene("title"); return null; }
    const best = [...Object.values(p.equip), ...p.bag]
      .filter((e): e is Equipment => !!e)
      .sort((a, b) => b.value - a.value)[0] ?? null;
    return (
      <div className="game-wrap">
        <DeadScreen
          player={p}
          floor={floorRef.current}
          best={best}
          onRetry={startNewRun}
          onTitle={() => { playerRef.current = null; setScene("title"); }}
        />
      </div>
    );
  }

  // play
  const p = playerRef.current!;
  const map = mapRef.current!;
  const combat = combatRef.current;
  const o = merchantRef.current;
  const boss = combat?.monsters.find((m) => m.hp > 0);
  return (
    <div className="game-wrap">
      <div className="hud-top">
        <span className="hud-floor">
          第 {floorRef.current} 层
          {isBossFloor(floorRef.current) && <span className="hp-color"> · 首领!</span>}
          {map.isCamp && <span className="heal"> · 营地</span>}
        </span>
        <div className="grow" style={{ textAlign: "center" }}>
          {combat && boss ? (
            <>
              <BossBar name={`${boss.name}  ·  ${combat.round + 1}回合`} hp={boss.hp} maxHp={boss.maxHp} />
            </>
          ) : (
            <span className="dim" style={{ fontSize: 12 }}>
              <span className="kbd">WASD</span> 移动 · <span className="kbd">E</span> 交互 · <span className="kbd">I</span> 背包
              {p.level < recLevel(floorRef.current) && <span className="hp-color"> · 等级低于建议值, 小心!</span>}
            </span>
          )}
        </div>
        {IS_TOUCH && (
          <button
            className="fs-btn"
            title="全屏"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen?.().catch(() => {});
            }}
          >⛶</button>
        )}
        <Minimap map={map} />
      </div>
      <GameCanvas width={CANVAS_W} height={CANVAS_H} drawRef={drawRef} adaptive={IS_TOUCH} />
      <div className="hud-bottom">
        <Orb value={p.hp} max={maxHp(p)} color="linear-gradient(#ff7a6b, #c22323)" glow="#ff4b4b" />
        <ActionBar player={p} inCombat={!!combat} onAction={onCombatAction} />
        <Orb value={p.mp} max={p.maxMp} color="linear-gradient(#5b9cff, #1c3f9a)" glow="#5b9cff" />
      </div>
      <LogPanel log={combat ? combat.log : dungeonLogRef.current} />

      {overlay === "inv" && (
        <InventoryPanel
          player={p}
          onWear={wearFromBag}
          onDrop={dropFromBag}
          onSpendStat={onSpendStat}
          onOpenSkillTree={() => { setOverlay("skill"); force(); }}
          onClose={() => { setOverlay(null); force(); }}
        />
      )}
      {overlay === "skill" && (
        <SkillTreePanel
          player={p}
          onLearn={onLearnSkill}
          onClose={() => { setOverlay(null); force(); }}
        />
      )}
      {overlay === "merchant" && o && (
        <MerchantPanel
          player={p}
          offer={o}
          onBuyPotion={buyPotion}
          onBuyMana={buyMana}
          onBuyEq={buyEq}
          onSellAll={sellAll}
          onClose={() => { setOverlay(null); merchantRef.current = null; force(); }}
        />
      )}
      {overlay === "portal" && (
        <PortalPanel onGo={portalGo} onClose={() => { setOverlay(null); force(); }} />
      )}
      {overlay === "loot" && lootQueueRef.current[0] && (
        <LootPanel
          eq={lootQueueRef.current[0]}
          bagFull={p.bag.length >= 10}
          onTake={takeLoot}
          onSkip={skipLoot}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
      <TouchControls
        keysDown={keysDown}
        onInteract={onInteract}
        onToggleInv={() => { setOverlay(overlay === "inv" ? null : "inv"); force(); }}
        onToggleSkill={() => { setOverlay(overlay === "skill" ? null : "skill"); force(); }}
      />
    </div>
  );
}
