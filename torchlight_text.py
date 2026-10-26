# -*- coding: utf-8 -*-
"""火炬之光:文字版 —— 单文件可玩的暗黑系刷宝小游戏

核心循环: 选职业 -> 随机地牢遭遇战 -> 回合制战斗 -> 随机词缀装备掉落
          -> 穿装备变强 -> 每 3 层篝火营地补给 -> 无限下潜 -> 死亡结算

运行: python torchlight_text.py
自检: python torchlight_text.py --autotest   (机器随机操作跑完整流程)
"""
import json
import os
import random
import sys
import tempfile
from pathlib import Path

os.system("")  # 让 Windows 传统控制台启用 ANSI 颜色

AUTO = False  # --autotest 模式: 所有交互点由机器从合法选项里随机挑


def ask(prompt, choices=None):
    if AUTO:
        assert choices, "autotest 模式下每个 ask 必须给 choices"
        return random.choice(choices)
    try:
        return input(prompt)
    except (EOFError, KeyboardInterrupt):
        print("\n再见, 冒险者。")
        sys.exit(0)


# ---------------------------------------------------------------- 通用文案
RESET = "\033[0m"
DARK = "\033[90m"
COLOR = {"普通": "\033[37m", "魔法": "\033[94m", "稀有": "\033[93m", "传说": "\033[91m"}
RARITY_MULT = {"普通": 1.0, "魔法": 1.2, "稀有": 1.45, "传说": 1.8}
AFFIX_N = {"普通": 0, "魔法": 1, "稀有": 2, "传说": 3}

WEAPONS = ["短剑", "战斧", "法杖", "火枪", "铁拳套"]
ARMORS = ["皮甲", "锁子甲", "法师袍", "板甲"]
TRINKETS = ["戒指", "护符", "怀表", "魔晶"]
PREFIXES = ["凶残的", "坚固的", "迅捷的", "焚烧的", "寒霜的", "嗜血的", "被诅咒的", "发光的"]
LEGEND_NAMES = {"武器": "火炬之心", "护甲": "龙鳞战衣", "饰品": "时之沙漏"}

M_PREFIX = ["饥饿的", "狂暴的", "变异的", "被诅咒的", "巨大的", "阴险的"]
M_BODY = ["地精掠夺者", "史莱姆", "骷髅弓手", "地穴蜘蛛", "穴居暴徒", "幽魂", "岩石傀儡", "暗影猎犬"]
BOSS_NAMES = ["深渊领主", "熔岩魔王", "骸骨君王", "机械暴君"]

CLASSES = {
    "1": ("灰烬法师", 80, 12, 40, ("烈焰风暴", 20, "造成 220% 攻击的火焰伤害")),
    "2": ("狂战士", 125, 10, 25, ("旋风斩", 15, "160% 攻击且必定暴击")),
    "3": ("工程师", 100, 11, 30, ("急救无人机", 18, "回复 25% 生命, 并造成 80% 攻击伤害")),
}


def tint(rarity, text):
    return COLOR[rarity] + text + RESET


def affix_text(eq):
    parts = []
    if eq["atk"]:
        parts.append(f"攻击+{eq['atk']}")
    if eq["hp"]:
        parts.append(f"生命+{eq['hp']}")
    if eq["crit"]:
        parts.append(f"暴击+{eq['crit']}%")
    if eq["leech"]:
        parts.append(f"吸血{eq['leech']}%")
    if eq["regen"]:
        parts.append(f"回蓝+{eq['regen']}/回合")
    return ", ".join(parts)


