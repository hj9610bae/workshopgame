"""교섭의 도박사들 특수 카드 시뮬레이션 (규칙 v2.3 재현 + 카드 변형). 엔진과 별개인 단순 모델.

실행: PYTHONHASHSEED=0 python3 scripts/card-sim.py [변형...]
  extra=1           홍보물·안건 보류를 제시안과 함께 추가로 냄
  promo=double|royalty|pressure   홍보물 변형
  hold=priority     보류 + 다음 라운드 그 테이블에 낸 보류 팀 제안을 가장 먼저 적용
  practice=steal_fb 실무 교섭: 이번 라운드 그 테이블 합의 보상 가로채기, 합의 없으면 다음 라운드 시작 시 −6 (fbp=N)
  force=카드        카드를 받은 팀이 바로 쓰도록 강제
현재 규칙(v2.4) = extra=1 hold=priority practice=steal_fb
AG·LOOT 표는 src/deal/data.ts 를 손으로 옮긴 것이라 데이터를 바꾸면 여기도 맞출 것.

AI 팀: 남은 수치를 노이즈 섞어 추정(블라인드), 막타 가능해 보이는 테이블을 우선 노리고,
아니면 보상 큰 테이블을 깎음. 특수 카드는 쓸모 있어 보일 때 사용, 마지막 라운드엔 다 씀.
측정: 특정 라운드 시작 때 한 팀에게 카드 1장을 더 주고(처치) 안 준 경기(대조)와 비교한
  최종 점수 차(그 팀 − 다른 팀 평균)와 우승 확률 변화.
"""
import random, math, sys, statistics
from dataclasses import dataclass, field

AG = {  # id: (demand, reward)
    3: (2, 2), 5: (3, 2), 8: (3, 3), 12: (8, 2), 2: (5, 4), 7: (5, 4), 4: (6, 4), 6: (6, 5),
    9: (3, 7), 10: (8, 6), 1: (10, 8), 11: (12, 10)}
INIT = [3, 5, 8]
QUEUE = [12, 2, 7, 4, 6, 9, 10, 1]
FINAL = 11
LOOT = {3: 'promo', 5: 'hold', 8: 'blitz', 12: 'blitz', 2: 'practice'}
TEAMS = 'ABCDE'
ROUNDS = 5
SIGMA = 1.5  # 추정 오차

V = dict(promo='base', hold='base', practice='base', blitz=6)


@dataclass
class G:
    agenda: list
    rem: list
    promos: list
    queue: int = 0
    score: dict = field(default_factory=lambda: {t: 10 for t in TEAMS})
    hand: dict = field(default_factory=lambda: {t: [] for t in TEAMS})
    practice: list = field(default_factory=list)
    order: list = field(default_factory=list)
    prev: list = field(default_factory=list)
    round: int = 0
    log: dict = field(default_factory=lambda: {'used': {}, 'credit': {}})
    pressure: list = field(default_factory=lambda: [0, 0, 0, 0])  # 홍보물 변형용
    priority: dict = field(default_factory=dict)  # 보류 변형: 다음 라운드 우선 적용 {table: team}
    steal: dict = field(default_factory=dict)  # 실무 변형: {table: team}
    treated: str = ''
    fb: list = field(default_factory=list)


def new_game():
    return G(agenda=INIT + [0], rem=[AG[a][0] for a in INIT] + [0], promos=[[], [], [], []])


def bump(g, key, card):
    g.log[key][card] = g.log[key].get(card, 0) + 1


def damage(g, i, amount, team, card):
    if not g.agenda[i]:
        return False
    g.rem[i] -= amount
    if g.rem[i] > 0:
        return False
    a = g.agenda[i]
    winner = g.steal.pop(i, None) or team
    if winner != team:
        bump(g, 'credit', 'practice')
    else:
        bump(g, 'credit', card)
    g.score[winner] += AG[a][1]
    if a in LOOT:
        g.hand[winner].append(LOOT[a])
    if V['promo'] == 'royalty':
        for o in set(g.promos[i]):
            if o != winner:
                g.score[o] += 2
    # 보충
    g.promos[i] = [] if V['promo'] in ('royalty',) else g.promos[i]
    if i < 3 and g.queue < len(QUEUE):
        g.agenda[i] = QUEUE[g.queue]; g.queue += 1; g.rem[i] = AG[g.agenda[i]][0]
    else:
        g.agenda[i] = 0; g.rem[i] = 0
    return True


