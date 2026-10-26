// 0x72 "16x16 DungeonTileset II" v1.3 贴图加载器 —— CC0 1.0, 无需署名。
// 来源: https://0x72.itch.io/dungeontileset-ii (recolored by GrafxKid)。
// 启动时 eager 加载全部 PNG 的 URL 并预热 Image 对象; tex(key) 同步取帧。

// Vite6 eager ?url glob: 每项直接是 URL 字符串
const urls = import.meta.glob<string>("../assets/0x72/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const imgs = new Map<string, HTMLImageElement>();

let pending = 0;
let notifyReady: (() => void) | null = null;
/** 全部贴图加载完成后 resolve(组件可 await 后重绘) */
export const texReady = new Promise<void>((resolve) => { notifyReady = resolve; });

for (const [path, url] of Object.entries(urls)) {
  const key = path.split("/").pop()!.replace(/\.png$/, "");
  const img = new Image();
  pending++;
  img.onload = () => {
    if (--pending === 0 && notifyReady) notifyReady();
  };
  img.onerror = () => {
    if (--pending === 0 && notifyReady) notifyReady();
  };
  img.src = url;
  imgs.set(key, img);
}

/** 取贴图帧。帧名如 "goblin_idle_anim_f0" / "floor_1" / "wall_mid"。未加载完/不存在返回 undefined。 */
export function tex(key: string): HTMLImageElement | undefined {
  const img = imgs.get(key);
  return img && img.complete && img.naturalWidth > 0 ? img : undefined;
}

/** 按动画基名与相位取帧: frame("goblin_idle", 2) -> "goblin_idle_anim_f2" */
export function frame(base: string, i: number): HTMLImageElement | undefined {
  return tex(`${base}_anim_f${((i % 4) + 4) % 4}`);
}

/** 帧尺寸换算: 0x72 帧 16~32px, 统一放大到世界尺寸 */
export const TEX_SCALE = 3;