# ---------------------------------------------------------------- 装备生成
def roll_equipment(floor, force_rarity=None):
    slot = random.choice(["武器", "护甲", "饰品"])
    if force_rarity:
        rarity = force_rarity
    else:  # 层数越深, 高稀有概率越高
        bonus = min(floor * 0.015, 0.18)
        r = random.random()
        if r < 0.03 + bonus * 0.3:
            rarity = "传说"
        elif r < 0.15 + bonus:
            rarity = "稀有"
        elif r < 0.50 + bonus:
            rarity = "魔法"
        else:
            rarity = "普通"

    scale = RARITY_MULT[rarity] * (1 + floor * 0.12)
    eq = {"slot": slot, "rarity": rarity,
          "atk": 0, "hp": 0, "crit": 0, "leech": 0, "regen": 0}

    if slot == "武器":
        base = random.choice(WEAPONS)
        eq["atk"] = max(1, int(random.randint(4, 8) * scale))
    elif slot == "护甲":
        base = random.choice(ARMORS)
        eq["hp"] = max(1, int(random.randint(12, 22) * scale))
    else:
        base = random.choice(TRINKETS)
        main = random.choice(["crit", "leech", "regen", "atk"])
        if main == "crit":
            eq["crit"] = random.randint(2, 5)
        elif main == "leech":
            eq["leech"] = random.randint(1, 3)
        elif main == "regen":
            eq["regen"] = random.randint(1, 3)
        else:
            eq["atk"] = max(1, int(random.randint(2, 5) * scale))

    # 词缀: 从主属性之外的池子里抽
    pool = [k for k in ("atk", "hp", "crit", "leech", "regen") if eq[k] == 0]
    random.shuffle(pool)
    for key in pool[: AFFIX_N[rarity]]:
        if key == "atk":
            eq["atk"] += max(1, int(random.randint(2, 5) * scale * 0.6))
        elif key == "hp":
            eq["hp"] += max(1, int(random.randint(8, 16) * scale * 0.6))
        elif key == "crit":
            eq["crit"] += random.randint(1, 4)
        elif key == "leech":
            eq["leech"] += random.randint(1, 2)
        else:
            eq["regen"] += random.randint(1, 2)

    if rarity == "传说":
        eq["name"] = f"{LEGEND_NAMES[slot]}·{base}"
    elif rarity == "普通":
        eq["name"] = base
    else:
        eq["name"] = random.choice(PREFIXES) + base
    eq["value"] = int((10 + floor * 6) * RARITY_MULT[rarity])
    return eq


def equip_line(eq):
    return f"{tint(eq['rarity'], '[' + eq['rarity'] + ']' + eq['name'])} ({affix_text(eq)})"