def decide(g, team, pos, rng):
    """(table, card) 선택"""
    last = g.round == ROUNDS
    opts = []
    est = [None] * 4
    for i in range(4):
        if g.agenda[i]:
            est[i] = max(1, g.rem[i] + round(rng.gauss(0, SIGMA)))
    first_bias = 0.85 ** pos
    for i in range(4):
        if not g.agenda[i]:
            continue
        d, r = AG[g.agenda[i]]
        loot = 1.5 if g.agenda[i] in LOOT else 0
        val_deal = (r + loot) * first_bias
        # 기본 제시안
        opts.append((val_deal if est[i] <= 2 else 0.15 * r, i, 'basic'))
        for c in set(g.hand[team]):
            if c == 'practice' and last:
                continue
            if V.get('extra') and c in ('promo', 'hold'):
                continue
            cost = 0 if last else 1.0
            if c == 'blitz':
                p = V['blitz']
                v = val_deal if est[i] <= p else 0.15 * r
                opts.append((v - cost, i, c))
            elif c == 'practice':
                if V['practice'] in ('steal', 'steal_fb'):
                    # 이번 라운드 이 테이블에서 합의가 나면 가로챔: 남은 수치가 작고 내 뒤에 깎을 팀이 많을수록 좋음
                    v = (r + loot) * (0.8 if est[i] <= 4 else 0.3)
                else:
                    v = (r + loot) * 0.75 if 2 < est[i] <= 10 else 0
                opts.append((v - cost, i, c))
            elif c == 'promo':
                left = ROUNDS - g.round + 1
                per = {'base': 1, 'double': 2, 'royalty': 1, 'pressure': 1}[V['promo']]
                v = 0.25 * r * min(1, per * left / max(est[i], 1))
                if V['promo'] == 'royalty':
                    v += 1.2
                if V['promo'] == 'pressure':
                    v += 0.6
                opts.append((v - cost * 0.5, i, c))
            elif c == 'hold':
                # 내가 앞 순번이 아니고 곧 합의될 것 같은 테이블을 막음
                v = 0.5 * r if est[i] <= 2 and pos >= 2 else 0
                if V['hold'] == 'priority' and not last:
                    v = 0.7 * (r + loot) if est[i] <= 4 else 0.1 * r
                opts.append((v - cost * 0.5, i, c))
    if V.get('force') and V['force'] in g.hand[team] and team == g.treated:
        mine = [o for o in opts if o[2] == V['force']]
        if mine:
            best = max(mine, key=lambda o: o[0] + rng.gauss(0, 0.4))
            return best[1], best[2]
    best = max(opts, key=lambda o: o[0] + rng.gauss(0, 0.4))
    return best[1], best[2]


