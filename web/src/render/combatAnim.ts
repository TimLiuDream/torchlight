// 战斗骨骼切片木偶变形 (Sliced Puppet Rig) + 冲刺残影 + 飞行弹道 + 镜头推拉特写系统。
import { hdImg, monsterCombatFlip } from "./hdAssets";
import * as fx from "./particles";
import type { SkillKind } from "../game/types";

export interface RigPose {
  ox: number;       // 水平位移 px (冲刺/受击击退)
  oy: number;       // 垂直跳跃位移 px (负值向上)
  bend: number;     // 上半身骨骼弯曲甩动 px (脚底固定, 往头顶递增)
  squash: number;   // 挤压拉伸 (-0.2 蓄力下蹲 ~ +0.2 腾空拉伸)
  flash: number;    // 受击高亮剩余秒
  flashTint: "white" | "crimson";
}

interface Afterimage {
  key: string;
  x: number;
  y: number;
  h: number;
  flipX: number;
  bend: number;
  tint: string;
  life: number;
  maxLife: number;
}

export type ProjectileKind = "fireball" | "pyroclasm" | "meteor" | "arrow" | "soulorb" | "acid" | "plasma" | "shockwave";

interface Projectile {
  kind: ProjectileKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  arcH: number;     // 抛物线拱高 (0 为直线)
  t: number;
  dur: number;
  delay: number;    // 多发弹幕错峰延迟
  impacted: boolean;
  onArrive?: () => void;
}

interface SpellCircle {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
}

interface TurretProp {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  recoil: number;
}

interface ActiveTimeline {
  actor: "hero" | number;
  t: number;
  dur: number;
  impactAt: number;
  impacted: boolean;
  onImpact?: () => void;
  onDone?: () => void;
  update: (p: number, dt: number) => void;
}

// ---------------- 模块级实时动画状态 ----------------
const heroPose: RigPose = { ox: 0, oy: 0, bend: 0, squash: 0, flash: 0, flashTint: "crimson" };
const monPoses = new Map<number, RigPose>();
const afterimages: Afterimage[] = [];
const projectiles: Projectile[] = [];
const circles: SpellCircle[] = [];
let turret: TurretProp | null = null;
const timelines: ActiveTimeline[] = [];

// 镜头特写推拉与受击血雾暗角
let zoomTarget = 1;
let zoomCur = 1;
let zoomFocusX = 440;
let zoomFocusY = 260;
let zoomHold = 0;
let bloodVignette = 0; // 玩家受击红屏边缘 0~1

export function resetCombatAnim(): void {
  heroPose.ox = 0; heroPose.oy = 0; heroPose.bend = 0; heroPose.squash = 0; heroPose.flash = 0;
  monPoses.clear();
  afterimages.length = 0;
  projectiles.length = 0;
  circles.length = 0;
  turret = null;
  timelines.length = 0;
  zoomTarget = 1;
  zoomCur = 1;
  zoomHold = 0;
  bloodVignette = 0;
}

export function getHeroPose(): RigPose {
  return heroPose;
}

export function getMonPose(id: number): RigPose {
  let p = monPoses.get(id);
  if (!p) {
    p = { ox: 0, oy: 0, bend: 0, squash: 0, flash: 0, flashTint: "white" };
    monPoses.set(id, p);
  }
  return p;
}

export function getCombatCamera(): { zoom: number; fx: number; fy: number; blood: number } {
  return { zoom: zoomCur, fx: zoomFocusX, fy: zoomFocusY, blood: bloodVignette };
}

export function punchZoom(focusX: number, focusY: number, amount = 1.07, hold = 0.16): void {
  zoomFocusX = focusX;
  zoomFocusY = focusY;
  zoomTarget = Math.max(zoomTarget, amount);
  zoomHold = Math.max(zoomHold, hold);
}

/** 触发怪物受击形变与击退 */
export function triggerMonsterHit(monId: number, heavy = false): void {
  const p = getMonPose(monId);
  p.flash = heavy ? 0.28 : 0.2;
  p.flashTint = "white";
  p.ox = heavy ? 26 : 16;
  p.bend = heavy ? 27 : 18;
  p.squash = -0.12;
}

