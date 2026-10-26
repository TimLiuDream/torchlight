import { useEffect, useRef } from "react";
import { affixText } from "../game/player";
import { sprite } from "../render/sprites";
import type { ClassDef, CombatState, Equipment, LogLine, PlayerState } from "../game/types";

// ---------------- 基础 ----------------
export function Bar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%`, background: color }} />
    </div>
  );
}

export function SpriteView({ spriteKey, scale = 4 }: { spriteKey: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(sprite(spriteKey), 0, 0, cv.width, cv.height);
  }, [spriteKey]);
  return <canvas ref={ref} className="pixel" width={12} height={12} style={{ width: 12 * scale, height: 12 * scale }} />;
}

/** rAF 绘制循环容器。drawRef 指向最新绘制函数, 避免每帧重挂 effect。 */
export function GameCanvas({ width, height, drawRef }: {
  width: number;
  height: number;
  drawRef: React.MutableRefObject<(ctx: CanvasRenderingContext2D, dt: number) => void>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cv = ref.current;
      if (cv) {
        const ctx = cv.getContext("2d")!;
        drawRef.current(ctx, dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drawRef]);
  return <canvas ref={ref} className="pixel" width={width} height={height} />;
}

// ---------------- 面板 ----------------
export function StatusHud({ player }: { player: PlayerState }) {
  return (
    <div className="panel hud-status">
      <span className="hp-color">❤ {player.hp}/{maxHpOf(player)}</span>
      <span className="mp-color">✦ {player.mp}/{player.maxMp}</span>
      <span>⚔ {atkOf(player)}</span>
      <span>暴击 {critOf(player)}%</span>
      <span>Lv{player.level}</span>
      <span className="gold">金币 {player.gold}</span>
      <span>[血瓶×{player.potions["血瓶"]} 蓝瓶×{player.potions["蓝瓶"]}]</span>
    </div>
  );
}
// 避免循环 import: HUD 的属性计算内联(公式与 player.ts 一致)
function maxHpOf(p: PlayerState) {
  let s = 0;
  for (const e of Object.values(p.equip)) if (e) s += e.hp;
  return Math.floor(p.baseHp * (1 + (p.level - 1) * 0.15)) + s;
}
function atkOf(p: PlayerState) {
  let s = 0;
  for (const e of Object.values(p.equip)) if (e) s += e.atk;
  return Math.floor(p.baseAtk * (1 + (p.level - 1) * 0.12)) + s;
}
function critOf(p: PlayerState) {
  let s = 5;
  for (const e of Object.values(p.equip)) if (e) s += e.crit;
  return s;
}

export function LogPanel({ log }: { log: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);
  const visible = log.slice(-40);
  return (
    <div className="panel">
      <div className="log" ref={ref}>
        {visible.map((l, i) => <div key={i} className={l.kind}>{l.text}</div>)}
      </div>
    </div>
  );
}

export function EquipLine({ eq }: { eq: Equipment }) {
  return (
    <span className={`r-${rarityClass(eq.rarity)}`}>
      [{eq.rarity}]{eq.name}
      <span className="dim"> ({affixText(eq)})</span>
    </span>
  );
}
const rarityClass = (r: string) =>
  r === "传说" ? "legend" : r === "稀有" ? "rare" : r === "魔法" ? "magic" : "normal";

// ---------------- 背包 ----------------
export function InventoryPanel({ player, onWear, onDrop, onClose }: {
  player: PlayerState;
  onWear: (eq: Equipment) => void;
  onDrop: (eq: Equipment) => void;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <h3>背包 {player.bag.length}/10</h3>
      {(["武器", "护甲", "饰品"] as const).map((slot) => (
        <div className="item-line" key={slot}>
          <span className="dim">已穿[{slot}]:</span>{" "}
          {player.equip[slot] ? <EquipLine eq={player.equip[slot]!} /> : <span className="dim">(空)</span>}
        </div>
      ))}
      <hr style={{ border: "none", borderTop: `1px solid var(--line)`, margin: "8px 0" }} />
      {player.bag.length === 0 && <div className="dim">背包是空的。</div>}
      {player.bag.map((eq, i) => (
        <div className="item-line" key={i}>
          <button onClick={() => onWear(eq)}>穿</button>
          <button onClick={() => onDrop(eq)}>丢</button>
          <EquipLine eq={eq} />
        </div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={onClose}>关闭 (I)</button>
      </div>
    </Overlay>
  );
}

// ---------------- 商店 ----------------
export interface MerchantOffer {
  kind: "camp" | "wander";
  potionPrice: number;
  manaPrice: number;
  potionCount: number;
  manaCount: number;
  eq: Equipment;
  eqPrice: number;
}

export function MerchantPanel({ player, offer, onBuyPotion, onBuyMana, onBuyEq, onSellAll, onClose }: {
  player: PlayerState;
  offer: MerchantOffer;
  onBuyPotion: () => void;
  onBuyMana: () => void;
  onBuyEq: () => void;
  onSellAll: () => void;
  onClose: () => void;
}) {
  const sold = offer.kind === "camp";
  return (
    <Overlay onClose={onClose}>
      <h3>{sold ? "营地商人" : "披着斗篷的流浪商人"}</h3>
      <div className="dim" style={{ marginBottom: 8 }}>
        {sold ? "'补给充足, 看看货?'" : "'看看货? 价格公道。'"} 金币 {player.gold}
      </div>
      <div className="item-line">
        <button onClick={onBuyEq} disabled={player.gold < offer.eqPrice || player.bag.length >= 10}>买</button>
        <EquipLine eq={offer.eq} /> —— {offer.eqPrice}金
      </div>
      <div className="item-line">
        <button onClick={onBuyPotion} disabled={player.gold < offer.potionPrice}>买</button>
        血瓶×{offer.potionCount} —— {offer.potionPrice}金
      </div>
      <div className="item-line">
        <button onClick={onBuyMana} disabled={player.gold < offer.manaPrice}>买</button>
        蓝瓶×{offer.manaCount} —— {offer.manaPrice}金
      </div>
      <div className="item-line">
        <button onClick={onSellAll} disabled={player.bag.length === 0}>卖</button>
        <span className="dim">把背包装备全部卖掉 (价值 {player.bag.reduce((s, e) => s + e.value, 0)} 金)</span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={onClose}>离开 (Esc)</button>
      </div>
    </Overlay>
  );
}

// ---------------- 传送 ----------------
export function PortalPanel({ onGo, onClose }: { onGo: (floor: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Overlay onClose={onClose}>
      <h3>传送门</h3>
      <div className="dim" style={{ marginBottom: 8 }}>跳到第几层? (1~999, 单向有去无回)</div>
      <div className="row">
        <input
          ref={ref}
          type="number"
          min={1}
          max={999}
          style={{
            background: "var(--panel2)", border: "2px solid var(--line2)", color: "var(--text)",
            font: "inherit", padding: "4px 8px", width: 100,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = Number(ref.current?.value);
              if (v >= 1 && v <= 999) onGo(v);
            }
          }}
        />
        <button className="primary" onClick={() => {
          const v = Number(ref.current?.value);
          if (v >= 1 && v <= 999) onGo(v);
        }}>传送</button>
        <button onClick={onClose}>取消 (Esc)</button>
      </div>
    </Overlay>
  );
}

// ---------------- 掉落 ----------------
export function LootPanel({ eq, bagFull, onTake, onSkip }: {
  eq: Equipment;
  bagFull: boolean;
  onTake: () => void;
  onSkip: () => void;
}) {
  return (
    <Overlay onClose={onSkip}>
      <h3>掉落装备</h3>
      <div className="item-line" style={{ margin: "8px 0", fontSize: 15 }}>
        <EquipLine eq={eq} />
        <span className="dim"> 价值 {eq.value} 金</span>
      </div>
      {bagFull && <div className="dim">背包已满, 只能放弃。</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={onTake} disabled={bagFull}>拾取 (Y)</button>
        <button onClick={onSkip}>放弃 (Esc)</button>
      </div>
    </Overlay>
  );
}

// ---------------- 场景屏 ----------------
export function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="overlay-backdrop" onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}>
      <div className="overlay-panel">{children}</div>
    </div>
  );
}

export function TitleScreen({ hasSave, saveInfo, onContinue, onNew }: {
  hasSave: boolean;
  saveInfo: string;
  onContinue: () => void;
  onNew: () => void;
}) {
  return (
    <div className="title-screen">
      <h1>火 炬 之 光</h1>
      <div className="dim" style={{ marginBottom: 24 }}>像素版 · 暗黑系刷宝 roguelite · 下潜越深, 怪越强, 掉落越好</div>
      <div className="row" style={{ justifyContent: "center", gap: 12 }}>
        {hasSave && <button className="primary" onClick={onContinue}>继续冒险 ({saveInfo})</button>}
        <button onClick={onNew} className={hasSave ? "" : "primary"}>新的冒险</button>
      </div>
      <div className="dim" style={{ marginTop: 30, fontSize: 12 }}>
        <span className="kbd">WASD/方向键</span> 移动 · <span className="kbd">E</span> 交互 · <span className="kbd">I</span> 背包 · <span className="kbd">1-4</span> 战斗行动
      </div>
    </div>
  );
}

export function CreateScreen({ classes, onPick }: { classes: Record<string, ClassDef>; onPick: (key: string) => void }) {
  return (
    <div className="title-screen">
      <h1 style={{ fontSize: 22, letterSpacing: 4 }}>选择你的职业</h1>
      <div className="row" style={{ justifyContent: "center", gap: 14, marginTop: 20, alignItems: "stretch" }}>
        {Object.entries(classes).map(([key, c]) => (
          <div key={key} className="class-card" onClick={() => onPick(key)}>
            <SpriteView spriteKey={c.sprite} scale={6} />
            <div style={{ color: "var(--gold)", fontSize: 16 }}>[{key}] {c.name}</div>
            <div className="dim">❤{c.hp} ⚔{c.atk} ✦{c.mp}</div>
            <div style={{ marginTop: 6 }}>
              技能: <span className="heal">{c.skill.name}</span>({c.skill.cost}蓝)
              <div className="dim" style={{ fontSize: 12 }}>{c.skill.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeadScreen({ player, floor, best, onRetry, onTitle }: {
  player: PlayerState;
  floor: number;
  best: Equipment | null;
  onRetry: () => void;
  onTitle: () => void;
}) {
  return (
    <div className="dead-screen">
      <h1>════ 你倒在了第 {floor} 层 ════</h1>
      <div style={{ margin: "14px 0", fontSize: 15 }}>
        职业: {player.cls} · 等级: {player.level} · 击杀: {player.kills} 只怪物
      </div>
      <div style={{ marginBottom: 8 }}>
        金币: {player.gold} · 遗物: {best ? <EquipLine eq={best} /> : <span className="dim">无</span>}
      </div>
      <div className="dim" style={{ marginBottom: 24 }}>存档已抹去, roguelite 规矩。</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="primary" onClick={onRetry}>再来一局</button>
        <button onClick={onTitle}>回到标题</button>
      </div>
    </div>
  );
}

// ---------------- 战斗 ----------------
export function CombatMenu({ player, onAction }: {
  player: PlayerState;
  onAction: (a: { kind: "attack" } | { kind: "skill" } | { kind: "potion"; which: "血瓶" | "蓝瓶" }) => void;
}) {
  return (
    <div className="action-menu">
      <button onClick={() => onAction({ kind: "attack" })}>[1] 普攻</button>
      <button onClick={() => onAction({ kind: "skill" })}>
        [2] {player.skill.name} ({player.skill.cost}蓝)
      </button>
      <button onClick={() => onAction({ kind: "potion", which: "血瓶" })} disabled={player.potions["血瓶"] <= 0}>
        [3] 血瓶 ×{player.potions["血瓶"]}
      </button>
      <button onClick={() => onAction({ kind: "potion", which: "蓝瓶" })} disabled={player.potions["蓝瓶"] <= 0}>
        [4] 蓝瓶 ×{player.potions["蓝瓶"]}
      </button>
    </div>
  );
}

export function CombatStatus({ state }: { state: CombatState }) {
  const phaseText =
    state.phase === "player" ? "你的回合" :
    state.phase === "enemy" ? "敌方行动中…" :
    state.phase === "won" ? "战斗胜利!" : "你倒下了…";
  return (
    <span>
      第 {state.round + 1} 回合 · <span style={{ color: state.phase === "player" ? "var(--gold)" : "var(--dim)" }}>{phaseText}</span>
    </span>
  );
}
