import type { Equipment, Rarity, SkillKind, Slot, StatKey } from "../game/types";

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; bg: string }> = {
  普通: {
    border: "#5d5a72",
    glow: "rgba(180, 180, 205, 0.14)",
    bg: "radial-gradient(circle at 50% 38%, #2a2738 0%, #13111c 78%)",
  },
  魔法: {
    border: "#4e86ff",
    glow: "rgba(78, 134, 255, 0.36)",
    bg: "radial-gradient(circle at 50% 38%, #1e3366 0%, #10162b 78%)",
  },
  稀有: {
    border: "#f0be49",
    glow: "rgba(240, 190, 73, 0.42)",
    bg: "radial-gradient(circle at 50% 38%, #4d3914 0%, #1a140b 78%)",
  },
  传说: {
    border: "#ff6438",
    glow: "rgba(255, 92, 48, 0.52)",
    bg: "radial-gradient(circle at 50% 38%, #5c1f16 0%, #1d0c0c 78%)",
  },
};

/** 装备图标 SVG 图形: 覆盖全部 13 种细分装备与空槽剪影 */
export function EquipSvg({ kind, slot, size = 30, muted = false }: {
  kind?: string;
  slot: Slot;
  size?: number;
  muted?: boolean;
}) {
  const k = kind || slot;
  const opacity = muted ? 0.26 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ opacity, display: "block", flex: "none" }}>
      <defs>
        <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5f8ff" />
          <stop offset="48%" stopColor="#a8b4cc" />
          <stop offset="100%" stopColor="#556078" />
        </linearGradient>
        <linearGradient id="goldg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff0b3" />
          <stop offset="50%" stopColor="#e5ab3c" />
          <stop offset="100%" stopColor="#8a5814" />
        </linearGradient>
        <linearGradient id="crimson" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff9472" />
          <stop offset="55%" stopColor="#d93829" />
          <stop offset="100%" stopColor="#691212" />
        </linearGradient>
        <linearGradient id="arcane" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4a6ff" />
          <stop offset="55%" stopColor="#7a4be8" />
          <stop offset="100%" stopColor="#32186e" />
        </linearGradient>
        <linearGradient id="leather" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cf935f" />
          <stop offset="55%" stopColor="#8c542b" />
          <stop offset="100%" stopColor="#472610" />
        </linearGradient>
        <linearGradient id="cyanGem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d6fbff" />
          <stop offset="45%" stopColor="#3ec8ff" />
          <stop offset="100%" stopColor="#145299" />
        </linearGradient>
      </defs>

      {/* -------- 武器 -------- */}
      {(k === "短剑" || (muted && slot === "武器")) && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M37 8 L40 11 L21 30 L17 26 Z" fill="url(#steel)" />
          <path d="M38 9 L20 27" stroke="#ffffff" strokeWidth="1" opacity="0.7" />
          <path d="M13 23 L25 35 L22 37 L11 26 Z" fill="url(#goldg)" />
          <path d="M16 31 L10 37 L11 39 L18 33 Z" fill="url(#leather)" />
          <circle cx="9.5" cy="38.5" r="2.6" fill="url(#goldg)" />
        </g>
      )}
      {k === "战斧" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 39 L35 12" stroke="#7a4b27" strokeWidth="4.2" strokeLinecap="round" />
          <path d="M23 11 C15 9, 10 15, 13 23 C17 20, 21 19, 25 21 Z" fill="url(#steel)" />
          <path d="M31 19 C38 22, 39 30, 31 33 C30 28, 29 24, 26 22 Z" fill="url(#steel)" />
          <circle cx="27.5" cy="19.5" r="3.2" fill="url(#crimson)" />
          <circle cx="36" cy="11" r="2.3" fill="url(#goldg)" />
        </g>
      )}
      {k === "法杖" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M11 39 L32 18" stroke="#6c4228" strokeWidth="3.8" strokeLinecap="round" />
          <path d="M28 19 C26 12, 32 7, 38 10 C41 15, 36 22, 29 20" fill="none" stroke="url(#goldg)" strokeWidth="3" />
          <circle cx="34" cy="14" r="5" fill="url(#crimson)" />
          <circle cx="32.5" cy="12.5" r="1.8" fill="#fff4cc" stroke="none" />
        </g>
      )}
      {k === "火枪" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M16 26 L40 12 L42 15 L19 29 Z" fill="url(#steel)" />
          <path d="M9 36 L18 26 L23 30 L14 40 Z" fill="url(#leather)" />
          <path d="M21 27 C23 31, 20 34, 17 32" fill="none" stroke="url(#goldg)" strokeWidth="2" />
          <rect x="24" y="19" width="7" height="3.5" transform="rotate(-30 24 19)" fill="url(#goldg)" />
        </g>
      )}
      {k === "铁拳套" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M14 28 L18 15 L33 15 L36 26 L30 37 L16 37 Z" fill="url(#steel)" />
          <path d="M18 15 L17 10 M23 15 L23 9 M28 15 L29 9 M33 15 L35 11" stroke="url(#goldg)" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="16" y="31" width="15" height="5" rx="1.5" fill="url(#goldg)" />
          <circle cx="25" cy="24" r="3.2" fill="url(#crimson)" />
        </g>
      )}

      {/* -------- 护甲 -------- */}
      {(k === "皮甲" || (muted && slot === "护甲")) && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M15 10 L20 13 L28 13 L33 10 L39 17 L34 22 L33 38 L15 38 L14 22 L9 17 Z" fill="url(#leather)" />
          <path d="M19 13 L24 21 L29 13" fill="none" stroke="url(#goldg)" strokeWidth="2" />
          <rect x="15" y="28" width="18" height="4" fill="#331c0e" />
          <rect x="21.5" y="27" width="5" height="6" rx="1" fill="url(#goldg)" />
        </g>
      )}
      {k === "锁子甲" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M14 10 L20 13 L28 13 L34 10 L40 18 L35 23 L34 39 L14 39 L13 23 L8 18 Z" fill="url(#steel)" />
          <path d="M17 19 H31 M16 24 H32 M16 29 H32 M17 34 H31" stroke="#3c465c" strokeWidth="1.4" strokeDasharray="2 2" />
          <path d="M14 10 L20 14 L28 14 L34 10" fill="none" stroke="url(#goldg)" strokeWidth="2.2" />
        </g>
      )}
      {k === "法师袍" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M16 9 L24 13 L32 9 L40 19 L34 23 L37 40 L11 40 L14 23 L8 19 Z" fill="url(#arcane)" />
          <path d="M24 13 V40" stroke="url(#goldg)" strokeWidth="2.4" />
          <path d="M16 9 L24 16 L32 9" fill="none" stroke="url(#goldg)" strokeWidth="2.2" />
          <circle cx="24" cy="21" r="2.6" fill="url(#cyanGem)" />
        </g>
      )}
      {k === "板甲" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 11 L20 14 L28 14 L36 11 L42 19 L35 24 L34 39 L24 42 L14 39 L13 24 L6 19 Z" fill="url(#steel)" />
          <path d="M8 15 C11 9, 17 9, 19 14 Z M40 15 C37 9, 31 9, 29 14 Z" fill="url(#goldg)" />
          <path d="M24 15 V38 M16 23 L24 27 L32 23" fill="none" stroke="url(#goldg)" strokeWidth="2" />
        </g>
      )}

      {/* -------- 饰品 -------- */}
      {(k === "戒指" || (muted && slot === "饰品")) && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <ellipse cx="24" cy="27" rx="11" ry="10" fill="none" stroke="url(#goldg)" strokeWidth="5" />
          <ellipse cx="24" cy="27" rx="11" ry="10" fill="none" stroke="#120e1a" strokeWidth="1.4" />
          <polygon points="24,10 30,16 24,21 18,16" fill="url(#crimson)" />
          <polygon points="24,11.5 27.5,15.5 24,18" fill="#ffb8a8" stroke="none" opacity="0.7" />
        </g>
      )}
      {k === "护符" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M14 10 C14 22, 34 22, 34 10" fill="none" stroke="url(#goldg)" strokeWidth="2.4" />
          <polygon points="24,17 33,28 24,40 15,28" fill="url(#goldg)" />
          <polygon points="24,21 29.5,28 24,36 18.5,28" fill="url(#arcane)" />
          <circle cx="24" cy="28" r="2.2" fill="#e8dcff" stroke="none" />
        </g>
      )}
      {k === "怀表" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="21" y="8" width="6" height="4" rx="1" fill="url(#goldg)" />
          <circle cx="24" cy="27" r="13" fill="url(#goldg)" />
          <circle cx="24" cy="27" r="9.5" fill="#1b1829" />
          <path d="M24 27 L24 20 M24 27 L29 29" stroke="#ffe7a3" strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="27" r="1.6" fill="#ffd23e" stroke="none" />
        </g>
      )}
      {k === "魔晶" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <polygon points="24,7 35,19 31,39 17,39 13,19" fill="url(#cyanGem)" />
          <polygon points="24,7 35,19 24,25 13,19" fill="#b8f2ff" opacity="0.45" stroke="none" />
          <path d="M24 7 L24 39 M13 19 L24 25 L35 19" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.65" />
        </g>
      )}
    </svg>
  );
}