/** 触发英雄受击形变、血色利爪特效与红屏震颤 */
export function triggerHeroHit(heroX: number, heroY: number, heavy = false): void {
  heroPose.flash = 0.26;
  heroPose.flashTint = "crimson";
  heroPose.ox = heavy ? -22 : -15;
  heroPose.bend = heavy ? -25 : -17;
  heroPose.squash = -0.1;
  bloodVignette = heavy ? 0.85 : 0.58;

  // 三道猩红撕裂爪痕 / 重击斩痕
  fx.slash(heroX + 8, heroY, {
    radius: 52, angle: 2.5, sweep: 1.7, color: "#ef4444", coreColor: "#fecaca", thickness: 9, life: 0.24,
  });
  fx.slash(heroX - 6, heroY + 12, {
    radius: 46, angle: 2.55, sweep: 1.6, color: "#dc2626", coreColor: "#fee2e2", thickness: 7, life: 0.22,
  });
  fx.burst(heroX, heroY, {
    colors: ["#ff4b4b", "#fca5a5", "#ffffff"], count: heavy ? 22 : 14, speed: 190, life: 0.42, size: 3.2,
  });
}

// ================================================================
// 玩家行动编排: 近战冲刺斩击 / 远程吟唱飞行弹道 / 机械无人机与炮台
// ================================================================
export function playHeroAction(opts: {
  cls: string;
  spriteKey: string;
  actionKind: "attack" | "skill" | "potion";
  skillKind?: SkillKind;
  heroBaseX: number;
  heroFootY: number;
  heroH: number;
  targetPos: [number, number];        // 主目标 [tx, ty(胸口)]
  allTargets: Array<[number, number]>; // 全体存活怪 [tx, ty]
  onImpact: () => void;
  onDone: () => void;
}): void {
  const { cls, spriteKey, actionKind, skillKind, heroBaseX, heroFootY, heroH, targetPos, allTargets, onImpact, onDone } = opts;
  const [tx, ty] = targetPos;
  const heroChestY = heroFootY - heroH * 0.52;

  // 1) 喝药水动作: 仰身微跃 + 圣光/奥术法阵
  if (actionKind === "potion") {
    circles.push({ x: heroBaseX, y: heroFootY - 2, r: 46, color: "#34d399", life: 0.5, maxLife: 0.5 });
    timelines.push({
      actor: "hero",
      t: 0,
      dur: 0.48,
      impactAt: 0.17,
      impacted: false,
      onImpact,
      onDone,
      update: (p) => {
        heroPose.oy = -Math.sin(p * Math.PI) * 18;
        heroPose.squash = Math.sin(p * Math.PI) * 0.1;
      },
    });
    return;
  }

  // 判断走近战冲刺还是远程施法/机械弹道
  const isMage = cls === "灰烬法师";
  const isDroneSkill = actionKind === "skill" && (skillKind === "drone" || skillKind === "healBig");
  const isTurretSkill = actionKind === "skill" && skillKind === "summon";
  const isGroundRoar = actionKind === "skill" && cls === "狂战士" && skillKind === "aoe";

  // 2) 灰烬法师 (普攻 & 全部法术): 浮空法阵吟唱 -> 真实飞行火球/炎爆巨球/天降流星雨
  if (isMage) {
    const sk = actionKind === "skill" ? (skillKind ?? "flame") : "bolt";
    circles.push({
      x: heroBaseX,
      y: heroFootY - 2,
      r: actionKind === "skill" ? 56 : 42,
      color: sk === "nova" ? "#ffd23e" : "#ff7b29",
      life: 0.55,
      maxLife: 0.55,
    });

    const castTime = 0.21;
    const flightTime = sk === "nova" ? 0.34 : 0.27;
    let launched = false;

    timelines.push({
      actor: "hero",
      t: 0,
      dur: castTime + flightTime + 0.22,
      impactAt: castTime + flightTime,
      impacted: false,
      onImpact: () => {
        punchZoom((heroBaseX + tx) * 0.5, ty, actionKind === "skill" ? 1.08 : 1.045, 0.18);
        onImpact();
      },
      onDone: () => {
        heroPose.ox = 0; heroPose.oy = 0; heroPose.bend = 0; heroPose.squash = 0;
        onDone();
      },
      update: (p) => {
        const sec = p * (castTime + flightTime + 0.22);
        if (sec < castTime) {
          const u = sec / castTime;
          heroPose.oy = -u * 18;
          heroPose.bend = -u * 20; // 蓄力后仰
        } else {
          if (!launched) {
            launched = true;
            const staffX = heroBaseX + 34;
            const staffY = heroFootY - heroH * 0.72;
            if (sk === "aoe") {
              // 流星火雨: 多颗陨石从左上高空斜砸全体敌人
              const list = allTargets.length ? allTargets : [[tx, ty] as [number, number]];
              list.forEach(([mx, my], idx) => {
                for (let k = 0; k < 2; k++) {
                  projectiles.push({
                    kind: "meteor",
                    x0: mx - 180 + (k - 0.5) * 40,
                    y0: -40 - k * 35,
                    x1: mx + (k - 0.5) * 18,
                    y1: my + 10,
                    arcH: 0,
                    t: 0,
                    dur: flightTime,
                    delay: idx * 0.045 + k * 0.06,
                    impacted: false,
                  });
                }
              });
            } else if (sk === "nova") {
              projectiles.push({
                kind: "pyroclasm",
                x0: staffX, y0: staffY, x1: tx, y1: ty,
                arcH: -22, t: 0, dur: flightTime, delay: 0, impacted: false,
              });
            } else {
              projectiles.push({
                kind: "fireball",
                x0: staffX, y0: staffY, x1: tx, y1: ty,
                arcH: -12, t: 0, dur: flightTime, delay: 0, impacted: false,
              });
              if (sk === "flame") {
                projectiles.push({
                  kind: "fireball",
                  x0: staffX, y0: staffY + 14, x1: tx, y1: ty + 12,
                  arcH: 18, t: 0, dur: flightTime, delay: 0.045, impacted: false,
                });
              }
            }
          }
          const u = Math.min(1, (sec - castTime) / (flightTime + 0.16));
          heroPose.oy = -18 * (1 - u);
          heroPose.bend = 28 * Math.sin(Math.min(1, u * 2.2) * Math.PI) * (1 - u * 0.5); // 挥杖前推
        }
      },
    });
    return;
  }

  // 3) 工程师无人机修复 / 炮台齐射
  if (isDroneSkill || isTurretSkill) {
    circles.push({
      x: heroBaseX,
      y: heroFootY - 2,
      r: 52,
      color: isDroneSkill ? "#34d399" : "#38bdf8",
      life: 0.55,
      maxLife: 0.55,
    });
    if (isTurretSkill) {
      turret = { x: heroBaseX + 68, y: heroFootY + 4, life: 0.65, maxLife: 0.65, recoil: 0 };
    }
    let fired = false;
    timelines.push({
      actor: "hero",
      t: 0,
      dur: 0.72,
      impactAt: 0.43,
      impacted: false,
      onImpact: () => {
        punchZoom((heroBaseX + tx) * 0.5, ty, 1.06, 0.15);
        onImpact();
      },
      onDone: () => {
        heroPose.ox = 0; heroPose.oy = 0; heroPose.bend = 0; heroPose.squash = 0;
        onDone();
      },
      update: (p) => {
        heroPose.bend = Math.sin(p * Math.PI) * 16;
        if (p >= 0.22 && !fired) {
          fired = true;
          const list = isTurretSkill && allTargets.length ? allTargets : [[tx, ty] as [number, number]];
          const fromX = isTurretSkill ? heroBaseX + 86 : heroBaseX + 36;
          const fromY = isTurretSkill ? heroFootY - 22 : heroFootY - heroH - 18;
          list.forEach(([mx, my], idx) => {
            projectiles.push({
              kind: "plasma",
              x0: fromX, y0: fromY, x1: mx, y1: my,
              arcH: -8, t: 0, dur: 0.2, delay: idx * 0.035, impacted: false,
            });
            if (turret) turret.recoil = 1;
          });
        }
      },
    });
    return;
  }

  // 4) 狂战士裂地战吼 (高高跃起砸地 -> 地面震荡波席卷全体敌人)
  if (isGroundRoar) {
    let slammed = false;
    timelines.push({
      actor: "hero",
      t: 0,
      dur: 0.75,
      impactAt: 0.49,
      impacted: false,
      onImpact: () => {
        punchZoom((heroBaseX + tx) * 0.5, heroFootY - 40, 1.08, 0.2);
        onImpact();
      },
      onDone: () => {
        heroPose.ox = 0; heroPose.oy = 0; heroPose.bend = 0; heroPose.squash = 0;
        onDone();
      },
      update: (p) => {
        if (p < 0.22) {
          const u = p / 0.22;
          heroPose.oy = -Math.sin(u * Math.PI * 0.5) * 56;
          heroPose.ox = u * 45;
          heroPose.bend = -18 * u;
        } else if (p < 0.3) {
          const u = (p - 0.22) / 0.08;
          heroPose.oy = -56 * (1 - u);
          heroPose.ox = 45;
          heroPose.bend = 34 * u;
          heroPose.squash = -0.18 * u;
        } else {
          if (!slammed) {
            slammed = true;
            circles.push({ x: heroBaseX + 55, y: heroFootY, r: 75, color: "#ff5c24", life: 0.42, maxLife: 0.42 });
            projectiles.push({
              kind: "shockwave",
              x0: heroBaseX + 60, y0: heroFootY - 8, x1: tx + 90, y1: heroFootY - 8,
              arcH: 0, t: 0, dur: 0.23, delay: 0, impacted: false,
            });
          }
          const u = (p - 0.3) / 0.22;
          heroPose.ox = 45 * (1 - u);
          heroPose.bend = 34 * (1 - u);
          heroPose.squash = -0.18 * (1 - u);
        }
      },
    });
    return;
  }

  // 5) 近战冲刺劈砍 / 旋风斩 (战士普攻&旋风斩 / 工程师重锤普攻)
  // 冲刺距离收敛: 最多推进 230px, 不再横跨半个战场贴到怪物脸上
  const travelDist = Math.max(60, Math.min(tx - heroBaseX - 140, 230));
  const isSpin = actionKind === "skill" && (skillKind === "whirl" || skillKind === "leechWhirl");
  let ghostTick = 0;

  timelines.push({
    actor: "hero",
    t: 0,
    dur: 0.72,
    impactAt: 0.35,
    impacted: false,
    onImpact: () => {
      punchZoom(tx - 24, heroChestY, actionKind === "skill" ? 1.085 : 1.055, 0.17);
      onImpact();
    },
    onDone: () => {
      heroPose.ox = 0; heroPose.oy = 0; heroPose.bend = 0; heroPose.squash = 0;
      onDone();
    },
    update: (p, dt) => {
      if (p < 0.14) {
        // 蓄力压身下蹲
        const u = p / 0.14;
        heroPose.ox = -u * 14;
        heroPose.bend = -u * 24;
        heroPose.squash = -u * 0.14;
      } else if (p < 0.26) {
        // 疾风突进至怪物身前 + 拖尾残影
        const u = (p - 0.14) / 0.12;
        const ease = 1 - (1 - u) ** 3;
        heroPose.ox = -14 + (travelDist + 14) * ease;
        heroPose.oy = -Math.sin(u * Math.PI) * 26;
        heroPose.bend = -24 + 58 * ease;
        heroPose.squash = 0.12 * Math.sin(u * Math.PI);

        ghostTick += dt;
        if (ghostTick >= 0.037) {
          ghostTick = 0;
          afterimages.push({
            key: spriteKey,
            x: heroBaseX + heroPose.ox,
            y: heroFootY + heroPose.oy,
            h: heroH,
            flipX: 1,
            bend: heroPose.bend,
            tint: isSpin ? "#ff4b5c" : "#ffd27d",
            life: 0.18,
            maxLife: 0.18,
          });
        }
      } else if (p < 0.36) {
        // 斩击命中驻留发力
        const u = (p - 0.26) / 0.1;
        heroPose.ox = travelDist;
        heroPose.oy = 0;
        heroPose.bend = isSpin ? Math.cos(u * Math.PI * 2) * 34 : 34 * (1 - u * 0.3);
        heroPose.squash = -0.08 * Math.sin(u * Math.PI);
      } else {
        // 轻盈后跃归位
        const u = (p - 0.36) / 0.14;
        heroPose.ox = travelDist * (1 - u);
        heroPose.oy = -Math.sin(u * Math.PI) * 34;
        heroPose.bend = -10 * Math.sin(u * Math.PI);
        heroPose.squash = 0;
      }
    },
  });
}

