// 高清发光粒子与刀光/冲击波系统。
// 支持: 柔和辉光粒子、椭圆能量扩散环、弯月刀光斩击弧、陨石/光束拖尾。

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  glow: boolean;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
  squash?: number; // 1=正圆, 0.52=地面透视椭圆
}

export interface SlashArc {
  x: number;
  y: number;
  radius: number;
  angle: number; // 中心弧度
  sweep: number; // 张角弧度
  life: number;
  maxLife: number;
  color: string;
  coreColor: string;
  thickness: number;
}

const particles: Particle[] = [];
const rings: Ring[] = [];
const slashes: SlashArc[] = [];
const MAX_PARTICLES = 700;

function push(p: Particle): void {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push(p);
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** 通用圆形迸射 */
export function burst(x: number, y: number, opts: {
  colors?: string[];
  count?: number;
  speed?: number;
  life?: number;
  size?: number;
  gravity?: number;
  glow?: boolean;
} = {}): void {
  const { colors = ["#ffffff"], count = 16, speed = 150, life = 0.52, size = 3.4, gravity = 220, glow = true } = opts;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(speed * 0.35, speed);
    push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.24,
      life: rand(life * 0.6, life),
      maxLife: life,
      size: rand(size * 0.65, size * 1.45),
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity,
      drag: 2.1,
      glow,
    });
  }
}

/** 弯月刀光斩击弧 */
export function slash(
  x: number, y: number,
  opts: { radius?: number; angle?: number; sweep?: number; color?: string; coreColor?: string; thickness?: number; life?: number } = {},
): void {
  const {
    radius = 58,
    angle = -0.35,
    sweep = 2.1,
    color = "#ff9f43",
    coreColor = "#fff9e6",
    thickness = 12,
    life = 0.24,
  } = opts;
  slashes.push({ x, y, radius, angle, sweep, life, maxLife: life, color, coreColor, thickness });
}

/** 普攻命中: 凌厉银白/暖金刀光 + 火星迸射 */
export function hit(x: number, y: number): void {
  slash(x - 8, y, {
    radius: rand(44, 58),
    angle: rand(-0.65, 0.25),
    sweep: 1.9,
    color: "#ffb36b",
    coreColor: "#ffffff",
    thickness: 10,
    life: 0.22,
  });
  burst(x, y, { colors: ["#ffffff", "#ffe2b0", "#ff7a55"], count: 14, speed: 175, life: 0.38, size: 3 });
}

/** 暴击: 双重交叉金色烈焰刀光 + 冲击光环 + 大量金火粒子 */
export function crit(x: number, y: number): void {
  slash(x, y, { radius: 74, angle: -0.55, sweep: 2.4, color: "#ff8c24", coreColor: "#fffbe0", thickness: 15, life: 0.3 });
  slash(x, y, { radius: 62, angle: 0.65, sweep: 2.1, color: "#ffd23e", coreColor: "#ffffff", thickness: 11, life: 0.28 });
  burst(x, y, { colors: ["#fff9d6", "#ffd23e", "#ff8c2e", "#ff5232"], count: 30, speed: 270, life: 0.65, size: 4.2, gravity: 150 });
  rings.push({ x, y, r: 6, maxR: 68, life: 0.36, maxLife: 0.36, color: "#ffd23e", width: 4, squash: 0.9 });
}

/** 治疗光晕与上升翠绿光尘 */
export function heal(x: number, y: number): void {
  rings.push({ x, y: y + 36, r: 8, maxR: 48, life: 0.48, maxLife: 0.48, color: "#34d399", width: 2.8, squash: 0.45 });
  for (let i = 0; i < 14; i++) {
    push({
      x: x + rand(-22, 22), y: y + rand(-6, 24),
      vx: rand(-10, 10), vy: rand(-75, -36),
      life: rand(0.55, 1.0), maxLife: 1.0,
      size: rand(2.4, 4.4), color: i % 3 === 0 ? "#d1fae5" : "#4ade80",
      gravity: -25, drag: 1, glow: true,
    });
  }
}

