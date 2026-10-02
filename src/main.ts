import './style.css';

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <section class="center home">
    <h1>💼 교섭의 도박사들</h1>
    <p class="muted">Deal or No Deal</p>
    <a class="button" href="host.html">사회자 화면 <span class="small">(프로젝터용 · 방 만들기)</span></a>
    <a class="button secondary" href="play.html">팀 대표 참가</a>
  </section>`;