// ================================================================
// 怪物行动编排: 逐只扑击爪击 / 弓箭射击 / 幽魂冥火 / 毒液抛投
// ================================================================
export function playMonsterAttack(opts: {
  monId: number;
  body: string;
  boss: boolean;
  monBaseX: number;
  monFootY: number;
  monH: number;
  heroBaseX: number;
  heroFootY: number;
  heroH: number;
  onImpact: () => void;
  onDone: () => void;
}): void {
  const { monId, body, boss, monBaseX, monFootY, monH, heroBaseX, heroFootY, heroH, onImpact, onDone } = opts;
  const pose = getMonPose(monId);
  const heroChestY = heroFootY - heroH * 0.5;
  const monChestY = monFootY - monH * 0.52;

  // 远程怪物: 骷髅弓手(骨箭) / 幽魂(冥火球) / 史莱姆(高抛腐蚀酸液)
  if (body === "skeleton" || body === "ghost" || body === "slime") {
    const pKind: ProjectileKind = body === "skeleton" ? "arrow" : body === "ghost" ? "soulorb" : "acid";
    const windup = 0.17;
    const flight = body === "skeleton" ? 0.22 : 0.32;
    let shot = false;

    timelines.push({
      actor: monId,
      t: 0,
      dur: windup + flight + 0.14,
      impactAt: windup + flight,
      impacted: false,
      onImpact: () => {
        triggerHeroHit(heroBaseX, heroChestY, boss);
        onImpact();
      },
      onDone: () => {
        pose.ox = 0; pose.oy = 0; pose.bend = 0; pose.squash = 0;
        onDone();
      },
      update: (p) => {
        const sec = p * (windup + flight + 0.14);
        if (sec < windup) {
          const u = sec / windup;
          pose.bend = 22 * u; // 向右蓄力拉弓/蓄液
          pose.squash = body === "slime" ? -0.22 * u : -0.08 * u;
        } else {
          if (!shot) {
            shot = true;
            projectiles.push({
              kind: pKind,
              x0: monBaseX - 28,
              y0: monChestY,
              x1: heroBaseX + 12,
              y1: heroChestY,
              arcH: body === "slime" ? -78 : -8,
              t: 0,
              dur: flight,
              delay: 0,
              impacted: false,
            });
          }
          const u = Math.min(1, (sec - windup) / (flight + 0.1));
          pose.bend = -24 * Math.sin(u * Math.PI);
          pose.squash = body === "slime" ? 0.18 * Math.sin(u * Math.PI) : 0;
        }
      },
    });
    return;
  }

  // 近战怪物: 蓄力 -> 猛扑至英雄面前 -> 撕咬/重砸 -> 跃回原位
  // 负值(向左扑); 扑击距离收敛, 最远 260px, 远处怪物扑半程由爪击特效补足
  const dashLeft = Math.max(heroBaseX + 90 - monBaseX, -260);
  const isLeaper = body === "hound" || body === "spider" || body === "goblin" || body === "mimic";
  let ghostTick = 0;

  timelines.push({
    actor: monId,
    t: 0,
    dur: 0.6,
    impactAt: 0.3,
    impacted: false,
    onImpact: () => {
      triggerHeroHit(heroBaseX, heroChestY, boss || body === "brute" || body === "golem");
      if (boss) punchZoom(heroBaseX + 35, heroChestY, 1.07, 0.16);
      onImpact();
    },
    onDone: () => {
      pose.ox = 0; pose.oy = 0; pose.bend = 0; pose.squash = 0;
      onDone();
    },
    update: (p, dt) => {
      if (p < 0.12) {
        const u = p / 0.12;
        pose.ox = u * 14;
        pose.bend = u * 22;
        pose.squash = -u * 0.14;
      } else if (p < 0.23) {
        const u = (p - 0.12) / 0.11;
        const ease = 1 - (1 - u) ** 3;
        pose.ox = 14 + (dashLeft - 14) * ease;
        pose.oy = isLeaper ? -Math.sin(u * Math.PI) * 34 : -Math.sin(u * Math.PI) * 12;
        pose.bend = 22 - 56 * ease; // 猛向前扑(朝左为负)

        ghostTick += dt;
        if (ghostTick >= 0.043) {
          ghostTick = 0;
          afterimages.push({
            key: `mon_${body}`,
            x: monBaseX + pose.ox,
            y: monFootY + pose.oy,
            h: monH,
            flipX: monsterCombatFlip(body),
            bend: pose.bend,
            tint: boss ? "#ff5424" : "#ef4444",
            life: 0.15,
            maxLife: 0.15,
          });
        }
      } else if (p < 0.3) {
        pose.ox = dashLeft;
        pose.bend = -30;
      } else {
        const u = (p - 0.3) / 0.12;
        pose.ox = dashLeft * (1 - u);
        pose.oy = -Math.sin(u * Math.PI) * 24;
        pose.bend = 0;
        pose.squash = 0;
      }
    },
  });
}

