// 动态光照: 离屏暗幕 + destination-out 挖光洞, 叠回主画布。
// 暖色光源额外叠加 lighter 色温层。

export interface Light {
  x: number;
  y: number;
  radius: number;
  intensity?: number; // 挖洞强度 0~1, 默认 1
  flicker?: boolean; // 火光呼吸
  warm?: string; // 色温叠色(如 "255,140,60")
}

let buf: HTMLCanvasElement | null = null;

function getBuf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (!buf) buf = document.createElement("canvas");
  if (buf.width !== w || buf.height !== h) {
    buf.width = w;
    buf.height = h;
  }
  return [buf, buf.getContext("2d")!];
}

export function drawLighting(
  ctx: CanvasRenderingContext2D, w: number, h: number, lights: Light[], time: number,
  ambient = "rgba(6,5,14,0.86)",
): void {
  const [cv, bctx] = getBuf(w, h);
  // 环境暗幕
  bctx.globalCompositeOperation = "source-over";
  bctx.clearRect(0, 0, w, h);
  bctx.fillStyle = ambient;
  bctx.fillRect(0, 0, w, h);

  // 挖光洞
  bctx.globalCompositeOperation = "destination-out";
  for (const l of lights) {
    const r = l.flicker
      ? l.radius * (1 + 0.05 * Math.sin(time * 7.3 + l.x) + 0.03 * Math.sin(time * 13.7 + l.y))
      : l.radius;
    const g = bctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    const i = l.intensity ?? 1;
    g.addColorStop(0, `rgba(0,0,0,${i})`);
    g.addColorStop(0.55, `rgba(0,0,0,${i * 0.75})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    bctx.fillStyle = g;
    bctx.beginPath();
    bctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    bctx.fill();
  }

  // 暗幕叠回主画布
  ctx.drawImage(cv, 0, 0);

  // 暖色色温层
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const l of lights) {
    if (!l.warm) continue;
    const r = l.flicker
      ? l.radius * (1 + 0.05 * Math.sin(time * 7.3 + l.x))
      : l.radius;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * 0.8);
    g.addColorStop(0, `rgba(${l.warm},0.24)`);
    g.addColorStop(1, `rgba(${l.warm},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 屏幕暗角(氛围) */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