/** 法师火焰技能: 炽热火龙轨迹 + 爆燃火环 */
export function flame(fromX: number, fromY: number, toX: number, toY: number): void {
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 0; i < 28; i++) {
    const t = i / 28;
    const jitter = rand(-9, 9);
    push({
      x: fromX + dx * t + jitter,
      y: fromY + dy * t + jitter * 0.6,
      vx: (dx / len) * rand(40, 110) + rand(-20, 20),
      vy: (dy / len) * rand(40, 110) + rand(-35, -5),
      life: rand(0.3, 0.58),
      maxLife: 0.58,
      size: rand(3.8, 7.2),
      color: ["#ffffff", "#fff3b0", "#ff9f1c", "#ff5424"][Math.floor(Math.random() * 4)],
      gravity: -70, drag: 1.5, glow: true,
    });
  }
  rings.push({ x: toX, y: toY, r: 8, maxR: 76, life: 0.38, maxLife: 0.38, color: "#ff6b2b", width: 4.5, squash: 0.85 });
}

/** 流星火雨 / 全屏轰击特效 */
export function meteorRain(cx: number, cy: number): void {
  for (let m = 0; m < 4; m++) {
    const tx = cx + (m - 1.5) * 65 + rand(-14, 14);
    const ty = cy + rand(-16, 18);
    flame(tx - 90, ty - 190, tx, ty);
  }
}

/** 狂战士旋风弧光 (blood=true 为嗜血旋风) */
export function whirl(x: number, y: number, blood = false): void {
  const c1 = blood ? "#ff2e4c" : "#cfe4ff";
  const c2 = blood ? "#ffd1d9" : "#ffffff";
  slash(x, y, { radius: 68, angle: 0.2, sweep: 2.8, color: c1, coreColor: c2, thickness: 14, life: 0.28 });
  slash(x, y, { radius: 54, angle: 3.3, sweep: 2.6, color: c1, coreColor: c2, thickness: 11, life: 0.28 });
  rings.push({ x, y: y + 24, r: 12, maxR: 72, life: 0.32, maxLife: 0.32, color: c1, width: 3.5, squash: 0.45 });
  burst(x, y, { colors: [c2, c1, blood ? "#ff758f" : "#ffd23e"], count: 18, speed: 220, life: 0.38, size: 3.4, gravity: 20 });
}

/** 工程师电弧与炮台轰击 */
export function repairSpark(x: number, y: number): void {
  rings.push({ x, y, r: 6, maxR: 50, life: 0.35, maxLife: 0.35, color: "#38bdf8", width: 3, squash: 0.9 });
  burst(x, y, { colors: ["#e0f2fe", "#38bdf8", "#fbbf24"], count: 16, speed: 150, life: 0.44, size: 2.8, gravity: 100 });
}

/** 掉落光柱: 暗黑系金色冲天光柱 + 地面光环 */
export function lootBeam(x: number, y: number): void {
  rings.push({ x, y, r: 3, maxR: 34, life: 0.6, maxLife: 0.6, color: "#ffd23e", width: 2.6, squash: 0.5 });
  for (let i = 0; i < 18; i++) {
    push({
      x: x + rand(-8, 8), y: y + rand(-2, 2),
      vx: rand(-6, 6), vy: rand(-115, -55),
      life: rand(0.65, 1.2), maxLife: 1.2,
      size: rand(2.2, 4.5), color: i % 3 ? "#ffd23e" : "#fff8d6",
      gravity: -35, drag: 0.6, glow: true,
    });
  }
}

/** 升级圣光喷泉 */
export function levelUp(x: number, y: number): void {
  rings.push({ x, y: y + 18, r: 8, maxR: 68, life: 0.6, maxLife: 0.6, color: "#ffd23e", width: 4, squash: 0.5 });
  burst(x, y, { colors: ["#ffd23e", "#fff8d6", "#ffae34"], count: 32, speed: 220, life: 0.95, size: 3.6, gravity: 230 });
  for (let i = 0; i < 16; i++) {
    push({
      x: x + rand(-12, 12), y: y + rand(-4, 6),
      vx: rand(-8, 8), vy: rand(-230, -140),
      life: rand(0.55, 0.95), maxLife: 0.95,
      size: rand(2.4, 4), color: i % 2 ? "#ffe98a" : "#ffffff",
      gravity: -30, drag: 0.4, glow: true,
    });
  }
}