# ---------------------------------------------------------------- 怪物
def roll_monsters(floor):
    # 数量随层数上涨: 1~4 层最多 2 只, 之后每 4 层上限 +1, 封顶 5
    n = random.randint(1, min(5, 2 + (floor - 1) // 4))
    monsters = []
    for _ in range(n):
        monsters.append({
            "name": random.choice(M_PREFIX) + random.choice(M_BODY),
            "hp": int((28 + floor * 12) * random.uniform(0.85, 1.15)),
            "atk": max(2, int((5 + floor * 3) * random.uniform(0.85, 1.15))),
            "boss": False,
        })
    if floor % 5 == 0:
        monsters.append({
            "name": "首领·" + random.choice(BOSS_NAMES),
            "hp": int((28 + floor * 12) * 3),
            "atk": int((5 + floor * 3) * 2),
            "boss": True,
        })
    return monsters


# ---------------------------------------------------------------- 玩家
class Player:
    def __init__(self, cls_name, hp, atk, mp, skill):
        self.cls, self.base_hp, self.base_atk, self.max_mp, self.skill = cls_name, hp, atk, mp, skill
        self.level, self.exp = 1, 0
        self.equip = {"武器": None, "护甲": None, "饰品": None}
        self.bag = []
        self.gold = 30
        self.potions = {"血瓶": 2, "蓝瓶": 1}
        self.kills = 0
        self.rest_used = False
        self.alive = True
        self.hp = self.max_hp
        self.mp = self.max_mp

    def _equip_sum(self, key):
        return sum(e[key] for e in self.equip.values() if e)

    @property
    def max_hp(self):
        return int(self.base_hp * (1 + (self.level - 1) * 0.15)) + self._equip_sum("hp")

    @property
    def atk(self):
        return int(self.base_atk * (1 + (self.level - 1) * 0.12)) + self._equip_sum("atk")

    @property
    def crit(self):
        return 5 + self._equip_sum("crit")

    @property
    def leech(self):
        return self._equip_sum("leech")

    @property
    def regen(self):
        return self._equip_sum("regen")

    @property
    def exp_need(self):
        return self.level * 30

    def gain_exp(self, exp):
        self.exp += exp
        leveled = 0
        while self.exp >= self.exp_need:
            self.exp -= self.exp_need
            self.level += 1
            leveled += 1
        if leveled:
            self.hp = self.max_hp
            self.mp = self.max_mp
            print(f"\033[32m✦ 升级! 等级 {self.level}, 生命法力全满。\033[0m")

    def status(self):
        return (f"❤ {self.hp}/{self.max_hp}  ✦ {self.mp}/{self.max_mp}  "
                f"⚔ {self.atk}  暴击 {self.crit}%  Lv{self.level}  "
                f"金币 {self.gold}  [血瓶×{self.potions['血瓶']} 蓝瓶×{self.potions['蓝瓶']}]")


def wear(player, eq):
    """穿装备, 换下的旧装备放回背包。"""
    old = player.equip[eq["slot"]]
    player.equip[eq["slot"]] = eq
    player.bag.remove(eq)
    if old:
        player.bag.append(old)
        print(f"已换下: {equip_line(old)}")
    player.hp = min(player.hp, player.max_hp)


def show_inventory(player):
    print(f"\n== 背包 {len(player.bag)}/10 ==  {player.status()}")
    for slot, eq in player.equip.items():
        print(f" 已穿[{slot}]: {equip_line(eq) if eq else DARK + '(空)' + RESET}")
    if not player.bag:
        print(" 背包是空的。")
    for i, eq in enumerate(player.bag, 1):
        print(f"  {i}. {equip_line(eq)}")
    while True:
        cmd = ask("数字=穿戴, d数字=丢弃, 回车返回 > ", ["", "1", "2", "d1", "d2"])
        if cmd == "" or not player.bag:
            return
        drop = cmd.startswith("d")
        try:
            idx = int(cmd.lstrip("d")) - 1
            eq = player.bag[idx]
        except (ValueError, IndexError):
            print("无效输入。")
            continue
        if drop:
            player.bag.remove(eq)
            print(f"丢弃了 {eq['name']}。")
        else:
            wear(player, eq)
        return


# ---------------------------------------------------------------- 战斗
def deal_damage(player, target, dmg, crit):
    target["hp"] -= dmg
    line = f"你对 {target['name']} 造成 {dmg} 点伤害" + ("(暴击!)" if crit else "")
    print(line)
    if player.leech:
        heal = max(1, dmg * player.leech // 100)
        player.hp = min(player.max_hp, player.hp + heal)
        print(f"  吸血回复 {heal} 点。")


def player_turn(player, target):
    """玩家一个回合。返回 False 表示本次输入无效不消耗回合。"""
    skill_name, skill_cost, _ = player.skill
    cmd = ask(f"[1]普攻 [2]{skill_name}({skill_cost}蓝) [3]血瓶 [4]蓝瓶 > ",
              ["1", "1", "1", "2", "3", "4"])
    if cmd == "1":
        dmg = int(player.atk * random.uniform(0.9, 1.1))
        crit = random.random() * 100 < player.crit
        deal_damage(player, target, dmg * (2 if crit else 1), crit)
    elif cmd == "2":
        if player.mp < skill_cost:
            print("法力不足!")
            return False
        player.mp -= skill_cost
        if player.cls == "灰烬法师":
            deal_damage(player, target, int(player.atk * 2.2), False)
        elif player.cls == "狂战士":
            deal_damage(player, target, int(player.atk * 1.6), True)
        else:  # 工程师
            heal = player.max_hp // 4
            player.hp = min(player.max_hp, player.hp + heal)
            print(f"无人机修理了你的装甲, 回复 {heal} 点。")
            deal_damage(player, target, int(player.atk * 0.8), False)
    elif cmd == "3":
        if player.potions["血瓶"] <= 0:
            print("没有血瓶了!")
            return False
        player.potions["血瓶"] -= 1
        heal = 50 + player.level * 10
        player.hp = min(player.max_hp, player.hp + heal)
        print(f"喝下血瓶, 回复 {heal} 点。")
    else:
        if player.potions["蓝瓶"] <= 0:
            print("没有蓝瓶了!")
            return False
        player.potions["蓝瓶"] -= 1
        mana = 25
        player.mp = min(player.max_mp, player.mp + mana)
        print(f"喝下蓝瓶, 回复 {mana} 点法力。")
    return True


def combat(player, monsters, floor):
    print(f"\n—— 遭遇 {len(monsters)} 只怪物 ——")
    for m in monsters:
        boss_tag = "\033[91m" if m["boss"] else ""
        end_tag = RESET if m["boss"] else ""
        print(f"  {boss_tag}{m['name']} (❤{m['hp']} ⚔{m['atk']}){end_tag}")
    round_no = 0
    while monsters and player.hp > 0:
        round_no += 1
        target = monsters[0]
        print(f"\n{DARK}{'─' * 40} 第 {round_no} 回合 {RESET}")
        while True:
            print(player.status())
            print(f" 目标: {target['name']} ❤{max(0, target['hp'])}")
            if player_turn(player, target):
                break
        for m in [x for x in monsters if x["hp"] > 0]:
            dmg = max(1, int(m["atk"] * random.uniform(0.85, 1.15)))
            player.hp -= dmg
            print(f"{m['name']} 对你造成 {dmg} 点伤害。")
        player.mp = min(player.max_mp, player.mp + player.regen)
        if player.hp <= 0:
            player.alive = False
            return
        for m in list(monsters):
            if m["hp"] <= 0:
                monsters.remove(m)
                player.kills += 1
                print(f"\033[32m✓ {m['name']} 被击杀!\033[0m")
                gold = (10 if m["boss"] else 3) + floor * 3
                exp = (2 + floor) * (3 if m["boss"] else 1)
                if m.get("elite"):
                    gold *= 2
                    exp *= 2
                player.gold += gold
                print(f"  掉落 {gold} 金币, 获得 {exp} 点经验。")
                player.gain_exp(exp)
                if m["boss"]:
                    drop = roll_equipment(floor, force_rarity=random.choice(["稀有", "传说"]))
                elif m.get("elite"):
                    drop = roll_equipment(floor + 2, force_rarity="稀有")
                elif random.random() < 0.35:
                    drop = roll_equipment(floor)
                else:
                    drop = None
                if drop:
                    offer_loot(player, drop)


def offer_loot(player, eq):
    print(f"  掉落装备: {equip_line(eq)}  价值 {eq['value']} 金")
    if len(player.bag) >= 10:
        gold = eq["value"] // 2
        player.gold += gold
        print(f"  {DARK}背包已满, 宠物把它叼回城镇卖掉, 换回 {gold} 金币。{RESET}")
        return
    if ask("  拾取? [Y]是 [n]否 > ", ["y", "y", "n"]).strip().lower() == "y":
        player.bag.append(eq)


# ---------------------------------------------------------------- 营地
def camp(player, floor):
    """营地补给。返回出发时所在的楼层(可能被传送改动)。"""
    print(f"\n\033[33m════ 篝火营地 · 第 {floor} 层 (建议 Lv{rec_level(floor)}) ════\033[0m")
    potion_price, mana_price = 20 + floor * 5, 15 + floor * 4
    while True:
        rest_tag = "(已休息)" if player.rest_used else ""
        print(player.status())
        cmd = ask(f"[1]休息{rest_tag} [2]买血瓶{potion_price}金 [3]买蓝瓶{mana_price}金 "
                  f"[4]卖背包装备 [5]看背包 [6]出发 [7]传送 > ",
                  ["1", "2", "3", "4", "5", "6", "7"])
        if cmd == "1":
            if player.rest_used:
                print("这次营地的火已经烤过一遍了。")
                continue
            player.rest_used = True
            player.hp = min(player.max_hp, player.hp + int(player.max_hp * 0.6))
            player.mp = min(player.max_mp, player.mp + int(player.max_mp * 0.6))
            print("在篝火边休息片刻……")
        elif cmd == "2":
            if player.gold < potion_price:
                print("金币不够。")
                continue
            player.gold -= potion_price
            player.potions["血瓶"] += 1
        elif cmd == "3":
            if player.gold < mana_price:
                print("金币不够。")
                continue
            player.gold -= mana_price
            player.potions["蓝瓶"] += 1
        elif cmd == "4":
            if not player.bag:
                print("背包里没有装备可卖。")
                continue
            gold = sum(e["value"] for e in player.bag)
            player.gold += gold
            player.bag.clear()
            print(f"宠物把一包装备叼回城镇卖掉, 换回 {gold} 金币。")
        elif cmd == "5":
            show_inventory(player)
        elif cmd == "7":
            raw = ask("跳到第几层? (1~999) > ", ["5", "8", "12"])
            try:
                target = int(raw.strip())
            except ValueError:
                print("无效楼层。")
                continue
            if not 1 <= target <= 999:
                print("无效楼层。")
                continue
            print(f"传送门闪过一道光…… 你出现在第 {target} 层。")
            player.rest_used = False
            return target
        else:
            player.rest_used = False
            return floor


# ---------------------------------------------------------------- 存档
# 存档固定为当前目录下的 save.json —— 启动方式都是先进入游戏目录再运行


def save_game(player, floor):
    data = {
        "cls": player.cls, "level": player.level, "exp": player.exp,
        "hp": player.hp, "mp": player.mp,
        "base_hp": player.base_hp, "base_atk": player.base_atk, "max_mp": player.max_mp,
        "skill": list(player.skill),
        "equip": player.equip, "bag": player.bag,
        "gold": player.gold, "potions": player.potions,
        "kills": player.kills, "rest_used": player.rest_used,
        "floor": floor,
    }
    try:
        Path("save.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except OSError as e:
        print(DARK + f"(存档写入失败: {e})" + RESET)


def load_game():
    """返回 (player, floor) 或 None。"""
    save = Path("save.json")
    if not save.exists():
        return None
    try:
        d = json.loads(save.read_text(encoding="utf-8"))
        p = Player(d["cls"], d["base_hp"], d["base_atk"], d["max_mp"], tuple(d["skill"]))
        p.level, p.exp = d["level"], d["exp"]
        p.hp, p.mp = d["hp"], d["mp"]
        p.equip, p.bag = d["equip"], d["bag"]
        p.gold, p.potions = d["gold"], d["potions"]
        p.kills, p.rest_used = d["kills"], d["rest_used"]
        # 存档的 hp/mp 是绝对值, 旧档在属性定义变化后可能高于重算的上限, 读档时收拢
        p.hp = min(p.hp, p.max_hp)
        p.mp = min(p.mp, p.max_mp)
        return p, d["floor"]
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(DARK + f"(存档损坏, 已忽略: {e})" + RESET)
        return None


def clear_save():
    Path("save.json").unlink(missing_ok=True)


# ---------------------------------------------------------------- 主流程
def create_character():
    print("\n== 选择你的职业 ==")
    for key, (name, hp, atk, mp, (sk, cost, desc)) in CLASSES.items():
        print(f" [{key}] {name}  ❤{hp} ⚔{atk} ✦{mp}  技能: {sk}({cost}蓝, {desc})")
    while True:
        c = ask("> ", ["1", "2", "3"])
        if c in CLASSES:
            name, hp, atk, mp, skill = CLASSES[c]
            p = Player(name, hp, atk, mp, skill)
            if AUTO:  # 测试机器人更耐打, 才能走到深层触发各类事件
                p.base_hp += 600
                p.base_atk += 10
                p.hp = p.max_hp
            return p


def rec_level(floor):
    """楼层建议等级: 每 2 层涨 1 级。"""
    return max(1, floor // 2)


EMPTY_LINES = [
    "风声在石壁间回荡, 这里空无一物。",
    "只剩前人留下的篝火余烬。",
    "地面刻着一行模糊的小字: '回头是岸'。",
]


def spring(player):
    print("\n你发现一眼泛着微光的清泉。")
    hp_heal = int(player.max_hp * random.uniform(0.3, 1.0))
    mp_heal = int(player.max_mp * random.uniform(0.3, 1.0))
    player.hp = min(player.max_hp, player.hp + hp_heal)
    player.mp = min(player.max_mp, player.mp + mp_heal)
    print(f"\033[36m清冽的泉水恢复了你 {hp_heal} 点生命、{mp_heal} 点法力。\033[0m")


def treasure_chest(player, floor):
    print("\n你发现了一个落满灰尘的宝箱!")
    if ask("[1]打开 [2]无视走人 > ", ["1", "1", "2"]) == "2":
        print("你警惕地绕开了它。")
        return
    r = random.random()
    if r < 0.10:  # 陷阱箱
        dmg = max(5, player.max_hp // 5)
        player.hp -= dmg
        print(f"\033[91m是陷阱箱! 爆炸对你造成 {dmg} 点伤害!\033[0m")
        if player.hp <= 0:
            player.alive = False
    elif r < 0.16:  # 拟态怪
        print("\033[91m箱子突然咧开一排牙齿——拟态怪!\033[0m")
        mimic = {
            "name": "拟态怪",
            "hp": int((28 + floor * 12) * 1.6),
            "atk": int((5 + floor * 3) * 1.2),
            "boss": False, "elite": True,
        }
        combat(player, [mimic], floor)
    elif r < 0.54:  # 金币堆
        gold = (10 + floor * 5) * random.randint(2, 4)
        player.gold += gold
        print(f"\033[33m满满一箱金币! 获得 {gold} 金。\033[0m")
    elif r < 0.84:  # 装备(档次比同层野怪高)
        print("箱底垫着一件装备……")
        offer_loot(player, roll_equipment(floor + random.randint(2, 5)))
    else:  # 药剂
        n, kind = random.randint(1, 2), random.choice(["血瓶", "蓝瓶"])
        player.potions[kind] += n
        print(f"箱子里码着药剂: {kind}×{n}!")


def wandering_merchant(player, floor):
    print("\n披着斗篷的流浪商人拦住你: '看看货? 价格公道。'")
    eq = roll_equipment(floor + random.randint(0, 3),
                        force_rarity=random.choice(["魔法", "稀有"]))
    while True:
        hp_deal, mp_deal = 3 * (15 + floor * 4), 3 * (12 + floor * 3)
        print(player.status())
        cmd = ask(f"[1]{equip_line(eq)} —— {eq['value']}金 [2]血瓶×3 —— {hp_deal}金 "
                  f"[3]蓝瓶×3 —— {mp_deal}金 [回车]走人 > ",
                  ["1", "2", "3", ""])
        if cmd == "1":
            if len(player.bag) >= 10:
                print("你背包满了, 商人耸耸肩收回了货。")
                continue
            if player.gold < eq["value"]:
                print("金币不够。")
                continue
            player.gold -= eq["value"]
            player.bag.append(eq)
            print("成交!")
            return
        elif cmd == "2":
            if player.gold < hp_deal:
                print("金币不够。")
                continue
            player.gold -= hp_deal
            player.potions["血瓶"] += 3
            print("成交!")
        elif cmd == "3":
            if player.gold < mp_deal:
                print("金币不够。")
                continue
            player.gold -= mp_deal
            player.potions["蓝瓶"] += 3
            print("成交!")
        else:
            print("商人隐入黑暗, 不见踪影。")
            return


def roll_floor_event(player, floor):
    """随机决定本层遭遇: 怪物群 / 宝箱 / 精英 / 泉水 / 流浪商人 / 空房间。"""
    r = random.random()
    if r < 0.40:
        combat(player, roll_monsters(floor), floor)
    elif r < 0.58:
        treasure_chest(player, floor)
    elif r < 0.70:
        elite = {
            "name": "精英·" + random.choice(M_PREFIX) + random.choice(M_BODY),
            "hp": int((28 + floor * 12) * 2.2),
            "atk": int((5 + floor * 3) * 1.5),
            "boss": False, "elite": True,
        }
        print("\n一股压迫感逼近——精英怪物出现了!")
        combat(player, [elite], floor)
    elif r < 0.80:
        spring(player)
    elif r < 0.90:
        wandering_merchant(player, floor)
    else:
        print("\n" + random.choice(EMPTY_LINES))
        if random.random() < 0.3:
            gold = random.randint(2, 5) + floor
            player.gold += gold
            print(f"角落里散落着几枚金币, 捡起 {gold} 金。")


def encounter(player, floor):
    rec = rec_level(floor)
    boss_tag = " · 首领出没!" if floor % 5 == 0 else ""
    print(f"\n\033[33m—— 第 {floor} 层 · 建议 Lv{rec}{boss_tag} ——\033[0m")
    if player.level < rec:
        print("\033[91m! 你的等级低于建议值, 可以在本层反复刷, 或去营地休整。\033[0m")
    while True:
        roll_floor_event(player, floor)
        if not player.alive:
            return
        while True:
            cmd = ask("\n[回车]下潜  [r]再刷一遍  [i]背包 > ", ["", "r", "i"])
            if cmd == "i":
                show_inventory(player)
            elif cmd == "r":
                print(DARK + "你决定在这层再转悠一圈……" + RESET)
                break  # 重新随机本层遭遇
            else:
                return


def death_summary(player, floor):
    best = max(player.equip.values(), key=lambda e: e["value"] if e else 0)
    print(f"\n\033[31m════ 你倒在了第 {floor} 层 ════\033[0m")
    print(f"职业: {player.cls}  等级: {player.level}  击杀: {player.kills} 只怪物")
    print(f"金币: {player.gold}  遗物: {equip_line(best) if best else '无'}")
    if ask("\n[1]再来一局 [2]退出 > ", ["1", "2"]) == "1":
        return True
    return False


def main():
    global AUTO
    if "--autotest" in sys.argv:
        AUTO = True
        os.chdir(tempfile.gettempdir())  # autotest 的存档写进临时目录, 不碰真实存档
        random.seed(2026)
        print(DARK + "(autotest 模式: 机器随机操作)" + RESET)
    print("\033[33m═══════ 火 炬 之 光 · 文 字 版 ═══════\033[0m")
    print(DARK + "暗黑系刷宝 roguelite: 下潜越深, 怪越强, 掉落越好。" + RESET)
    while True:
        floor = 1
        saved = load_game()
        if saved:
            player, floor = saved
            print(f"\033[32m✦ 发现存档: {player.cls} Lv{player.level}, 已推进到第 {floor} 层。\033[0m")
            if ask("[1]继续冒险 [2]放弃存档, 重新开始 > ", ["1", "2"]) == "2":
                clear_save()
                player = create_character()
                floor = 1
        else:
            player = create_character()
        while player.alive:
            if floor % 3 == 0:
                floor = camp(player, floor)
                save_game(player, floor)
            encounter(player, floor)
            if player.alive:
                floor += 1
                save_game(player, floor)
            else:
                clear_save()  # 死亡即删档
        if not death_summary(player, floor):
            break
    print("再见, 冒险者。")


if __name__ == "__main__":
    main()
