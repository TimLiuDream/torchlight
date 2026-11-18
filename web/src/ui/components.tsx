import { useEffect, useRef, useState } from "react";
import { affixText, maxHp, playerAtk, playerCrit, playerLeech, playerRegen, setBonuses } from "../game/player";
import { SETS, SKILL_TREES, STAT_BONUS } from "../game/data";
import { hdUrl, onHdReady } from "../render/hdAssets";
import type { LogicalCanvas } from "../render/renderer";
import type { ClassDef, Equipment, LogLine, PlayerState, SkillNode, Slot, StatKey } from "../game/types";
import { ActionIcon, ItemIconBox, StatBadge } from "./Icons";

const CLASS_META: Record<string, { role: string; aura: string }> = {
  灰烬法师: { role: "远程毁灭法术 · 元素爆发", aura: "radial-gradient(circle at 50% 42%, rgba(168,85,247,0.34), rgba(255,107,43,0.14) 48%, transparent 75%)" },
  狂战士: { role: "重甲狂怒近战 · 刀刀烈暴", aura: "radial-gradient(circle at 50% 42%, rgba(239,68,68,0.34), rgba(212,164,76,0.12) 48%, transparent 75%)" },
  工程师: { role: "蒸汽重锤战技 · 机械续航", aura: "radial-gradient(circle at 50% 42%, rgba(56,189,248,0.32), rgba(52,211,153,0.14) 48%, transparent 75%)" },
};

/** Retina 高分屏自适应 rAF 画布容器 */
export function GameCanvas({ width, height, drawRef, adaptive }: {
  width: number;
  height: number;
  drawRef: React.MutableRefObject<(ctx: CanvasRenderingContext2D, dt: number) => void>;
  adaptive?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: width, h: height });

  useEffect(() => {
    const cv = ref.current as LogicalCanvas | null;
    const box = boxRef.current;
    if (!cv) return;

    const syncBuffer = (lw: number, lh: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: lw, h: lh };
      cv.__logicalW = lw;
      cv.__logicalH = lh;
      const pw = Math.max(1, Math.round(lw * dpr));
      const ph = Math.max(1, Math.round(lh * dpr));
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
    };

    if (!adaptive) {
      syncBuffer(width, height);
      return;
    }
    if (!box) return;
    const apply = () => {
      const r = box.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) {
        syncBuffer(Math.round(r.width), Math.round(r.height));
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    return () => ro.disconnect();
  }, [adaptive, width, height]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cv = ref.current as LogicalCanvas | null;
      if (cv) {
        const dpr = cv.width / Math.max(1, sizeRef.current.w);
        const ctx = cv.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawRef.current(ctx, dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drawRef]);

  return (
    <div className={"canvas-box" + (adaptive ? " adaptive" : "")} ref={boxRef}>
      <canvas ref={ref} className="hd-canvas" />
    </div>
  );
}