/** ARPG 稀有度镶框装备格(可用于装备栏、背包行、掉落弹窗、商店) */
export function ItemIconBox({ eq, emptySlot, size = 44 }: {
  eq?: Equipment | null;
  emptySlot?: Slot;
  size?: number;
}) {
  if (!eq) {
    return (
      <div
        className="item-icon-box empty"
        style={{ width: size, height: size }}
      >
        <EquipSvg slot={emptySlot ?? "武器"} size={Math.round(size * 0.64)} muted />
      </div>
    );
  }
  const st = RARITY_STYLES[eq.rarity];
  return (
    <div
      className={`item-icon-box r-box-${eq.rarity}`}
      style={{
        width: size,
        height: size,
        background: st.bg,
        borderColor: eq.setId ? "#47d18c" : st.border,
        boxShadow: `0 0 14px ${eq.setId ? "rgba(71,209,140,0.38)" : st.glow}, inset 0 0 10px rgba(0,0,0,0.65)`,
      }}
    >
      <EquipSvg kind={eq.kind} slot={eq.slot} size={Math.round(size * 0.7)} />
      {eq.setId && <span className="item-set-dot" title="套装部件">✦</span>}
    </div>
  );
}

/** 技能与药水高清图标 */
export function ActionIcon({ kind, size = 28 }: {
  kind: "attack" | "hp" | "mp" | "passive" | SkillKind;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block" }}>
      <defs>
        <linearGradient id="skFire" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#d62828" />
          <stop offset="55%" stopColor="#ff7b29" />
          <stop offset="100%" stopColor="#fff3b0" />
        </linearGradient>
        <linearGradient id="skBlade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#9db4d8" />
          <stop offset="100%" stopColor="#43506b" />
        </linearGradient>
        <linearGradient id="skHeal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#0f7a4a" />
          <stop offset="55%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#d1fae5" />
        </linearGradient>
        <linearGradient id="skMana" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#1d3fa8" />
          <stop offset="55%" stopColor="#4da3ff" />
          <stop offset="100%" stopColor="#dbf0ff" />
        </linearGradient>
      </defs>

      {kind === "attack" && (
        <g stroke="#100c18" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M38 8 L41 11 L20 32 L16 28 Z" fill="url(#skBlade)" />
          <path d="M12 24 L25 37 L22 39 L10 27 Z" fill="#e5ab3c" />
          <path d="M15 32 L9 38 L11 40 L17 34 Z" fill="#7c4a24" />
          <path d="M12 12 C22 10, 34 16, 38 28" fill="none" stroke="#ffd27d" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
        </g>
      )}

      {(kind === "flame" || kind === "nova") && (
        <g>
          <path
            d="M24 6 C29 14, 38 18, 37 29 C36 37, 30 42, 24 42 C17 42, 11 36, 11 28 C11 21, 16 16, 19 12 C18 17, 21 19, 23 20 C21 14, 22 9, 24 6 Z"
            fill="url(#skFire)"
            stroke="#1a0c0c"
            strokeWidth="1.5"
          />
          {kind === "nova" && (
            <circle cx="24" cy="28" r="6" fill="#ffffff" opacity="0.85" />
          )}
        </g>
      )}

      {kind === "aoe" && (
        <g stroke="#140c14" strokeWidth="1.4">
          <path d="M34 7 L20 25 L26 27 L38 11 Z" fill="url(#skFire)" />
          <path d="M22 10 L10 26 L15 28 L25 13 Z" fill="url(#skFire)" />
          <ellipse cx="24" cy="36" rx="15" ry="5" fill="none" stroke="#ff9f43" strokeWidth="2.6" />
          <circle cx="19" cy="33" r="4" fill="#ffd23e" />
          <circle cx="29" cy="34" r="3.5" fill="#ff6b35" />
        </g>
      )}

      {(kind === "whirl" || kind === "leechWhirl") && (
        <g fill="none" strokeLinecap="round">
          <path
            d="M24 9 C35 9, 41 18, 38 28 C35 37, 24 41, 14 36 C7 31, 7 19, 16 14"
            stroke={kind === "leechWhirl" ? "#ff4b5c" : "#dce8ff"}
            strokeWidth="4.2"
          />
          <path
            d="M28 16 C33 19, 34 26, 29 31 C24 35, 16 33, 15 26"
            stroke={kind === "leechWhirl" ? "#ffb3ba" : "#ffd23e"}
            strokeWidth="2.6"
          />
          <circle cx="24" cy="24" r="3.5" fill={kind === "leechWhirl" ? "#ff3b4e" : "#ffffff"} />
        </g>
      )}

      {(kind === "drone" || kind === "healBig") && (
        <g stroke="#0e1818" strokeWidth="1.5" strokeLinejoin="round">
          <circle cx="24" cy="24" r="12" fill="#233846" />
          <circle cx="24" cy="24" r="8" fill="url(#skHeal)" />
          <path d="M24 19 V29 M19 24 H29" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <path d="M9 15 H16 M32 15 H39 M9 33 H16 M32 33 H39" stroke="#9adfff" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {kind === "summon" && (
        <g stroke="#120e1a" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="14" y="26" width="20" height="13" rx="2" fill="#5e6b85" />
          <rect x="18" y="16" width="12" height="11" rx="2" fill="#eab308" />
          <rect x="26" y="18" width="14" height="5" rx="1.5" fill="url(#skBlade)" />
          <circle cx="41" cy="20.5" r="3" fill="#ff7b29" stroke="none" />
        </g>
      )}

      {kind === "hp" && (
        <g stroke="#140c14" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="20" y="8" width="8" height="5" rx="1" fill="#d4a44c" />
          <path d="M19 13 H29 L31 19 C36 22, 37 29, 34 35 C32 39, 28 41, 24 41 C20 41, 16 39, 14 35 C11 29, 12 22, 17 19 Z" fill="#2a1622" />
          <path d="M14.5 27 C18 25, 30 29, 33.5 27 C34.5 32, 31.5 39, 24 39 C16.5 39, 13.5 32, 14.5 27 Z" fill="url(#crimson)" stroke="none" />
          <ellipse cx="19" cy="25" rx="2" ry="4" transform="rotate(-20 19 25)" fill="#ffffff" opacity="0.55" stroke="none" />
        </g>
      )}

      {kind === "mp" && (
        <g stroke="#0e1222" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="20" y="8" width="8" height="5" rx="1" fill="#d4a44c" />
          <path d="M19 13 H29 L31 19 C36 22, 37 29, 34 35 C32 39, 28 41, 24 41 C20 41, 16 39, 14 35 C11 29, 12 22, 17 19 Z" fill="#141e38" />
          <path d="M14.5 27 C18 25, 30 29, 33.5 27 C34.5 32, 31.5 39, 24 39 C16.5 39, 13.5 32, 14.5 27 Z" fill="url(#skMana)" stroke="none" />
          <ellipse cx="19" cy="25" rx="2" ry="4" transform="rotate(-20 19 25)" fill="#ffffff" opacity="0.55" stroke="none" />
        </g>
      )}

      {kind === "passive" && (
        <g stroke="#140f1d" strokeWidth="1.6" strokeLinejoin="round">
          <polygon points="24,8 37,24 24,40 11,24" fill="url(#goldg)" />
          <polygon points="24,14 32,24 24,34 16,24" fill="url(#skMana)" />
        </g>
      )}
    </svg>
  );
}

/** 四维属性小徽标 */
export function StatBadge({ stat }: { stat: StatKey }) {
  const map: Record<StatKey, { color: string; glyph: string }> = {
    str: { color: "#ff785a", glyph: "⚔" },
    vit: { color: "#4ade80", glyph: "♥" },
    mag: { color: "#60a5fa", glyph: "✦" },
    agi: { color: "#fbbf24", glyph: "⚡" },
  };
  const { color, glyph } = map[stat];
  return (
    <span className="stat-glyph" style={{ color, borderColor: `${color}55`, background: `${color}16` }}>
      {glyph}
    </span>
  );
}
