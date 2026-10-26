import type { RefObject } from "react";

/** 仅触屏设备渲染。D-pad 写入 App 的 keysDown 集合(复用按住连走 tick), 中心键交互。 */
export function TouchControls({ keysDown, onInteract, onToggleInv }: {
  keysDown: RefObject<Set<string>>;
  onInteract: () => void;
  onToggleInv: () => void;
}) {
  const hold = (dir: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 合成事件无活动指针, 忽略 */ }
      keysDown.current?.add(dir);
    },
    onPointerUp: () => keysDown.current?.delete(dir),
    onPointerCancel: () => keysDown.current?.delete(dir),
    onPointerLeave: () => keysDown.current?.delete(dir),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const cls = "tc-key";
  return (
    <div className="touch-controls">
      <div className="tc-dpad" onContextMenu={(e) => e.preventDefault()}>
        <button className={`${cls} tc-up`} {...hold("w")}>▲</button>
        <button className={`${cls} tc-left`} {...hold("a")}>◀</button>
        <button className={`${cls} tc-center`} {...tap(onInteract)}>✋</button>
        <button className={`${cls} tc-right`} {...hold("d")}>▶</button>
        <button className={`${cls} tc-down`} {...hold("s")}>▼</button>
      </div>
      <div className="tc-side">
        <button className={`${cls} tc-inv`} {...tap(onToggleInv)}>背包</button>
      </div>
    </div>
  );
}
