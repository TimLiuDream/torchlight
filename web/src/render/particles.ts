// 粒子系统: 纯数据单例, 逻辑层可直接发射; 绘制由 renderer 调 draw()。
// 坐标为画布像素坐标(发射时换算), 生命短暂故不追踪相机。

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
}

const particles: Particle[] = [];
const rings: Ring[] = [];
const MAX_PARTICLES = 600;

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
  const { colors = ["#ffffff"], count = 14, speed = 130, life = 0.5, size = 3, gravity = 220, glow = true } = opts;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(speed * 0.35, speed);
    push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.25,
      life: rand(life * 0.6, life),
      maxLife: life,
      size: rand(size * 0.6, size * 1.4),
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity, drag: 2.2, glow,
    });
  }
}

/** 命中火花(白+红) */
export function hit(x: number, y: number): void {
  burst(x, y, { colors: ["#ffffff", "#ffd2a0", "#ff7a55"], count: 10, speed: 150, life: 0.35, size: 2.5 });
}

/** 暴击: 金色大爆 + 冲击环 */
export function crit(x: number, y: number): void {
  burst(x, y, { colors: ["#fff3b0", "#ffd23e", "#ff9b3e"], count: 22, speed: 240, life: 0.6, size: 3.5, gravity: 160 });
  rings.push({ x, y, r: 4, maxR: 46, life: 0.32, maxLife: 0.32, color: "#ffd23e", width: 3 });
}

/** 治疗上升绿粒 */
export function heal(x: number, y: number): void {
  for (let i = 0; i < 8; i++) {
    push({
      x: x + rand(-14, 14), y: y + rand(-4, 8),
      vx: rand(-8, 8), vy: rand(-55, -30),
      life: rand(0.5, 0.9), maxLife: 0.9,
      size: rand(2, 3.5), color: "#4ade80",
      gravity: -20, drag: 1, glow: true,
    });
  }
}

/** 法师火焰喷射: 定向火粒 */
export function flame(fromX: number, fromY: number, toX: number, toY: number): void {
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const jitter = rand(-7, 7);
    push({
      x: fromX + dx * t + jitter, y: fromY + dy * t + jitter * 0.6,
      vx: dx / len * rand(30, 70) + rand(-15, 15),
      vy: dy / len * rand(30, 70) + rand(-25, -5),
      life: rand(0.25, 0.5), maxLife: 0.5,
      size: rand(3, 5.5),
      color: ["#fff3b0", "#ffb347", "#ff6b35", "#ff4b2e"][Math.floor(Math.random() * 4)],
      gravity: -60, drag: 1.6, glow: true,
    });
  }
}

/** 狂战士旋风弧光 */
export function whirl(x: number, y: number): void {
  rings.push({ x, y, r: 8, maxR: 40, life: 0.25, maxLife: 0.25, color: "#e8e8ff", width: 2 });
  burst(x, y, { colors: ["#ffffff", "#c8d8ff"], count: 8, speed: 190, life: 0.3, size: 2.5, gravity: 0 });
}

/** 工程师修理电花 */
export function repairSpark(x: number, y: number): void {
  burst(x, y, { colors: ["#7ae0ff", "#ffffff"], count: 10, speed: 120, life: 0.4, size: 2.2, gravity: 120 });
}

/** 掉落光柱: 金色竖光 + 上升光点 */
export function lootBeam(x: number, y: number): void {
  rings.push({ x, y, r: 2, maxR: 26, life: 0.5, maxLife: 0.5, color: "#ffd23e", width: 2 });
  for (let i = 0; i < 14; i++) {
    push({
      x: x + rand(-8, 8), y: y + rand(-2, 2),
      vx: rand(-6, 6), vy: rand(-90, -50),
      life: rand(0.6, 1.1), maxLife: 1.1,
      size: rand(2, 4), color: i % 3 ? "#ffd23e" : "#fff3b0",
      gravity: -30, drag: 0.6, glow: true,
    });
  }
}

/** 升级金色喷泉 */
export function levelUp(x: number, y: number): void {
  rings.push({ x, y, r: 6, maxR: 52, life: 0.5, maxLife: 0.5, color: "#ffd23e", width: 3 });
  burst(x, y, { colors: ["#ffd23e", "#fff3b0", "#ffec8a"], count: 26, speed: 200, life: 0.9, size: 3, gravity: 240 });
}

/** 篝火常驻火星(每帧调用, 低概率发射) */
export function campfireTick(sx: number, sy: number, dt: number): void {
  if (Math.random() < dt * 22) {
    push({
      x: sx + rand(-6, 6), y: sy - rand(4, 14),
      vx: rand(-10, 10), vy: rand(-40, -20),
      life: rand(0.5, 1.2), maxLife: 1.2,
      size: rand(1.5, 3),
      color: ["#ffb347", "#ff7a2e", "#ffd23e"][Math.floor(Math.random() * 3)],
      gravity: -14, drag: 0.8, glow: true,
    });
  }
}

/** 传送门魔法粒 */
export function portalTick(sx: number, sy: number, dt: number): void {
  if (Math.random() < dt * 14) {
    const a = rand(0, Math.PI * 2);
    push({
      x: sx + Math.cos(a) * 14, y: sy + Math.sin(a) * 7,
      vx: -Math.cos(a) * 18, vy: -Math.sin(a) * 9,
      life: rand(0.4, 0.8), maxLife: 0.8,
      size: rand(1.5, 2.5), color: "#b28cff",
      gravity: 0, drag: 0, glow: true,
    });
  }
}

/** 环境悬浮尘埃: 极慢漂移, 靠光照显形 */
export function dust(sx: number, sy: number): void {
  push({
    x: sx + rand(-40, 40), y: sy + rand(-40, 40),
    vx: rand(4, 14), vy: rand(-8, -2),
    life: rand(1.5, 3), maxLife: 3,
    size: rand(0.8, 1.6), color: "#cfd6f0",
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
    r.r += (r.maxR - r.r) * Math.min(1, dt * 12);
  }
}

export function drawFx(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const r of rings) {
    const a = r.life / r.maxLife;
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * a;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r, r.r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function clearFx(): void {
  particles.length = 0;
  rings.length = 0;
}
