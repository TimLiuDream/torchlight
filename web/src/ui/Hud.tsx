import { useEffect, useRef } from "react";
import { expNeed, maxHp, playerAtk } from "../game/player";
import type { Action } from "../game/combat";
import type { FloorMap, PlayerState } from "../game/types";
import { icon } from "../render/sprites";
import { tex, texReady } from "../render/atlas";

/** 槽位图标: 优先 0x72 贴图(texKey), 回退程序化像素图标(name) */
function PixelIcon({ name, texKey }: { name: string; texKey?: string }) {
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
      const img = texKey ? tex(texKey) : undefined;
      if (img) ctx.drawImage(img, 0, 0, cv.width, cv.height);
      else ctx.drawImage(icon(name), 0, 0, cv.width, cv.height);
    };
    draw();
    texReady.then(draw);
    return () => { alive = false; };
  }, [name, texKey]);
  return <canvas ref={ref} width={16} height={16} style={{ width: 24, height: 24, imageRendering: "pixelated" }} />;
}

/** 红/蓝血球: 液体按比例填充 */
export function Orb({ value, max, color, glow }: { value: number; max: number; color: string; glow: string }) {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <div className="orb" style={{ borderColor: glow, boxShadow: `0 0 14px ${glow}44, inset 0 0 18px #000` }}>
      <div className="orb-fill" style={{ height: `${ratio * 100}%`, background: color }} />
      <div className="orb-wave" style={{ bottom: `${ratio * 100}%`, background: color }} />
      <span className="orb-num">{Math.max(0, Math.round(value))}</span>
    </div>
  );
}

/** 底部技能栏 */
export function ActionBar({ player, inCombat, onAction }: {
  player: PlayerState;
  inCombat: boolean;
  onAction: (a: Action) => void;
}) {
  const slots: Array<{
    key: string;
    iconKey: string;
    texKey?: string;
    badge?: string;
    hot: boolean;
    onClick?: () => void;
    title?: string;
  }> = [
    { key: "attack", iconKey: "icon_sword", hot: inCombat, onClick: () => onAction({ kind: "attack" }) },
    {
      key: "skill",
      iconKey: "icon_star",
      badge: `${player.skill.cost}蓝`,
      hot: inCombat,
      onClick: () => onAction({ kind: "skill" }),
      title: `${player.skill.name}: ${player.skill.desc}`,
    },
    {
      key: "hp",
      iconKey: "icon_potion_hp",
      texKey: "flask_red",
      badge: `×${player.potions["血瓶"]}`,
      hot: true,
      onClick: () => onAction({ kind: "potion", which: "血瓶" }),
    },
    {
      key: "mp",
      iconKey: "icon_potion_mp",
      texKey: "flask_blue",
      badge: `×${player.potions["蓝瓶"]}`,
      hot: true,
      onClick: () => onAction({ kind: "potion", which: "蓝瓶" }),
    },
  ];
  return (
    <div className="actionbar">
      {slots.map((s, i) => (
        <button
          key={s.key}
          className={`slot ${s.hot ? "hot" : ""}`}
          onClick={s.onClick}
          disabled={!s.hot || (i >= 2 && player.potions[i === 2 ? "血瓶" : "蓝瓶"] <= 0)}
          title={s.title}
        >
          <PixelIcon name={s.iconKey} texKey={s.texKey} />
          {s.badge && <span className="slot-badge">{s.badge}</span>}
          <span className="slot-key">{i + 1}</span>
        </button>
      ))}
      <div className="actionbar-info">
        <span>Lv{player.level}</span>
        <span>⚔{playerAtk(player)}</span>
        <span className="gold">{player.gold}金</span>
        <div className="exp-row" title={`经验 ${player.exp}/${expNeed(player)}`}>
          <div className="exp-track">
            <div className="exp-fill" style={{ width: `${Math.min(100, (player.exp / expNeed(player)) * 100)}%` }} />
          </div>
          <span className="exp-num">{player.exp}/{expNeed(player)}</span>
        </div>
        {player.statPoints > 0 && <span className="pt-hint">属性点{player.statPoints}</span>}
        {player.skillPoints > 0 && <span className="pt-hint sk">技能点{player.skillPoints}</span>}
      </div>
    </div>
  );
}

/** 顶部目标血条(战斗中) */
export function BossBar({ name, hp, maxHp: mh }: { name: string; hp: number; maxHp: number }) {
  return (
    <div className="bossbar">
      <div className="bossbar-name">{name}</div>
      <div className="bossbar-track">
        <div className="bossbar-fill" style={{ width: `${Math.max(0, (hp / mh) * 100)}%` }} />
      </div>
    </div>
  );
}

/** 右上小地图 */
export function Minimap({ map }: { map: FloorMap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const ctx = cv.getContext("2d")!;
      const S = 2;
      cv.width = map.cols * S;
      cv.height = map.rows * S;
      ctx.fillStyle = "#0a0812";
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (let y = 0; y < map.rows; y++) {
        for (let x = 0; x < map.cols; x++) {
          const i = y * map.cols + x;
          if (!map.seen[i]) continue;
          const t = map.tiles[i];
          if (t === "wall") ctx.fillStyle = map.visible[i] ? "#565080" : "#3a3456";
          else if (t === "stairs") ctx.fillStyle = "#ffd23e";
          else if (t === "campfire") ctx.fillStyle = "#ff8a3e";
          else if (t === "merchant") ctx.fillStyle = "#7ab8ff";
          else if (t === "portal") ctx.fillStyle = "#b28cff";
          else if (t === "chest") ctx.fillStyle = "#e8b23a";
          else if (t === "spring") ctx.fillStyle = "#4a9ce8";
          else ctx.fillStyle = map.visible[i] ? "#9a94b8" : "#4a4460";
          ctx.fillRect(x * S, y * S, S, S);
        }
      }
      for (const m of map.monsters) {
        const i = m.y * map.cols + m.x;
        if (!map.visible[i] || m.hp <= 0) continue;
        ctx.fillStyle = m.boss ? "#ff4b4b" : m.elite ? "#b464ff" : "#ff6b6b";
        ctx.fillRect(m.x * S - 1, m.y * S - 1, S + 2, S + 2);
      }
      // 玩家点闪烁(金/白交替)
      const blink = Math.floor(Date.now() / 400) % 2 === 0;
      ctx.fillStyle = blink ? "#ffffff" : "#ffd23e";
      ctx.fillRect(map.playerX * S - 1, map.playerY * S - 1, S + 2, S + 2);
    };
    draw();
    const timer = window.setInterval(draw, 400);
    return () => window.clearInterval(timer);
  });
  return <canvas ref={ref} className="minimap pixel" />;
}

/** 战斗/探索共用的状态摘要(移动端窄屏时的备用信息) */
export function StatLine({ player }: { player: PlayerState }) {
  return (
    <span className="dim" style={{ fontSize: 12 }}>
      ❤{player.hp}/{maxHp(player)} ✦{player.mp}/{player.maxMp} ⚔{playerAtk(player)}
    </span>
  );
}
