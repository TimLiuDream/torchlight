// 高清暗黑手绘贴图加载器 (Vite ?url eager glob)。
// 包含: 标题横幅、3 套地牢主题战斗背景、3 职业立绘/全身像、10 种怪物与首领全身像。

const urls = import.meta.glob<string>("../assets/hd/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const imgs = new Map<string, HTMLImageElement>();
const urlMap = new Map<string, string>();

let pending = 0;
const listeners = new Set<() => void>();

function notifyAll() {
  for (const fn of listeners) fn();
}

for (const [path, url] of Object.entries(urls)) {
  const key = path.split("/").pop()!.replace(/\.webp$/, "");
  urlMap.set(key, url);
  const img = new Image();
  pending++;
  const done = () => {
    if (--pending <= 0) notifyAll();
  };
  img.onload = done;
  img.onerror = done;
  img.src = url;
  imgs.set(key, img);
}

/** 订阅高清资源加载完成(若已就绪则立即异步触发一次) */
export function onHdReady(cb: () => void): () => void {
  listeners.add(cb);
  if (pending <= 0) queueMicrotask(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 获取已解码完成的 HTMLImageElement (Canvas 绘制用) */
export function hdImg(key: string): HTMLImageElement | undefined {
  const img = imgs.get(key);
  return img && img.complete && img.naturalWidth > 0 ? img : undefined;
}

/** 获取贴图原始 URL (React <img> / CSS background 用) */
export function hdUrl(key: string): string | undefined {
  return urlMap.get(key);
}

/** 怪物 body key -> 高清贴图名映射 */
export function monsterHdKey(body: string): string {
  return `mon_${body}`;
}
