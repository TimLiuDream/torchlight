import { useEffect, useRef, useState } from "react";
import { affixText, maxHp, playerAtk, playerCrit, playerLeech, playerRegen, setBonuses } from "../game/player";
import { SETS, SKILL_TREES, STAT_BONUS } from "../game/data";
import { sprite, hero24Frame } from "../render/sprites";
import { tex, texReady, frame } from "../render/atlas";
import type { ClassDef, CombatState, Equipment, LogLine, PlayerState, SkillNode, StatKey } from "../game/types";

// 职业精灵 -> 24x24 建模帧
const HERO_FRAME: Record<string, string> = {
  hero_mage: "hero_mage",
  hero_berserker: "hero_berserker",
  hero_engineer: "hero_engineer",
};

/** 标题画面动态地牢横幅: 0x72 墙面/火把/怪物/走动的主角 */
export function TitleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let cancelled = false;
    const T = 48;
    const COLS = 19;
    const ROWS = 4;
    const draw = (now: number) => {
      if (cancelled) return;
      const t = now / 1000;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#08060e";
      ctx.fillRect(0, 0, cv.width, cv.height);
      // 顶排墙顶 + 立面排 + 两行地板
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const sx = x * T;
          const sy = y * T;
          const wallTop = tex("wall_top_mid");
          const wallFace = tex("wall_mid");
          const floor = tex(`floor_${1 + ((x * 7 + y * 13) % 8)}`);
          if (y === 0 && wallTop) ctx.drawImage(wallTop, sx, sy, T, T);
          else if (y === 1 && wallFace) ctx.drawImage(wallFace, sx, sy, T, T);
          else if (y >= 2 && floor) ctx.drawImage(floor, sx, sy, T, T);
        }
      }
      // 火把与旗子
      for (const x of [1, 5, 9, 13, 17]) {
        const cx = x * T + T / 2;
        ctx.fillStyle = "#5a3a1e";
        ctx.fillRect(cx - 1, T + 6, 3, 8);
        const sway = Math.sin(t * 6 + x) * 1.2;
        ctx.fillStyle = "#ff6b2e";
        ctx.fillRect(cx - 2 + sway * 0.5, T, 5, 6);
        ctx.fillStyle = "#ffa03e";
        ctx.fillRect(cx - 1 + sway * 0.7, T + 1, 4, 4);
        ctx.fillStyle = "#fff8d8";
        ctx.fillRect(cx + sway, T + 2, 2, 3);
      }
      for (const x of [3, 11, 15]) {
        const img = tex(x === 11 ? "wall_banner_red" : "wall_banner_blue");
        if (img) ctx.drawImage(img, x * T + T / 2 - 12, T + 8, 24, 24);
      }
      // 怪物(两侧 idle)
      for (const [name, bx] of [["skelet_idle", 2.5], ["goblin_idle", 6.5], ["masked_orc_idle", 12.5], ["muddy_idle", 16.5]] as const) {
        const img = frame(name, Math.floor(t * 5) % 4);
        if (img) {
          const w = img.width * 3;
          const h = img.height * 3;
          ctx.drawImage(img, bx * T - w / 2, 3 * T + T - h + 8, w, h);
        }
      }
      // 主角往返走动
      const span = (COLS - 4) * T;
      const px = 2.5 * T + ((t * 46) % span);
      const dir = Math.floor((t * 46) / span) % 2 === 0 ? 1 : -1;
      const run = frame(dir === 1 ? "wizzard_m_run" : "wizzard_m_run", Math.floor(t * 8) % 4);
      const idle = frame("wizzard_m_idle", Math.floor(t * 5) % 4);
      const img = run ?? idle;
      if (img) {
        const w = img.width * 3;
        const h = img.height * 3;
        ctx.save();
        ctx.translate(px, 3 * T + T + 8);
        ctx.scale(dir, 1);
        ctx.drawImage(img, -w / 2, -h, w, h);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    let started = false;
    const start = () => { if (!started && !cancelled) { started = true; raf = requestAnimationFrame(draw); } };
    start();
    texReady.then(start);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={ref} className="pixel" width={19 * 48} height={4 * 48} style={{ width: "100%", imageRendering: "pixelated" }} />;
}

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
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const cv = ref.current;
      if (!cv) return;
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const heroKey = HERO_FRAME[spriteKey];
      if (heroKey) {
        ctx.drawImage(hero24Frame(heroKey, 0), 0, 0, cv.width, cv.height);
      } else {
        ctx.drawImage(sprite(spriteKey), 0, 0, cv.width, cv.height);
      }
    };
    draw();
    texReady.then(draw);
    return () => { alive = false; };
  }, [spriteKey]);
  return <canvas ref={ref} className="pixel" width={24} height={24} style={{ width: 24 * scale, height: 24 * scale }} />;
}

