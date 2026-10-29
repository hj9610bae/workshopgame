import './style.css';

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <section class="center home">
    <h1>오디세이아 : 귀환의 항해</h1>
    <p class="muted">10일간의 항해</p>
    <a class="button" href="board.html">현장 진행 <span class="small">(한 화면 · 진행자가 입력)</span></a>
    <p class="muted small">폰으로 제출하는 방식</p>
    <a class="button secondary" href="host.html">사회자 화면 <span class="small">(프로젝터용 · QR 방 만들기)</span></a>
    <a class="button secondary" href="play.html">팀 대표 참가</a>
  </section>`;