// ================================================================
// 每帧推进与骨骼切片绘制
// ================================================================
export function updateCombatAnim(dt: number): void {
  // 1) 驱动编排时间轴
  for (let i = timelines.length - 1; i >= 0; i--) {
    const tl = timelines[i];
    tl.t += dt;
    const p = Math.min(1, tl.t / tl.dur);
    tl.update(p, dt);
    if (!tl.impacted && tl.t >= tl.impactAt) {
      tl.impacted = true;
      tl.onImpact?.();
    }
    if (tl.t >= tl.dur) {
      timelines.splice(i, 1);
      tl.onDone?.();
    }
  }

  // 2) 非当前主动出招实体的受击形变实时弹性回弹
  const springBack = (r: RigPose) => {
    r.ox += (0 - r.ox) * Math.min(1, dt * 13);
    r.oy += (0 - r.oy) * Math.min(1, dt * 13);
    r.bend += (0 - r.bend) * Math.min(1, dt * 11);
    r.squash += (0 - r.squash) * Math.min(1, dt * 11);
  };
  heroPose.flash = Math.max(0, heroPose.flash - dt);
  if (!timelines.some((tl) => tl.actor === "hero")) {
    springBack(heroPose);
  }
  for (const [id, r] of monPoses.entries()) {
    r.flash = Math.max(0, r.flash - dt);
    if (!timelines.some((tl) => tl.actor === id)) {
      springBack(r);
    }
  }

  // 3) 残影衰减
  for (let i = afterimages.length - 1; i >= 0; i--) {
    afterimages[i].life -= dt;
    if (afterimages[i].life <= 0) afterimages.splice(i, 1);
  }

  // 4) 飞行弹道推进与拖尾发射
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    if (pr.delay > 0) {
      pr.delay -= dt;
      continue;
    }
    pr.t += dt;
    const u = Math.min(1, pr.t / pr.dur);
    const x = pr.x0 + (pr.x1 - pr.x0) * u;
    const y = pr.y0 + (pr.y1 - pr.y0) * u + Math.sin(u * Math.PI) * pr.arcH;

    // 弹道尾迹粒子
    if (pr.kind === "fireball" || pr.kind === "pyroclasm" || pr.kind === "meteor") {
      fx.burst(x, y, {
        colors: ["#fff3b0", "#ff9f1c", "#ff5424"], count: pr.kind === "pyroclasm" ? 4 : 2,
        speed: 45, life: 0.24, size: pr.kind === "pyroclasm" ? 4.5 : 3, gravity: -30,
      });
    } else if (pr.kind === "soulorb") {
      fx.burst(x, y, { colors: ["#a5f3fc", "#38bdf8", "#c084fc"], count: 2, speed: 35, life: 0.25, size: 3, gravity: -15 });
    } else if (pr.kind === "acid") {
      fx.burst(x, y, { colors: ["#bef264", "#4ade80", "#10b981"], count: 2, speed: 30, life: 0.25, size: 2.8, gravity: 90 });
    } else if (pr.kind === "shockwave") {
      fx.burst(x, y, { colors: ["#ffd23e", "#ff6b2b", "#a8a29e"], count: 3, speed: 95, life: 0.3, size: 3.4, gravity: 180 });
    }

    if (u >= 1) {
      if (!pr.impacted) {
        pr.impacted = true;
        pr.onArrive?.();
        if (pr.kind === "acid") {
          fx.burst(pr.x1, pr.y1, { colors: ["#bef264", "#4ade80", "#10b981"], count: 18, speed: 160, life: 0.45, size: 3.5, gravity: 200 });
        } else if (pr.kind === "soulorb") {
          fx.burst(pr.x1, pr.y1, { colors: ["#e0f2fe", "#38bdf8", "#a855f7"], count: 18, speed: 170, life: 0.42, size: 3.4, gravity: -20 });
        } else if (pr.kind === "meteor" || pr.kind === "pyroclasm") {
          fx.crit(pr.x1, pr.y1);
        }
      }
      projectiles.splice(i, 1);
    }
  }

  // 5) 吟唱法阵与炮台
  for (let i = circles.length - 1; i >= 0; i--) {
    circles[i].life -= dt;
    if (circles[i].life <= 0) circles.splice(i, 1);
  }
  if (turret) {
    turret.life -= dt;
    turret.recoil = Math.max(0, turret.recoil - dt * 8);
    if (turret.life <= 0) turret = null;
  }

  // 6) 镜头推拉与血雾暗角缓动
  if (zoomHold > 0) {
    zoomHold -= dt;
  } else {
    zoomTarget += (1 - zoomTarget) * Math.min(1, dt * 6);
  }
  zoomCur += (zoomTarget - zoomCur) * Math.min(1, dt * 11);
  bloodVignette = Math.max(0, bloodVignette - dt * 2.1);
}