/** rAF 绘制循环容器。adaptive=true 时画布内部分辨率跟随容器尺寸(移动端),
 *  否则固定 width×height(桌面 800x450)。drawRef 指向最新绘制函数, 避免每帧重挂 effect。 */
export function GameCanvas({ width, height, drawRef, adaptive }: {
  width: number;
  height: number;
  drawRef: React.MutableRefObject<(ctx: CanvasRenderingContext2D, dt: number) => void>;
  adaptive?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!adaptive) return;
    const box = boxRef.current;
    const cv = ref.current;
    if (!box || !cv) return;
    const apply = () => {
      const r = box.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) {
        cv.width = Math.round(r.width);
        cv.height = Math.round(r.height);
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    return () => ro.disconnect();
  }, [adaptive]);
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
  return (
    <div className={"canvas-box" + (adaptive ? " adaptive" : "")} ref={boxRef}>
      <canvas ref={ref} className="pixel" width={width} height={height} />
    </div>
  );
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
    <div className="panel log-panel">
      <div className="log" ref={ref}>
        {visible.map((l, i) => <div key={i} className={l.kind}>{l.text}</div>)}
      </div>
    </div>
  );
}

export function EquipLine({ eq }: { eq: Equipment }) {
  const setName = eq.setId ? SETS[eq.setId]?.name : null;
  return (
    <span className={`r-${rarityClass(eq.rarity)}`}>
      [{eq.rarity}]{eq.name}
      <span className="dim"> ({eq.slot}·{eq.kind}, {affixText(eq)})</span>
      {setName && <span className="set-name"> 〔套装:{setName}〕</span>}
    </span>
  );
}
const rarityClass = (r: string) =>
  r === "传说" ? "legend" : r === "稀有" ? "rare" : r === "魔法" ? "magic" : "normal";

// ---------------- 背包 ----------------
const STAT_NAMES: Record<StatKey, string> = { str: "力量", vit: "体力", mag: "魔力", agi: "敏捷" };
const STAT_DESC: Record<StatKey, string> = {
  str: `攻击 +${STAT_BONUS.str.atk}/点`,
  vit: `生命 +${STAT_BONUS.vit.hp}/点`,
  mag: `法力 +${STAT_BONUS.mag.mp}/点`,
  agi: `暴击 +${STAT_BONUS.agi.crit}%/点`,
};