def play_round(g, rng_for, treat=None):
    g.round += 1
    if g.round == 4:
        g.agenda[3] = FINAL; g.rem[3] = AG[FINAL][0]; g.promos[3] = []
    if treat and treat[1] == g.round:
        g.hand[treat[0]].append(treat[2])
    for team, i in g.practice:
        damage(g, i, 10, team, 'practice')
    g.practice = []
    for team, i in g.fb:
        damage(g, i, V.get('fbp', 6), team, 'practice')
    g.fb = []
    # 순서
    if not g.prev:
        o = list(TEAMS); rng_for('order').shuffle(o)
    else:
        o = sorted(TEAMS, key=lambda t: (-g.score[t], -g.prev.index(t)))
    g.prev = o
    g.order = o
    subs = {t: decide(g, t, k, rng_for(t)) for k, t in enumerate(o)}
    extra = {}
    if V.get('extra'):
        for k, t in enumerate(o):
            rng = rng_for(t)
            open_ = [i for i in range(4) if g.agenda[i]]
            if 'promo' in g.hand[t] and open_:
                # 보상 큰(=수치 큰) 테이블에 부착
                extra.setdefault(t, []).append((max(open_, key=lambda i: AG[g.agenda[i]][1] + rng.random()), 'promo'))
            if 'hold' in g.hand[t] and open_:
                est = {i: g.rem[i] + round(rng.gauss(0, SIGMA)) for i in open_}
                mine = subs[t][0]
                cand = [i for i in open_ if i != mine and est[i] <= 2] if k >= 1 else []
                if V['hold'] == 'priority':
                    cand = [i for i in open_ if est[i] <= 4 and i != mine] if g.round < ROUNDS else []
                if cand or g.round == ROUNDS:
                    pick = max(cand or open_, key=lambda i: AG[g.agenda[i]][1])
                    extra.setdefault(t, []).append((pick, 'hold'))
    # 보류 변형: 지난 라운드 보류 팀의 제안을 가장 먼저
    prio = g.priority; g.priority = {}
    frozen = set()
    for t in o:
        for i, c in [subs[t]] + extra.get(t, []):
            if c == 'hold' and g.agenda[i]:
                g.hand[t].remove('hold'); bump(g, 'used', 'hold'); frozen.add(i)
                if V['hold'] == 'priority':
                    g.priority[i] = t
    for t in o:
        for i, c in extra.get(t, []):
            if c == 'promo' and g.agenda[i]:
                g.hand[t].remove('promo'); bump(g, 'used', 'promo'); g.promos[i].append(t)
        i, c = subs[t]
        if c == 'practice' and V['practice'] in ('steal', 'steal_fb') and g.agenda[i] and i not in frozen:
            g.hand[t].remove(c); bump(g, 'used', c); g.steal[i] = t
    seq = list(o)
    if prio:
        first = [t for i, t in prio.items() if subs[t][0] == i and i not in frozen]
        seq = first + [t for t in o if t not in first]
    for t in seq:
        i, c = subs[t]
        if c == 'hold' or not g.agenda[i] or i in frozen:
            continue
        if c == 'practice' and V['practice'] in ('steal', 'steal_fb'):
            continue
        if c != 'basic':
            g.hand[t].remove(c); bump(g, 'used', c)
        if c == 'practice':
            g.practice.append((t, i))
            continue
        if c == 'promo':
            g.promos[i].append(t); continue
        p = 2 if c == 'basic' else V['blitz']
        if V['promo'] == 'pressure' and g.promos[i]:
            p += len(g.promos[i])
        damage(g, i, p, t, c)
    if V['practice'] == 'steal_fb':
        # 이번 라운드에 합의가 안 났으면 다음 라운드 시작 시 −6 (FB_POWER)
        for i, t in g.steal.items():
            g.fb.append((t, i))
    g.steal = {}
    per = 2 if V['promo'] == 'double' else 1
    for i in range(4):
        if i in frozen:
            continue
        for owner in list(g.promos[i]):
            if g.agenda[i]:
                damage(g, i, per, owner, 'promo')


def run(seed, treat=None):
    g = new_game()
    g.treated = treat[0] if treat else TEAMS[seed % 5]
    base = random.Random(seed)
    seeds = {}

    def rng_for(key):
        k = (g.round, key)
        if k not in seeds:
            seeds[k] = random.Random(hash((seed, g.round, key)))
        return seeds[k]

    for _ in range(ROUNDS):
        play_round(g, rng_for, treat)
    return g


def rel(g, t):
    others = [g.score[o] for o in TEAMS if o != t]
    return g.score[t] - sum(others) / len(others)


def win(g, t):
    top = max(g.score.values())
    w = [o for o in TEAMS if g.score[o] == top]
    return 1 / len(w) if t in w else 0


def marginal(card, rnd, n=3000):
    d_rel, d_win = [], []
    for s in range(n):
        t = TEAMS[s % 5]
        a = run(s); b = run(s, (t, rnd, card))
        d_rel.append(rel(b, t) - rel(a, t)); d_win.append(win(b, t) - win(a, t))
    return statistics.mean(d_rel), statistics.mean(d_win)


def stats(n=3000):
    used, credit, deals = {}, {}, []
    for s in range(n):
        g = run(s)
        for k, v in g.log['used'].items(): used[k] = used.get(k, 0) + v
        for k, v in g.log['credit'].items(): credit[k] = credit.get(k, 0) + v
        deals.append(g.queue)
    return {k: round(v / n, 2) for k, v in used.items()}, {k: round(v / n, 2) for k, v in credit.items()}, statistics.mean(deals)


if __name__ == '__main__':
    for kv in sys.argv[1:]:
        k, v = kv.split('=')
        V[k] = int(v) if v.isdigit() else v
    print('변형', V)
    u, c, q = stats()
    print('경기당 사용', u, '| 합의 기여(막타)', c, '| 대기열 소진', round(q, 2), '/ 8')
    cards = [V['force']] if V.get('force') else ['blitz', 'practice', 'promo', 'hold']
    for card in cards:
        row = []
        for rnd in (1, 2, 3):
            r, w = marginal(card, rnd)
            row.append(f'R{rnd}: {r:+.2f}점 {w * 100:+.1f}%p')
        print(f'{card:9s}', ' | '.join(row))
    r, w = marginal('basicbonus', 1) if False else (0, 0)