/** 篝火/火把常驻火星 */
export function campfireTick(sx: number, sy: number, dt: number): void {
  if (Math.random() < dt * 24) {
    push({
      x: sx + rand(-6, 6), y: sy - rand(2, 12),
      vx: rand(-12, 12), vy: rand(-48, -22),
      life: rand(0.5, 1.2), maxLife: 1.2,
      size: rand(1.6, 3.2),
      color: ["#ffb347", "#ff6b2b", "#ffe38a"][Math.floor(Math.random() * 3)],
      gravity: -16, drag: 0.8, glow: true,
    });
  }
}

/** 传送门奥术微粒 */
export function portalTick(sx: number, sy: number, dt: number): void {
  if (Math.random() < dt * 16) {
    const a = rand(0, Math.PI * 2);
    push({
      x: sx + Math.cos(a) * 17, y: sy + Math.sin(a) * 10,
      vx: -Math.cos(a) * 20, vy: -Math.sin(a) * 12 - 8,
      life: rand(0.45, 0.85), maxLife: 0.85,
      size: rand(1.6, 3), color: Math.random() < 0.35 ? "#ffd27d" : "#c084fc",
      gravity: 0, drag: 0, glow: true,
    });
  }
}

/** 精英/首领光环微粒 */
export function orbitTick(x: number, y: number, radius: number, seed: number, dt: number, color = "#c9a0ff"): void {
  if (Math.random() < dt * 10) {
    const a = Math.random() * Math.PI * 2 + seed;
    push({
      x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius * 0.45,
      vx: -Math.sin(a) * 22, vy: -10,
      life: rand(0.4, 0.68), maxLife: 0.68,
      size: rand(1.5, 2.6), color,
      gravity: 0, drag: 0, glow: true,
    });
  }
}

/** 环境悬浮微尘/孢子/余烬 */
export function dust(sx: number, sy: number, color = "#cfd6f0"): void {
  push({
    x: sx + rand(-40, 40), y: sy + rand(-40, 40),
    vx: rand(4, 16), vy: rand(-12, -3),
    life: rand(1.6, 3.2), maxLife: 3.2,
    size: rand(1.0, 2.2), color,
    gravity: 0, drag: 0, glow: true,
  });
}

export function updateFx(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += p.gravity * dt;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d;
    p.vy *= d;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    if (r.life <= 0) { rings.splice(i, 1); continue; }
    r.r += (r.maxR - r.r) * Math.min(1, dt * 11);
  }
  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i];
    s.life -= dt;
    if (s.life <= 0) slashes.splice(i, 1);
  }
}

export function drawFx(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // 1) 柔和发光粒子
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    const rad = p.size * (0.55 + a * 0.55);
    if (p.glow && rad > 1.8) {
      ctx.globalAlpha = a * 0.34;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2) 能量冲击环
  for (const r of rings) {
    const a = Math.max(0, r.life / r.maxLife);
    const sq = r.squash ?? 0.55;
    ctx.globalAlpha = a * 0.88;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(1, r.width * a);
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r, r.r * sq, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3) 弯月刀光斩击弧(分段锥形弧带: 外层彩光 + 内核高光)
  for (const s of slashes) {
    const t = 1 - s.life / s.maxLife; // 0 -> 1
    const alpha = Math.sin(Math.min(1, s.life / s.maxLife) * Math.PI * 0.5);
    const curStart = s.angle - s.sweep * 0.5 + t * s.sweep * 0.28;
    const curEnd = s.angle + s.sweep * 0.5 + t * s.sweep * 0.12;
    const segs = 14;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? s.color : s.coreColor;
      ctx.lineCap = "round";
      for (let i = 0; i < segs; i++) {
        const u0 = i / segs;
        const u1 = (i + 1) / segs;
        const um = (u0 + u1) * 0.5;
        const taper = Math.sin(um * Math.PI);
        ctx.globalAlpha = alpha * (pass === 0 ? 0.85 : 0.95) * taper;
        ctx.lineWidth = Math.max(1, s.thickness * taper * (pass === 0 ? 1 : 0.42) * alpha);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius + t * 8, curStart + (curEnd - curStart) * u0, curStart + (curEnd - curStart) * u1);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

export function clearFx(): void {
  particles.length = 0;
  rings.length = 0;
  slashes.length = 0;
}