export function InventoryPanel({ player, onWear, onDrop, onSpendStat, onOpenSkillTree, onClose }: {
  player: PlayerState;
  onWear: (eq: Equipment) => void;
  onDrop: (eq: Equipment) => void;
  onSpendStat: (key: StatKey) => void;
  onOpenSkillTree: () => void;
  onClose: () => void;
}) {
  const sets = setBonuses(player);
  return (
    <Overlay onClose={onClose}>
      <h3>背包 {player.bag.length}/10</h3>

      <div className="stat-block">
        <div className="row">
          <strong className="gold">属性点 {player.statPoints}</strong>
          <button className="stat-tree-btn" onClick={onOpenSkillTree}>技能树 (K)</button>
          <span className="dim" style={{ fontSize: 12 }}>技能点 {player.skillPoints}</span>
        </div>
        {(["str", "vit", "mag", "agi"] as const).map((key) => (
          <div className="item-line stat-line" key={key}>
            <button
              onClick={() => onSpendStat(key)}
              disabled={player.statPoints <= 0}
              title={STAT_DESC[key]}
            >+</button>
            <span>{STAT_NAMES[key]} <strong>{player.stats[key]}</strong></span>
            <span className="dim" style={{ fontSize: 11 }}>{STAT_DESC[key]}</span>
          </div>
        ))}
        <div className="dim" style={{ fontSize: 12 }}>
          攻击 {playerAtk(player)} · 生命 {maxHp(player)} · 暴击 {playerCrit(player)}% · 吸血 {playerLeech(player)}% · 回蓝 {playerRegen(player)}
        </div>
      </div>

      {sets.lines.length > 0 && (
        <div className="set-block">
          {sets.lines.map((l) => (
            <div key={l.name} className="item-line">
              <span className="set-name">〔{l.name} {l.count}/{l.need}〕</span>
              <span className="dim" style={{ fontSize: 12 }}>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      <hr style={{ border: "none", borderTop: `1px solid var(--line)`, margin: "8px 0" }} />
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

// ---------------- 技能树 ----------------
export function SkillTreePanel({ player, onLearn, onClose }: {
  player: PlayerState;
  onLearn: (node: SkillNode) => void;
  onClose: () => void;
}) {
  const [, force] = useState(0);
  const tree = SKILL_TREES[player.cls] ?? [];
  const tiers: Array<typeof tree> = [[], [], []];
  for (const n of tree) tiers[n.tier - 1].push(n);
  const unlocked = (tier: number) => tier === 1 || player.learned.some((id) => tree.find((n) => n.id === id)?.tier === tier - 1);
  return (
    <Overlay onClose={onClose}>
      <h3>技能树 · {player.cls}</h3>
      <div className="dim" style={{ marginBottom: 8 }}>
        技能点 <span className="gold">{player.skillPoints}</span> · 学习下层需先学上层至少 1 项
      </div>
      {tiers.map((nodes, i) => (
        <div key={i} className="tier-block">
          <div className="dim" style={{ fontSize: 12, margin: "4px 0" }}>— 第 {i + 1} 层 —</div>
          <div className="skill-grid">
            {nodes.map((node) => {
              const learned = player.learned.includes(node.id);
              const canLearn = !learned && unlocked(node.tier) && player.skillPoints >= node.cost;
              return (
                <div key={node.id} className={`skill-card ${learned ? "learned" : canLearn ? "can" : "locked"}`}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{node.name}</strong>
                    <span className="dim" style={{ fontSize: 11 }}>{node.type === "active" ? "主动" : "被动"} · {node.cost}点</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>{node.desc}</div>
                  {!learned && (
                    <button
                      className="primary"
                      disabled={!canLearn}
                      onClick={() => { onLearn(node); force((x) => x + 1); }}
                      style={{ marginTop: 6, width: "100%" }}
                    >
                      {learned ? "已学习" : unlocked(node.tier) ? (canLearn ? "学习" : "技能点不足") : "需先学上层"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={onClose}>关闭 (Esc)</button>
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
      <div className="dim" style={{ marginBottom: 16 }}>像素版 · 暗黑系刷宝 roguelite · 下潜越深, 怪越强, 掉落越好</div>
      <div className="title-backdrop">
        <TitleBackdrop />
      </div>
      <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 16 }}>
        {hasSave && <button className="primary" onClick={onContinue}>继续冒险 ({saveInfo})</button>}
        <button onClick={onNew} className={hasSave ? "" : "primary"}>新的冒险</button>
      </div>
      <div className="dim" style={{ marginTop: 24, fontSize: 12 }}>
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