/**
 * 10 层水平网格切片木偶渲染:
 * 脚底 (slice 0) 稳固钉在地面不打滑, 躯干/肩部/武器随呼吸波与攻击发力产生柔顺骨骼弯曲!
 */
export function drawPuppetSprite(
  ctx: CanvasRenderingContext2D,
  key: string,
  cx: number,
  footY: number,
  targetH: number,
  flipX: number,
  time: number,
  seed: number,
  pose: RigPose,
): { w: number; h: number } {
  const img = hdImg(key);
  const drawCx = cx + pose.ox;
  const drawFootY = footY + pose.oy;

  if (!img) {
    const w = targetH * 0.6;
    ctx.fillStyle = "#6d5dfc";
    ctx.beginPath();
    ctx.ellipse(drawCx, drawFootY - targetH * 0.5, w * 0.4, targetH * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    return { w, h: targetH };
  }

  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  // 待机显著呼吸律动 + 蓄力挤压拉伸
  const breathCycle = Math.sin(time * 3.1 + seed);
  const syScale = (1 + breathCycle * 0.032) * (1 + pose.squash);
  const sxScale = (1 - breathCycle * 0.02) * (1 - pose.squash * 0.65);

  const totalH = targetH * syScale;
  const totalW = targetH * aspect * sxScale;

  const SLICES = 10;
  const srcSliceH = img.naturalHeight / SLICES;
  const dstSliceH = totalH / SLICES;

  ctx.save();
  if (pose.flash > 0) {
    ctx.filter = pose.flashTint === "crimson"
      ? "brightness(1.7) sepia(0.9) hue-rotate(-38deg) saturate(3.2)"
      : "brightness(2.7) contrast(1.15) saturate(0.3)";
  }

  // 自下(s=0 脚底)向上(s=9 头顶/武器端)逐层绘制
  for (let s = 0; s < SLICES; s++) {
    const u = s / (SLICES - 1); // 0(脚底) -> 1(头顶)
    const weight = u ** 1.45;
    // 待机 S 型呼吸摇曳(头肩带相位滞后, 产生活灵活现的惯性跟随感!)
    const idleSway = Math.sin(time * 3.1 + seed - u * 0.7) * 5.2 * weight * flipX;
    const shearX = idleSway + pose.bend * weight;

    const srcY = img.naturalHeight - (s + 1) * srcSliceH;
    const dstY = drawFootY - (s + 1) * dstSliceH;

    // 轻微重叠 0.7px 消除亚像素切片接缝
    ctx.save();
    ctx.translate(drawCx + shearX, dstY);
    ctx.scale(flipX, 1);
    ctx.drawImage(
      img,
      0, Math.max(0, srcY - 0.5), img.naturalWidth, Math.min(img.naturalHeight - srcY, srcSliceH + 1),
      -totalW * 0.5, 0, totalW, dstSliceH + 0.8,
    );
    ctx.restore();
  }

  ctx.restore();
  return { w: totalW, h: totalH };
}

/** 绘制脚下吟唱法阵与疾风冲刺残影(在角色之前调用) */
export function drawUnderActorsFx(ctx: CanvasRenderingContext2D, time: number): void {
  // 1) 吟唱法阵
  for (const c of circles) {
    const a = Math.sin((c.life / c.maxLife) * Math.PI);
    const scale = 0.7 + (1 - c.life / c.maxLife) * 0.45;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(scale, scale * 0.44);
    ctx.rotate(time * 3.2);
    ctx.globalAlpha = Math.max(0, a * 0.85);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, c.r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 2) 疾风冲刺半透明幻影残像
  for (const g of afterimages) {
    const img = hdImg(g.key);
    if (!img) continue;
    const a = (g.life / g.maxLife) * 0.42;
    const w = g.h * (img.naturalWidth / Math.max(1, img.naturalHeight));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(g.x + g.bend * 0.4, g.y);
    ctx.scale(g.flipX, 1);
    ctx.filter = "brightness(1.8) saturate(1.6)";
    ctx.drawImage(img, -w * 0.5, -g.h, w, g.h);
    ctx.restore();
  }
}

/** 绘制主角常驻动态伴随特效(法师杖头真火 / 战士怒气火星 / 工程师悬浮旋翼无人机 & 临时炮台) */
export function drawHeroCompanionProps(
  ctx: CanvasRenderingContext2D,
  cls: string,
  heroX: number,
  heroFootY: number,
  heroH: number,
  time: number,
): void {
  const cx = heroX + heroPose.ox;
  const fy = heroFootY + heroPose.oy;

  if (cls === "工程师") {
    // 悬浮蒸汽机械无人机 (双旋翼高速旋转 + 呼吸上下浮动 + 青蓝扫描眼)
    const dx = cx - 34 + Math.cos(time * 2.2) * 8;
    const dy = fy - heroH * 0.88 + Math.sin(time * 3.8) * 7;
    ctx.save();
    ctx.translate(dx, dy);

    // 底部推进微光
    const thrust = ctx.createRadialGradient(0, 12, 1, 0, 12, 14);
    thrust.addColorStop(0, "rgba(56, 189, 248, 0.7)");
    thrust.addColorStop(1, "rgba(56, 189, 248, 0)");
    ctx.fillStyle = thrust;
    ctx.beginPath();
    ctx.arc(0, 12, 14, 0, Math.PI * 2);
    ctx.fill();

    // 高速旋转双翼
    const bladeW = 10 + Math.abs(Math.sin(time * 28)) * 12;
    ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-14 - bladeW * 0.5, -9);
    ctx.lineTo(-14 + bladeW * 0.5, -9);
    ctx.moveTo(14 - bladeW * 0.5, -9);
    ctx.lineTo(14 + bladeW * 0.5, -9);
    ctx.stroke();

    // 黄铜球形机体
    ctx.fillStyle = "#b48337";
    ctx.strokeStyle = "#16111f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 青色光学核心眼
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(3, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath();
    ctx.arc(4, -1, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 炮台支援召唤出的蒸汽重炮台
    if (turret) {
      const tx = turret.x - turret.recoil * 7;
      const ty = turret.y;
      ctx.save();
      ctx.globalAlpha = Math.min(1, turret.life * 4);
      ctx.fillStyle = "#475569";
      ctx.strokeStyle = "#120e1a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(tx - 16, ty - 16, 32, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d99b38";
      ctx.beginPath();
      ctx.roundRect(tx - 11, ty - 30, 22, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(tx + 8, ty - 26, 18, 7);
      ctx.restore();
    }
  } else if (cls === "灰烬法师") {
    // 法杖顶端跃动的动态真火光团
    const fxX = cx + heroH * 0.21 + heroPose.bend * 0.9;
    const fxY = fy - heroH * 0.87;
    const flicker = 1 + Math.sin(time * 14) * 0.18;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(fxX, fxY, 2, fxX, fxY, 22 * flicker);
    g.addColorStop(0, "rgba(255, 250, 210, 0.9)");
    g.addColorStop(0.45, "rgba(255, 128, 36, 0.55)");
    g.addColorStop(1, "rgba(255, 68, 20, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fxX, fxY, 22 * flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 绘制飞行弹道实体(火球/炎爆巨球/陨石/骨箭/冥火/毒液/等离子弹, 在前景绘制) */
export function drawProjectilesFx(ctx: CanvasRenderingContext2D, time: number): void {
  for (const pr of projectiles) {
    if (pr.delay > 0) continue;
    const u = Math.min(1, pr.t / pr.dur);
    const x = pr.x0 + (pr.x1 - pr.x0) * u;
    const y = pr.y0 + (pr.y1 - pr.y0) * u + Math.sin(u * Math.PI) * pr.arcH;

    // 切线方向角
    const du = 0.02;
    const nx = pr.x0 + (pr.x1 - pr.x0) * Math.min(1, u + du);
    const ny = pr.y0 + (pr.y1 - pr.y0) * Math.min(1, u + du) + Math.sin(Math.min(1, u + du) * Math.PI) * pr.arcH;
    const ang = Math.atan2(ny - y, nx - x);

    ctx.save();
    ctx.translate(x, y);

    if (pr.kind === "fireball" || pr.kind === "meteor") {
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";
      const r = pr.kind === "meteor" ? 18 : 14;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, "#ffe066");
      g.addColorStop(0.65, "#ff5c24");
      g.addColorStop(1, "rgba(255, 50, 16, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(-r * 0.4, 0, r * 2.2, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === "pyroclasm") {
      ctx.globalCompositeOperation = "lighter";
      const r = 30 + Math.sin(time * 30) * 4;
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.5);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, "#ffd23e");
      g.addColorStop(0.7, "#ff4b24");
      g.addColorStop(1, "rgba(220, 38, 38, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === "arrow") {
      ctx.rotate(ang);
      // 破空风锥与骨箭杆
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-36, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(8, -5);
      ctx.lineTo(8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(-34, -4, 9, 8);
    } else if (pr.kind === "soulorb") {
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, "#38bdf8");
      g.addColorStop(0.8, "#9333ea");
      g.addColorStop(1, "rgba(147, 51, 234, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === "acid") {
      ctx.rotate(time * 12);
      ctx.fillStyle = "#4ade80";
      ctx.strokeStyle = "#064e3b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d9f99d";
      ctx.beginPath();
      ctx.arc(-3, -2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === "plasma") {
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(3, 0, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === "shockwave") {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "#ff7b29";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 26, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
    }

    ctx.restore();
  }
}

/** 玩家受击时的屏幕四周血色脉冲暗角 */
export function drawBloodVignette(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  if (amount <= 0.01) return;
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.34, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, "rgba(185, 28, 28, 0)");
  g.addColorStop(1, `rgba(220, 38, 38, ${amount * 0.48})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
