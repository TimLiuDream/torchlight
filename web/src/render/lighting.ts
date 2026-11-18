// 动态柔和光照: 离屏暗幕(按逻辑分辨率烘焙, 自动适配高分屏缩放) + destination-out 挖光洞 + 暖光辉光层。

export interface Light {
  x: number;
  y: number;
  radius: number;
  intensity?: number;
  flicker?: boolean;
  warm?: string; // RGB 字符串, 如 "255,150,60"
}

let buf: HTMLCanvasElement | null = null;

function getBuf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const bw = Math.max(1, Math.round(w));
  const bh = Math.max(1, Math.round(h));
  if (!buf) buf = document.createElement("canvas");
  if (buf.width !== bw || buf.height !== bh) {
    buf.width = bw;
    buf.height = bh;
  }
  return [buf, buf.getContext("2d")!];
}

export function drawLighting(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lights: Light[],
  time: number,
  ambient = "rgba(6, 5, 14, 0.84)",
): void {
  const [cv, bctx] = getBuf(w, h);
  bctx.globalCompositeOperation = "source-over";
  bctx.clearRect(0, 0, cv.width, cv.height);
  bctx.fillStyle = ambient;
  bctx.fillRect(0, 0, cv.width, cv.height);

  bctx.globalCompositeOperation = "destination-out";
  for (const l of lights) {
    const r = l.flicker
      ? l.radius * (1 + 0.045 * Math.sin(time * 6.8 + l.x) + 0.025 * Math.sin(time * 12.3 + l.y))
      : l.radius;
    const g = bctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    const i = l.intensity ?? 1;
    g.addColorStop(0, `rgba(0,0,0,${i})`);
    g.addColorStop(0.5, `rgba(0,0,0,${i * 0.72})`);
    g.addColorStop(0.82, `rgba(0,0,0,${i * 0.24})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    bctx.fillStyle = g;
    bctx.beginPath();
    bctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    bctx.fill();
  }

  ctx.drawImage(cv, 0, 0, w, h);

  // 暖色大气辉光叠层
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const l of lights) {
    if (!l.warm) continue;
    const r = l.flicker
      ? l.radius * (1 + 0.045 * Math.sin(time * 6.8 + l.x))
      : l.radius;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * 0.82);
    g.addColorStop(0, `rgba(${l.warm}, 0.22)`);
    g.addColorStop(0.55, `rgba(${l.warm}, 0.08)`);
    g.addColorStop(1, `rgba(${l.warm}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 电影感柔和暗角 */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.56);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.7, "rgba(4,3,10,0.22)");
  g.addColorStop(1, "rgba(3,2,8,0.68)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
