import { useEffect, useRef, useState } from "react";
import { expNeed, playerAtk } from "../game/player";
import type { Action } from "../game/combat";
import type { FloorMap, PlayerState } from "../game/types";
import { ActionIcon } from "./Icons";
import { hdUrl, onHdReady } from "../render/hdAssets";

/** 红/蓝水晶球: 立体黄铜外圈 + 玻璃高光 + 动态液面 */
export function Orb({ value, max, color, glow, label }: {
  value: number;
  max: number;
  color: string;
  glow: string;
  label?: string;
}) {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <div
      className="orb-shell"
      title={`${label ?? ""} ${Math.max(0, Math.round(value))} / ${Math.round(max)}`}
    >
      <div className="orb" style={{ borderColor: glow, boxShadow: `0 0 18px ${glow}44, inset 0 0 20px #000` }}>
        <div className="orb-fill" style={{ height: `${ratio * 100}%`, background: color }} />
        <div className="orb-wave" style={{ bottom: `calc(${ratio * 100}% - 3px)`, background: color }} />
        <span className="orb-num">{Math.max(0, Math.round(value))}</span>
      </div>
    </div>
  );
}

/** 底部暗黑风格动作主控台 */
export function ActionBar({
  player,
  spriteKey,
  inCombat,
  canUsePotions,
  onAction,
  onOpenInv,
  onOpenSkill,
}: {
  player: PlayerState;
  spriteKey: string;
  inCombat: boolean;
  canUsePotions: boolean;
  onAction: (a: Action) => void;
  onOpenInv?: () => void;
  onOpenSkill?: () => void;
}) {
  const [, bump] = useState(0);
  useEffect(() => onHdReady(() => bump((x) => x + 1)), []);

  const avatarUrl = hdUrl(spriteKey);
  const skillKind = player.skill.kind ?? "flame";

  const slots: Array<{
    key: string;
    icon: "attack" | "hp" | "mp" | typeof skillKind;
    label: string;
    badge?: string;
    hot: boolean;
    disabled: boolean;
    onClick: () => void;
    title: string;
  }> = [
    {
      key: "attack",
      icon: "attack",
      label: "普攻",
      hot: inCombat,
      disabled: !inCombat,
      onClick: () => onAction({ kind: "attack" }),
      title: "普通攻击 (快捷键 1)",
    },
    {
      key: "skill",
      icon: skillKind,
      label: player.skill.name,
      badge: `${player.skill.cost}蓝`,
      hot: inCombat,
      disabled: !inCombat || player.mp < player.skill.cost,
      onClick: () => onAction({ kind: "skill" }),
      title: `${player.skill.name} (${player.skill.cost}法力): ${player.skill.desc}`,
    },
    {
      key: "hp",
      icon: "hp",
      label: "血瓶",
      badge: `×${player.potions["血瓶"]}`,
      hot: canUsePotions,
      disabled: !canUsePotions || player.potions["血瓶"] <= 0,
      onClick: () => onAction({ kind: "potion", which: "血瓶" }),
      title: `饮用生命药剂 (快捷键 3, 战斗外也可使用, 剩余 ${player.potions["血瓶"]})`,
    },
    {
      key: "mp",
      icon: "mp",
      label: "蓝瓶",
      badge: `×${player.potions["蓝瓶"]}`,
      hot: canUsePotions,
      disabled: !canUsePotions || player.potions["蓝瓶"] <= 0,
      onClick: () => onAction({ kind: "potion", which: "蓝瓶" }),
      title: `饮用法力药剂 (快捷键 4, 战斗外也可使用, 剩余 ${player.potions["蓝瓶"]})`,
    },
  ];

  return (
    <div className="actionbar">
      {/* 角色头像徽章(点击可开背包/角色面板) */}
      <button className="hero-medallion" onClick={onOpenInv} title="角色与背包 (快捷键 I)">
        {avatarUrl && <img src={avatarUrl} alt={player.cls} className="hero-medallion-img" />}
        <span className="hero-medallion-lv">{player.level}</span>
      </button>

      <div className="slot-group">
        {slots.map((s, i) => (
          <button
            key={s.key}
            className={`slot ${s.hot ? "hot" : ""}`}
            onClick={s.onClick}
            disabled={s.disabled}
            title={s.title}
          >
            <ActionIcon kind={s.icon} size={30} />
            {s.badge && <span className="slot-badge">{s.badge}</span>}
            <span className="slot-key">{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="actionbar-info">
        <div className="info-top-line">
          <span className="cls-tag">{player.cls}</span>
          <span className="atk-tag">⚔ {playerAtk(player)}</span>
          <span className="gold">◈ {player.gold}</span>
        </div>
        <div className="exp-row" title={`经验 ${player.exp}/${expNeed(player)}`}>
          <div className="exp-track">
            <div className="exp-fill" style={{ width: `${Math.min(100, (player.exp / expNeed(player)) * 100)}%` }} />
          </div>
          <span className="exp-num">EXP {player.exp}/{expNeed(player)}</span>
        </div>
        {(player.statPoints > 0 || player.skillPoints > 0) && (
          <div className="pt-row">
            {player.statPoints > 0 && (
              <button className="pt-pill" onClick={onOpenInv} title="点击分配属性点 (I)">
                ✦ 属性点 +{player.statPoints}
              </button>
            )}
            {player.skillPoints > 0 && (
              <button className="pt-pill sk" onClick={onOpenSkill} title="点击打开技能树 (K)">
                ✧ 技能点 +{player.skillPoints}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 顶部目标首领/怪物血条 */
export function BossBar({ name, hp, maxHp: mh }: { name: string; hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, mh)) * 100));
  return (
    <div className="bossbar">
      <div className="bossbar-name">
        <span>❖ {name}</span>
        <span className="bossbar-hp-num">{Math.max(0, hp)} / {mh}</span>
      </div>
      <div className="bossbar-track">
        <div className="bossbar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 右上角镶金小地图雷达 */
export function Minimap({ map }: { map: FloorMap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const ctx = cv.getContext("2d")!;
      const S = 3;
      cv.width = map.cols * S;
      cv.height = map.rows * S;
      ctx.fillStyle = "#080610";
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (let y = 0; y < map.rows; y++) {
        for (let x = 0; x < map.cols; x++) {
          const i = y * map.cols + x;
          if (!map.seen[i]) continue;
          const t = map.tiles[i];
          if (t === "wall") ctx.fillStyle = map.visible[i] ? "#4e476e" : "#29243d";
          else if (t === "stairs") ctx.fillStyle = "#ffd23e";
          else if (t === "campfire") ctx.fillStyle = "#ff8a3e";
          else if (t === "merchant") ctx.fillStyle = "#60a5fa";
          else if (t === "portal") ctx.fillStyle = "#c084fc";
          else if (t === "chest") ctx.fillStyle = "#f59e0b";
          else if (t === "spring") ctx.fillStyle = "#38bdf8";
          else ctx.fillStyle = map.visible[i] ? "#8c86ad" : "#3d3852";
          ctx.fillRect(x * S, y * S, S, S);
        }
      }
      for (const m of map.monsters) {
        const i = m.y * map.cols + m.x;
        if (!map.visible[i] || m.hp <= 0) continue;
        ctx.fillStyle = m.boss ? "#ff4b3e" : m.elite ? "#c084fc" : "#f87171";
        ctx.beginPath();
        ctx.arc(m.x * S + S * 0.5, m.y * S + S * 0.5, S * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      const blink = Math.floor(Date.now() / 420) % 2 === 0;
      ctx.fillStyle = blink ? "#ffffff" : "#ffd23e";
      ctx.beginPath();
      ctx.arc(map.playerX * S + S * 0.5, map.playerY * S + S * 0.5, S * 1.15, 0, Math.PI * 2);
      ctx.fill();
    };
    draw();
    const timer = window.setInterval(draw, 420);
    return () => window.clearInterval(timer);
  });
  return (
    <div className="minimap-frame">
      <canvas ref={ref} className="minimap" />
    </div>
  );
}
