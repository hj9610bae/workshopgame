/*
 * 게임 설명 슬라이드 + 연습 게임 배치.
 * 설명이 끝나면 실제 진행 화면으로 1라운드 연습 게임을 해요. 실제 첫 테이블·요구 수치가 드러나지 않게
 * 연습 게임은 안건 순서·전리품을 무작위로 정하고, 요구 수치도 보상 근처의 연습용 값을 써요.
 */
import { AGENDAS, CARDS, FINAL_AGENDA, LOOT_ORDER, SUBMIT_SECONDS, type Setup } from './data';
import type { Rng } from './engine';

export interface Slide {
  kind: 'slide';
  title: string;
  /** 직접 작성한 본문 HTML */
  html: string;
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 연습 게임 배치: 성과급을 뺀 안건을 섞어 테이블 3 + 대기열, 전리품도 무작위 안건에, 요구 수치는 보상 −1~+2 (최소 2) */
export function practiceSetup(rng: Rng = Math.random): Setup {
  const ids = shuffled(
    Object.values(AGENDAS)
      .map((a) => a.id)
      .filter((id) => id !== FINAL_AGENDA),
    rng,
  );
  const lootAt = shuffled(ids, rng).slice(0, LOOT_ORDER.length);
  return {
    tables: ids.slice(0, 3),
    queue: ids.slice(3),
    demand: Object.fromEntries(ids.map((id) => [id, Math.max(2, AGENDAS[id].reward - 1 + Math.floor(rng() * 4))])),
    loot: Object.fromEntries(lootAt.map((id, i) => [id, LOOT_ORDER[i]])),
  };
}

const cardTile = (id: keyof typeof CARDS, power: string) =>
  `<div class="rule-card ${id}"><div class="rule-card-name">${CARDS[id].name}</div><div class="rule-card-power">${power}</div><p>${CARDS[id].desc}</p></div>`;

const hiddenCard = '<div class="rule-card secret"><div class="rule-card-name">특수 카드</div><div class="rule-card-power">?</div><p>합의 전리품으로만 획득</p></div>';

const sample = AGENDAS[3];

export const INTRO_SLIDES: Slide[] = [
  {
    kind: 'slide',
    title: '💼 교섭의 도박사들 : Deal or No Deal',
    html: `<p class="lead">노조 요구안의 타결 장벽을 넘어<br><b>회사의 교섭 주도권</b>을 극대화하라!</p>
      <p>팀별로 협상 테이블에 제시안 카드를 던져 안건을 합의시키는 게임입니다.<br>5라운드 뒤 <b>주도권 점수</b>가 가장 높은 팀이 우승!</p>`,
  },
  {
    kind: 'slide',
    title: '🎯 막타 시스템',
    html: `<div class="slide-row">
        <div class="mini-table"><div class="mini-icon">${sample.icon}</div><div class="mini-title">${sample.title}</div><div class="mini-gap">노조 요구<br>${sample.union}</div><div class="mini-reward">합의 보상 +${sample.reward}</div></div>
        <div class="slide-text">
          <p>안건마다 숨겨진 <b>노조 요구 수치</b>가 있어요.</p>
          <p>각 팀이 카드로 수치를 깎고,<br><b>0 이하로 만든 팀이 보상을 독식</b>합니다.</p>
          <p class="muted">남이 깎아 둔 안건을 마지막에 가져갈 수도, 뺏길 수도 있어요.</p>
        </div>
      </div>`,
  },
  {
    kind: 'slide',
    title: '🙈 요구 수치는 블라인드',
    html: `<ul class="slide-list">
        <li>테이블에는 <b>노조 요구안</b>과 <b>합의 보상</b>만 보여요. 요구 수치는 <b>처음 값도, 남은 값도</b> 비공개.</li>
        <li>요구안의 크기와 보상을 보고 얼마나 깎아야 할지 추측하세요. 보통은 <b>보상이 클수록 수치도 커요.</b> 하지만 <b>예외</b>도 숨어 있어요!</li>
        <li>확인하고 싶으면 <b>🔍 속마음 스카우터</b>(주도권 −1)로 우리 팀만 몰래 볼 수 있어요.</li>
        <li>안건이 <b>합의되는 순간</b> 회사의 <b>실제 타결 내용</b>, 처음 요구 수치, <b>누가 얼마나 깎았는지</b> 이력이 공개돼요.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '💰 교섭 주도권 = 점수',
    html: `<ul class="slide-list">
        <li><b>시작 10점</b>. 안건을 합의하면 보상만큼 올라가요.</li>
        <li><b>순서</b>: 주도권이 높은 팀부터 제안해요. (동점이면 지난 라운드 뒤 순번이 먼저)</li>
        <li><b>아이템</b>을 사면 주도권이 줄어요. 지금 쓰면 우승 점수가 줄어든다는 것!</li>
        <li><b>5라운드 종료</b> 후 주도권이 가장 높은 팀이 우승.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '🃏 제시안 카드: 매 라운드 1장을 테이블 1곳에',
    html: `<div class="rule-cards">${cardTile('basic', '−2')}${hiddenCard}</div>
      <ul class="slide-list">
        <li>모든 팀은 <b>기본 제시안</b>만 가지고 시작해요. 매 라운드 몇 번이든 쓸 수 있어요.</li>
        <li>보상에 <b>'특수 카드'</b>가 붙은 안건을 합의하면 <b>전리품</b>으로 특수 카드를 얻어요.</li>
        <li>특수 카드가 무엇인지, 어떤 효과인지는 <b>얻은 팀만</b> 알아요. 진행자가 몰래 알려 드려요.</li>
      </ul>`,
  },
  {
    kind: 'slide',
    title: '🔍 아이템 ① 속마음 스카우터 (주도권 −1)',
    html: `<ol class="flow">
        <li><b>언제</b><span>제출 시간(${SUBMIT_SECONDS / 60}분) 중 언제든, 몇 번이든</span></li>
        <li><b>신청</b><span>팀 대표가 진행자에게 "<b>N번 테이블 스카우터</b>"</span></li>
        <li><b>바로 확인</b><span>진행자가 그 자리에서 남은 요구 수치를 <b>우리 팀에게만</b> 보여 줘요</span></li>
        <li><b>활용</b><span>결과를 보고 제출 용지를 쓰거나 고쳐서 내면 돼요</span></li>
      </ol>
      <p class="center muted">확인 시점의 값이에요. 이번 라운드에 앞 순번 팀이 먼저 깎으면 내 차례엔 더 줄어 있을 수 있어요.</p>`,
  },
  {
    kind: 'slide',
    title: '⚡ 아이템 ② 새치기 제안 (주도권 −2)',
    html: `<ol class="flow">
        <li><b>신청</b><span>포스트잇에 <b>"새치기 N번째"</b>를 함께 적어요 (1번째 ~ 마지막)</span></li>
        <li><b>비밀 유지</b><span>다른 팀은 모른 채 각자 제출해요</span></li>
        <li><b>짠! 공개</b><span>모든 용지를 입력하고 제안 공개를 시작할 때 <b>"새치기 발생! 새 순서"</b>가 화면에 떠요</span></li>
        <li><b>적용</b><span>바뀐 순서대로 제안이 적용돼요. 막타를 노려 <b>뒤 순번</b>으로 갈 수도 있어요</span></li>
      </ol>
      <div class="cut-example">
        <p><b>2팀 이상 같은 자리를 원하면?</b> 주도권이 높은 팀이 그 자리, 밀린 팀은 <b>바로 다음 빈자리</b>. (동점이면 원래 순번이 앞인 팀) 새치기하지 않은 팀은 남은 자리를 원래 순서대로 채워요. 밀려도 −2는 그대로!</p>
        <p class="muted">예) 원래 순서 A(14) · B(12) · C(10) · D(9) · E(8)에서 D·E가 모두 "1번째" 신청<br>
          → D가 1번째, E는 2번째 → <b>D → E → A → B → C</b></p>
      </div>`,
  },
  {
    kind: 'slide',
    title: '🔁 한 라운드 진행',
    html: `<ol class="flow">
        <li><b>순서 발표</b><span>주도권 높은 순</span></li>
        <li><b>포스트잇 작성 (${SUBMIT_SECONDS / 60}분)</b><span>[팀 + 테이블 + 카드], 필요하면 스카우터·새치기</span></li>
        <li><b>보조자가 입력</b><span>포스트잇을 걷어 화면에 입력</span></li>
        <li><b>제안 공개</b><span>새치기 순서 공개 → 1위 팀부터 차례로 합의 여부 발표</span></li>
        <li><b>라운드 종료</b><span>점수 확인</span></li>
      </ol>
      <p class="center">🏁 <b>4라운드</b>에는 4번 테이블에 <b>성과급(+10)</b> 최종 교섭이 열려요!</p>`,
  },
];

export const OUTRO_SLIDE: Slide = {
  kind: 'slide',
  title: '🎲 연습 게임으로 1라운드 해 볼까요?',
  html: `<ul class="slide-list">
      <li>실제 게임과 똑같은 화면으로 <b>1라운드만</b> 연습해요. 점수는 실제 게임에 이어지지 않아요.</li>
      <li>연습 게임의 안건 순서·요구 수치·전리품은 <b>무작위</b>라 실제 게임과 달라요.</li>
      <li>테이블엔 <b>노조 요구안</b>만! 요구 수치와 타결 내용은 <b>합의될 때</b> 공개돼요.</li>
    </ul>
    <button class="practice-btn" data-action="practice">▶ 연습 게임 시작</button>`,
};

export const tutorialSteps = (): Slide[] => [...INTRO_SLIDES, OUTRO_SLIDE];