// ---------------- 日志面板 ----------------
export function LogPanel({ log }: { log: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);
  const visible = log.slice(-40);
  return (
    <div className="panel log-panel">
      <div className="log" ref={ref}>
        {visible.map((l, i) => (
          <div key={i} className={`log-line ${l.kind}`}>
            <span className="log-bullet">◆</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- 装备行与属性对比 ----------------
const rarityClass = (r: string) =>
  r === "传说" ? "legend" : r === "稀有" ? "rare" : r === "魔法" ? "magic" : "normal";

export function EquipLine({ eq }: { eq: Equipment }) {
  const setName = eq.setId ? SETS[eq.setId]?.name : null;
  return (
    <span className={`equip-inline r-${rarityClass(eq.rarity)}`}>
      <span className="rarity-pill">{eq.rarity}</span>
      <strong>{eq.name}</strong>
      <span className="dim"> ({eq.slot}·{eq.kind} | {affixText(eq)})</span>
      {setName && <span className="set-name"> 〔{setName}〕</span>}
    </span>
  );
}

/** 对比候选装备与当前同槽位已穿装备, 生成直观提升提示 */
function EquipDelta({ cand, cur }: { cand: Equipment; cur: Equipment | null }) {
  if (!cur) return <span className="delta-tag up">▲ 空槽可装备</span>;
  const diffs: Array<{ text: string; up: boolean }> = [];
  const check = (label: string, a: number, b: number, suffix = "") => {
    const d = a - b;
    if (d !== 0) diffs.push({ text: `${label}${d > 0 ? "+" : ""}${d}${suffix}`, up: d > 0 });
  };
  check("攻", cand.atk, cur.atk);
  check("血", cand.hp, cur.hp);
  check("暴", cand.crit, cur.crit, "%");
  check("吸", cand.leech, cur.leech, "%");
  check("蓝", cand.regen, cur.regen);
  if (!diffs.length) return <span className="delta-tag">≡ 属性持平</span>;
  return (
    <span className="delta-wrap">
      {diffs.slice(0, 3).map((d, i) => (
        <span key={i} className={`delta-tag ${d.up ? "up" : "down"}`}>{d.text}</span>
      ))}
    </span>
  );
}

// ---------------- 背包与角色面板 ----------------
const STAT_NAMES: Record<StatKey, string> = { str: "力量", vit: "体力", mag: "魔力", agi: "敏捷" };
const STAT_DESC: Record<StatKey, string> = {
  str: `攻击 +${STAT_BONUS.str.atk}/点`,
  vit: `生命 +${STAT_BONUS.vit.hp}/点`,
  mag: `法力 +${STAT_BONUS.mag.mp}/点`,
  agi: `暴击 +${STAT_BONUS.agi.crit}%/点`,
};

export function InventoryPanel({ player, spriteKey, onWear, onDrop, onSpendStat, onOpenSkillTree, onClose }: {
  player: PlayerState;
  spriteKey?: string;
  onWear: (eq: Equipment) => void;
  onDrop: (eq: Equipment) => void;
  onSpendStat: (key: StatKey) => void;
  onOpenSkillTree: () => void;
  onClose: () => void;
}) {
  const [, bump] = useState(0);
  useEffect(() => onHdReady(() => bump((x) => x + 1)), []);
  const sets = setBonuses(player);
  const portrait = spriteKey ? hdUrl(spriteKey) : undefined;

  return (
    <Overlay onClose={onClose}>
      <div className="modal-head">
        <h3>角色与行囊 <span className="dim">({player.bag.length}/10)</span></h3>
        <div className="row">
          <button className="stat-tree-btn" onClick={onOpenSkillTree}>
            技能树 (K) {player.skillPoints > 0 && <span className="gold">+{player.skillPoints}</span>}
          </button>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* 角色属性总览与加点 */}
      <div className="char-sheet">
        {portrait && (
          <div className="char-portrait-card">
            <img src={portrait} alt={player.cls} />
            <div className="char-portrait-caption">Lv.{player.level} {player.cls}</div>
          </div>
        )}
        <div className="stat-block grow">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="section-sub">基础潜能</span>
            <span className={player.statPoints > 0 ? "gold" : "dim"} style={{ fontSize: 12, fontWeight: 600 }}>
              可用属性点: {player.statPoints}
            </span>
          </div>
          <div className="stat-grid">
            {(["str", "vit", "mag", "agi"] as const).map((key) => (
              <div className="stat-card" key={key}>
                <StatBadge stat={key} />
                <div className="grow">
                  <div className="stat-title">{STAT_NAMES[key]} <strong>{player.stats[key]}</strong></div>
                  <div className="dim" style={{ fontSize: 11 }}>{STAT_DESC[key]}</div>
                </div>
                <button
                  className="stat-plus"
                  onClick={() => onSpendStat(key)}
                  disabled={player.statPoints <= 0}
                  title={`投入 1 点${STAT_NAMES[key]}`}
                >+</button>
              </div>
            ))}
          </div>
          <div className="derived-bar">
            <span>⚔ 攻击 <b>{playerAtk(player)}</b></span>
            <span>♥ 生命 <b>{maxHp(player)}</b></span>
            <span>⚡ 暴击 <b>{playerCrit(player)}%</b></span>
            <span>🩸 吸血 <b>{playerLeech(player)}%</b></span>
            <span>✦ 回蓝 <b>{playerRegen(player)}</b>/回</span>
          </div>
        </div>
      </div>

      {/* 已穿戴装备三槽卡片 */}
      <div className="section-sub" style={{ margin: "10px 0 6px" }}>当前穿戴</div>
      <div className="equip-slots-grid">
        {(["武器", "护甲", "饰品"] as Slot[]).map((slot) => {
          const eq = player.equip[slot];
          return (
            <div className={`equipped-card ${eq ? `r-border-${rarityClass(eq.rarity)}` : ""}`} key={slot}>
              <ItemIconBox eq={eq} emptySlot={slot} size={44} />
              <div className="equipped-meta">
                <div className="dim" style={{ fontSize: 11 }}>{slot}槽位</div>
                {eq ? (
                  <>
                    <div className={`r-${rarityClass(eq.rarity)}`} style={{ fontWeight: 700, fontSize: 13 }}>{eq.name}</div>
                    <div className="dim" style={{ fontSize: 11 }}>{affixText(eq)}</div>
                  </>
                ) : (
                  <div className="dim" style={{ fontSize: 12 }}>未装备</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 套装激活状态 */}
      {sets.lines.length > 0 && (
        <div className="set-block">
          {sets.lines.map((l) => (
            <div key={l.name} className="set-line">
              <span className="set-name">✦ 〔{l.name} {l.count}/{l.need}〕</span>
              <span className="dim" style={{ fontSize: 12 }}>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 背包物品列表 */}
      <div className="section-sub" style={{ margin: "10px 0 6px" }}>
        行囊物品 {player.bag.length > 0 && <span className="dim" style={{ fontWeight: 400 }}>(按数字键 1-9/0 快速穿戴)</span>}
      </div>
      {player.bag.length === 0 && <div className="empty-bag">行囊空空如也，去地牢深处搜刮战利品吧。</div>}
      <div className="bag-list">
        {player.bag.map((eq, i) => (
          <div className="bag-card" key={i}>
            <ItemIconBox eq={eq} size={42} />
            <div className="bag-info grow">
              <div className="bag-title-row">
                <EquipLine eq={eq} />
                <EquipDelta cand={eq} cur={player.equip[eq.slot]} />
              </div>
            </div>
            <div className="bag-actions">
              <button className="primary" onClick={() => onWear(eq)} title="穿戴此装备">
                装备 <span className="key-hint">{(i + 1) % 10}</span>
              </button>
              <button className="danger-subtle" onClick={() => onDrop(eq)} title="丢弃">丢弃</button>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button onClick={onClose}>关闭 (I / Esc)</button>
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
  const unlocked = (tier: number) =>
    tier === 1 || player.learned.some((id) => tree.find((n) => n.id === id)?.tier === tier - 1);

  return (
    <Overlay onClose={onClose}>
      <div className="modal-head">
        <h3>职业天赋树 · {player.cls}</h3>
        <button className="close-x" onClick={onClose}>✕</button>
      </div>
      <div className="dim" style={{ marginBottom: 10, fontSize: 13 }}>
        可用技能点: <strong className="gold">{player.skillPoints}</strong> · 解锁下一阶需习得上一阶任意一项
      </div>
      <div className="skill-tree-wrap">
        {tiers.map((nodes, i) => (
          <div key={i} className="tier-block">
            {i > 0 && <div className={`tier-connector ${unlocked(i + 1) ? "lit" : ""}`} />}
            <div className="tier-label">第 {i + 1} 阶 · {i === 2 ? "终极奥义 (替换主动战技)" : "专精被动"}</div>
            <div className="skill-grid">
              {nodes.map((node) => {
                const learned = player.learned.includes(node.id);
                const canLearn = !learned && unlocked(node.tier) && player.skillPoints >= node.cost;
                const iconKind = node.active?.kind ?? "passive";
                return (
                  <div key={node.id} className={`skill-card ${learned ? "learned" : canLearn ? "can" : "locked"}`}>
                    <div className="skill-card-top">
                      <div className="skill-icon-badge">
                        <ActionIcon kind={iconKind} size={28} />
                      </div>
                      <div className="grow">
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <strong>{node.name}</strong>
                          <span className="skill-cost-tag">
                            {node.type === "active" ? "主动" : "被动"} · {node.cost}点
                          </span>
                        </div>
                        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{node.desc}</div>
                      </div>
                    </div>
                    {learned ? (
                      <div className="learned-pill">✦ 已习得</div>
                    ) : (
                      <button
                        className="primary"
                        disabled={!canLearn}
                        onClick={() => { onLearn(node); force((x) => x + 1); }}
                        style={{ marginTop: 8, width: "100%" }}
                      >
                        {unlocked(node.tier) ? (canLearn ? "领悟天赋" : "技能点不足") : "需先领悟上阶"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button onClick={onClose}>关闭 (K / Esc)</button>
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
  const isCamp = offer.kind === "camp";
  const bagVal = player.bag.reduce((s, e) => s + e.value, 0);
  return (
    <Overlay onClose={onClose}>
      <div className="modal-head">
        <h3>{isCamp ? "篝火营地行商" : "幽暗斗篷流浪商人"}</h3>
        <span className="gold" style={{ fontWeight: 700 }}>◈ {player.gold} 金</span>
      </div>
      <div className="dim" style={{ marginBottom: 10 }}>
        {isCamp ? "“营地补给充足，挑件称手的兵器再下潜吧。”" : "“嘘……深渊里的好货，错过这村可就没这店了。”"}
      </div>

      <div className="shop-list">
        <div className="bag-card">
          <ItemIconBox eq={offer.eq} size={46} />
          <div className="grow">
            <EquipLine eq={offer.eq} />
            <div style={{ marginTop: 3 }}>
              <EquipDelta cand={offer.eq} cur={player.equip[offer.eq.slot]} />
            </div>
          </div>
          <button
            className="primary"
            onClick={onBuyEq}
            disabled={player.gold < offer.eqPrice || player.bag.length >= 10}
          >
            购买 · {offer.eqPrice}金
          </button>
        </div>

        <div className="bag-card">
          <div className="skill-icon-badge"><ActionIcon kind="hp" size={28} /></div>
          <div className="grow">
            <strong>生命药剂 ×{offer.potionCount}</strong>
            <div className="dim" style={{ fontSize: 12 }}>当前持有: {player.potions["血瓶"]} 瓶</div>
          </div>
          <button onClick={onBuyPotion} disabled={player.gold < offer.potionPrice}>
            购买 · {offer.potionPrice}金
          </button>
        </div>

        <div className="bag-card">
          <div className="skill-icon-badge"><ActionIcon kind="mp" size={28} /></div>
          <div className="grow">
            <strong>法力药剂 ×{offer.manaCount}</strong>
            <div className="dim" style={{ fontSize: 12 }}>当前持有: {player.potions["蓝瓶"]} 瓶</div>
          </div>
          <button onClick={onBuyMana} disabled={player.gold < offer.manaPrice}>
            购买 · {offer.manaPrice}金
          </button>
        </div>

        <div className="bag-card">
          <div className="skill-icon-badge"><ActionIcon kind="passive" size={26} /></div>
          <div className="grow">
            <strong>差遣宠物回城清包</strong>
            <div className="dim" style={{ fontSize: 12 }}>一键售出背包内全部 {player.bag.length} 件未穿戴装备</div>
          </div>
          <button onClick={onSellAll} disabled={player.bag.length === 0}>
            全卖 · +{bagVal}金
          </button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button onClick={onClose}>离开 (Esc)</button>
      </div>
    </Overlay>
  );
}

// ---------------- 传送门 ----------------
export function PortalPanel({ onGo, onClose }: { onGo: (floor: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Overlay onClose={onClose}>
      <div className="modal-head">
        <h3>远古虚空传送阵</h3>
        <button className="close-x" onClick={onClose}>✕</button>
      </div>
      <div className="dim" style={{ marginBottom: 12 }}>
        输入目标层数 (1 ~ 999)。虚空折跃单向不可逆，深层魔物极为凶险。
      </div>
      <div className="row">
        <input
          ref={ref}
          className="portal-input"
          type="number"
          min={1}
          max={999}
          placeholder="层数"
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
        }}>启动折跃</button>
        <button onClick={onClose}>取消 (Esc)</button>
      </div>
    </Overlay>
  );
}

// ---------------- 战利品拾取弹窗 ----------------
export function LootPanel({ eq, curEquipped, bagFull, onTake, onSkip }: {
  eq: Equipment;
  curEquipped?: Equipment | null;
  bagFull: boolean;
  onTake: () => void;
  onSkip: () => void;
}) {
  return (
    <Overlay onClose={onSkip}>
      <div className="modal-head">
        <h3>✦ 发现战利品</h3>
        <span className="gold" style={{ fontSize: 13 }}>估值 {eq.value} 金</span>
      </div>
      <div className={`loot-showcase r-border-${rarityClass(eq.rarity)}`}>
        <ItemIconBox eq={eq} size={62} />
        <div className="grow">
          <div style={{ fontSize: 16 }}>
            <EquipLine eq={eq} />
          </div>
          <div style={{ marginTop: 6 }}>
            <EquipDelta cand={eq} cur={curEquipped ?? null} />
          </div>
          {curEquipped && (
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              当前已穿: [{curEquipped.rarity}]{curEquipped.name} ({affixText(curEquipped)})
            </div>
          )}
        </div>
      </div>
      {bagFull && <div className="hp-color" style={{ fontSize: 12, marginTop: 6 }}>背包已满 (10/10)，无法继续拾取。</div>}
      <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
        <button className="primary" onClick={onTake} disabled={bagFull}>收入行囊 (Y)</button>
        <button onClick={onSkip}>遗弃 (Esc)</button>
      </div>
    </Overlay>
  );
}

// ---------------- 通用遮罩弹窗 ----------------
export function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      className="overlay-backdrop"
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div className="overlay-panel">{children}</div>
    </div>
  );
}

// ---------------- 标题主界面 ----------------
export function TitleScreen({ hasSave, saveInfo, onContinue, onNew }: {
  hasSave: boolean;
  saveInfo: string;
  onContinue: () => void;
  onNew: () => void;
}) {
  const [, bump] = useState(0);
  useEffect(() => onHdReady(() => bump((x) => x + 1)), []);
  const banner = hdUrl("title_banner");

  return (
    <div className="title-screen">
      <div className="title-hero-card">
        {banner && <img src={banner} alt="火炬之光" className="title-hero-img" />}
        <div className="title-hero-overlay">
          <div className="title-eyebrow">TORCHLIGHT · ABYSSAL CHRONICLES</div>
          <h1>火 炬 之 光</h1>
          <p className="title-sub">暗黑刷宝 Roguelite · 深入无尽深渊，搜集传世神装</p>
        </div>
      </div>

      <div className="title-cta-row">
        {hasSave && (
          <button className="primary btn-lg" onClick={onContinue}>
            继续冒险 <span className="save-pill">{saveInfo}</span>
          </button>
        )}
        <button onClick={onNew} className={hasSave ? "btn-lg" : "primary btn-lg"}>
          开启新的远征
        </button>
      </div>

      <div className="title-keys">
        <span><kbd className="kbd">WASD / 方向键</kbd> 移动</span>
        <span><kbd className="kbd">E / 空格</kbd> 交互</span>
        <span><kbd className="kbd">I</kbd> 角色行囊</span>
        <span><kbd className="kbd">K</kbd> 技能树</span>
        <span><kbd className="kbd">1 - 4</kbd> 战斗施放</span>
      </div>
    </div>
  );
}

// ---------------- 选人界面 ----------------
export function CreateScreen({ classes, onPick, onBack }: {
  classes: Record<string, ClassDef>;
  onPick: (key: string) => void;
  onBack?: () => void;
}) {
  const [, bump] = useState(0);
  useEffect(() => onHdReady(() => bump((x) => x + 1)), []);

  return (
    <div className="create-screen">
      <div className="create-header">
        <div className="title-eyebrow">CHOOSE YOUR CHAMPION</div>
        <h1>选 择 你 的 英 雄</h1>
        <div className="dim">三大职业各具专属战技与三阶天赋分支，死亡将抹去本局进度</div>
      </div>

      <div className="class-cards-row">
        {Object.entries(classes).map(([key, c]) => {
          const img = hdUrl(c.sprite);
          const meta = CLASS_META[c.name] ?? { role: "深渊冒险者", aura: "none" };
          return (
            <div key={key} className="class-card" onClick={() => onPick(key)}>
              <div className="class-art-box" style={{ background: meta.aura }}>
                {img && <img src={img} alt={c.name} className="class-art-img" />}
              </div>
              <div className="class-body">
                <div className="class-name-row">
                  <span className="class-title">{c.name}</span>
                  <span className="class-key">[{key}]</span>
                </div>
                <div className="class-role">{meta.role}</div>
                <div className="class-stats">
                  <span>♥ 生命 <b>{c.hp}</b></span>
                  <span>⚔ 攻击 <b>{c.atk}</b></span>
                  <span>✦ 法力 <b>{c.mp}</b></span>
                </div>
                <div className="class-skill-box">
                  <ActionIcon kind={c.skill.kind ?? "flame"} size={28} />
                  <div>
                    <div className="class-skill-title">
                      {c.skill.name} <span className="mp-color">({c.skill.cost}蓝)</span>
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>{c.skill.desc}</div>
                  </div>
                </div>
                <button className="primary class-pick-btn">踏入地牢</button>
              </div>
            </div>
          );
        })}
      </div>

      {onBack && (
        <div style={{ marginTop: 18 }}>
          <button onClick={onBack}>返回标题</button>
        </div>
      )}
    </div>
  );
}

// ---------------- 陨落结算界面 ----------------
export function DeadScreen({ player, spriteKey, floor, best, onRetry, onTitle }: {
  player: PlayerState;
  spriteKey?: string;
  floor: number;
  best: Equipment | null;
  onRetry: () => void;
  onTitle: () => void;
}) {
  const portrait = spriteKey ? hdUrl(spriteKey) : undefined;
  return (
    <div className="dead-screen">
      <div className="dead-card">
        <div className="title-eyebrow" style={{ color: "#f87171" }}>YOU HAVE FALLEN</div>
        <h1>英 魂 陨 落 · 第 {floor} 层</h1>
        {portrait && (
          <div className="dead-portrait">
            <img src={portrait} alt={player.cls} />
          </div>
        )}
        <div className="dead-stats-grid">
          <div className="dead-stat"><span>英雄职业</span><strong>{player.cls}</strong></div>
          <div className="dead-stat"><span>最终等级</span><strong>Lv.{player.level}</strong></div>
          <div className="dead-stat"><span>斩杀魔物</span><strong>{player.kills} 只</strong></div>
          <div className="dead-stat"><span>遗留金币</span><strong className="gold">{player.gold}</strong></div>
        </div>
        <div className="dead-relic">
          <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>本局最高价值遗物</div>
          {best ? (
            <div className="row" style={{ justifyContent: "center" }}>
              <ItemIconBox eq={best} size={42} />
              <EquipLine eq={best} />
            </div>
          ) : (
            <span className="dim">未留下传世装备</span>
          )}
        </div>
        <div className="dim" style={{ margin: "14px 0 20px", fontSize: 12 }}>
          深渊吞噬了你的足迹，存档已依 Roguelite 法则抹除。
        </div>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <button className="primary btn-lg" onClick={onRetry}>再度远征</button>
          <button className="btn-lg" onClick={onTitle}>返回主菜单</button>
        </div>
      </div>
    </div>
  );
}
