import { useRef } from "react";
import type { RefObject } from "react";

/** 仅触屏设备渲染。左下虚拟摇杆(写 App 的 keysDown 集合, 复用连走 tick), 右下交互/背包钮。
 *  打开面板的按钮必须用 onClick(pointerup 后)触发 —— 用 pointerdown 会在面板渲染盖住
 *  按钮后, 把 click 落到遮罩上触发"点背景关闭", 造成面板一闪而过。 */
export function TouchControls({ keysDown, onInteract, onToggleInv }: {
  keysDown: RefObject<Set<string>>;
  onInteract: () => void;
  onToggleInv: () => void;
}) {
  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);

  const clearDirs = () => {
    const k = keysDown.current;
    if (k) for (const c of ["w", "a", "s", "d"]) k.delete(c);
  };
  const applyDir = (dx: number, dy: number) => {
    const k = keysDown.current;
    if (!k) return;
    clearDirs();
    const TH = 0.32;
    if (dy < -TH) k.add("w");
    if (dy > TH) k.add("s");
    if (dx < -TH) k.add("a");
    if (dx > TH) k.add("d");
  };
  const knobTo = (dx: number, dy: number) => {
    const knob = knobRef.current;
    const base = joyRef.current;
    if (!knob || !base) return;
    const r = base.getBoundingClientRect();
    const max = r.width / 2 - 26;
    knob.style.transform = `translate(calc(-50% + ${dx * max}px), calc(-50% + ${dy * max}px))`;
  };
  const track = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    const base = joyRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    if (r.width < 4) return; // 未显示(隐藏/收起)时不采样, 防除零
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    applyDir(dx, dy);
    knobTo(dx, dy);
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    activeId.current = e.pointerId;
    try { joyRef.current?.setPointerCapture(e.pointerId); } catch { /* 合成事件忽略 */ }
    track(e);
  };
  const onUp = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    clearDirs();
    knobTo(0, 0);
  };
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="touch-controls">
      <div
        className="tc-joy"
        ref={joyRef}
        onPointerDown={onDown}
        onPointerMove={track}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={stop}
      >
        <div className="tc-knob" ref={knobRef} />
      </div>
      <div className="tc-side" onContextMenu={stop}>
        <button className="tc-key tc-round" onClick={(e) => { e.stopPropagation(); onInteract(); }}>✋</button>
        <button className="tc-key tc-round" onClick={(e) => { e.stopPropagation(); onToggleInv(); }}>包</button>
      </div>
    </div>
  );
}
