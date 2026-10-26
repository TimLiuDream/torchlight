import { useEffect, useReducer, useRef, useState } from "react";
import { CLASSES, EMPTY_LINES } from "./game/data";
import { makeElite, maxHp, playerAtk, recLevel, rollEquipment } from "./game/player";
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
import type { CombatState, Equipment, FloorMap, LogLine, Monster, PlayerState } from "./game/types";
import { renderCombat, renderDungeon } from "./render/renderer";
import {
  CombatMenu, CombatStatus, CreateScreen, DeadScreen, GameCanvas,
  InventoryPanel, LootPanel, LogPanel, MerchantPanel, MerchantOffer, PortalPanel, StatusHud, TitleScreen,
} from "./ui/components";

type Scene = "title" | "create" | "play" | "dead";
type OverlayKind = "inv" | "merchant" | "portal" | "loot" | null;

// playerAction/enemyTurn 会就地修改 state.phase, TS 的属性收窄看不到 mutation,
// 经由函数返回值重新读取以获得联合类型。
const phaseOf = (s: CombatState) => s.phase;

const CANVAS_W = 640;
const CANVAS_H = 416;

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
    const p: PlayerState = {
      cls: cls.name, baseHp: cls.hp, baseAtk: cls.atk, maxMp: cls.mp,
      skill: { ...cls.skill }, level: 1, exp: 0, hp: cls.hp, mp: cls.mp,
      equip: { 武器: null, 护甲: null, 饰品: null },
      bag: [], gold: 30, potions: { 血瓶: 2, 蓝瓶: 1 }, kills: 0, restUsed: false,
    };
    playerRef.current = p;
    spriteKeyRef.current = cls.sprite;
    floorRef.current = 1;
    rngRef.current = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
    mapRef.current = generateFloor(rngRef.current, 1);
    dungeonLogRef.current = [{ text: `你踏入了地牢。第 1 层, 建议 Lv${recLevel(1)}。`, kind: "info" }];
    clearSave();
    persist();
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
    const cls = Object.values(CLASSES).find((c) => c.name === d.player.cls);
    spriteKeyRef.current = cls?.sprite ?? "hero_mage";
    dungeonLogRef.current = [{ text: `读档: ${d.player.cls} Lv${d.player.level}, 第 ${d.floor} 层。`, kind: "info" }];
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
    mapRef.current = generateFloor(rngRef.current, floor);
    const bossTag = isBossFloor(floor) ? " · 首领出没!" : "";
    dlog(`—— 第 ${floor} 层 · 建议 Lv${recLevel(floor)}${bossTag}`, "loot");
    if (p.level < recLevel(floor)) dlog("! 你的等级低于建议值, 小心行事。", "damage");
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
    if (res.levels > 0) showToast(`✦ 升级! 等级 ${p.level}, 生命法力全满。`);
    persist();
    if (res.drops.length) setOverlay("loot");
    force();
  };

  const onCombatAction = (action: Action) => {
    const state = combatRef.current;
    const p = playerRef.current;
    if (!state || !p || state.phase !== "player") return;
    const consumed = playerAction(state, p, rngRef.current, action);
    if (!consumed) { force(); return; }
    if (phaseOf(state) === "won") { finishCombat(); return; }
    if (phaseOf(state) === "lost") { die(); return; }
    // 敌方回合(稍作停顿再结算, 给演出留时间)
    force();
    enemyTimerRef.current = window.setTimeout(() => {
      const s = combatRef.current;
      if (!s) return;
      const alive = enemyTurn(s, p, rngRef.current);
      if (!alive) { die(); return; }
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
    } else if (r < 0.84) {
      dlog("箱底垫着一件装备……", "loot");
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
    persist();
    force();
  };

  const restAtFire = () => {
    const p = playerRef.current!;
    if (p.restUsed) { dlog("这次营地的火已经烤过一遍了。", "info"); force(); return; }
    p.restUsed = true;
    p.hp = Math.min(maxHp(p), p.hp + Math.floor(maxHp(p) * 0.6));
    p.mp = Math.min(p.maxMp, p.mp + Math.floor(p.maxMp * 0.6));
    dlog("在篝火边休息片刻…… 生命法力大幅恢复。", "heal");
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (scene === "play") {
        if (overlay === "loot") {
          if (k === "y") takeLoot();
          else if (k === "escape") skipLoot();
          return;
        }
        if (overlay === "merchant") { if (k === "escape") { setOverlay(null); force(); } return; }
        if (overlay === "portal") { if (k === "escape") { setOverlay(null); force(); } return; }
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
        if (k === "w" || k === "arrowup") onMove(0, -1);
        else if (k === "s" || k === "arrowdown") onMove(0, 1);
        else if (k === "a" || k === "arrowleft") onMove(-1, 0);
        else if (k === "d" || k === "arrowright") onMove(1, 0);
        else if (k === "e" || k === " ") onInteract();
        else if (k === "i") { setOverlay("inv"); force(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------- 绘制 ----------------
  const drawRef = useRef<(ctx: CanvasRenderingContext2D, dt: number) => void>(() => {});
  drawRef.current = (ctx, dt) => {
    const map = mapRef.current;
    const p = playerRef.current;
    if (!map || !p) return;
    if (combatRef.current) {
      const s = combatRef.current;
      renderCombat(ctx, s, p, spriteKeyRef.current, p.hp, p.mp, maxHp(p), p.maxMp, dt);
    } else {
      renderDungeon(ctx, map, p, spriteKeyRef.current);
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
  return (
    <div className="game-wrap">
      <StatusHud player={p} />
      <GameCanvas width={CANVAS_W} height={CANVAS_H} drawRef={drawRef} />
      {combat ? (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <CombatStatus state={combat} />
            <span className="dim">
              ❤{p.hp}/{maxHp(p)} ✦{p.mp}/{p.maxMp} ⚔{playerAtk(p)}
            </span>
          </div>
          <CombatMenu player={p} onAction={onCombatAction} />
          <div style={{ height: 8 }} />
          <LogPanel log={combat.log} />
        </div>
      ) : (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>
              <span className="gold">—— 第 {floorRef.current} 层</span>
              {" · "}建议 Lv{recLevel(floorRef.current)}
              {isBossFloor(floorRef.current) && <span className="hp-color"> · 首领出没!</span>}
              {map.isCamp && <span className="heal"> · 篝火营地</span>}
            </span>
            <span className="dim">
              <span className="kbd">WASD</span> 移动 <span className="kbd">E</span> 交互 <span className="kbd">I</span> 背包
            </span>
          </div>
          <div style={{ height: 8 }} />
          <LogPanel log={dungeonLogRef.current} />
        </div>
      )}

      {overlay === "inv" && (
        <InventoryPanel
          player={p}
          onWear={wearFromBag}
          onDrop={dropFromBag}
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
    </div>
  );
}
