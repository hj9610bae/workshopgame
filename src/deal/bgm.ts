/*
 * 배경음악. 단계(분위기)마다 곡이 바뀌고 1.5초에 걸쳐 넘어감.
 * public/sfx/bgm-<분위기>.mp3 가 있으면 그 파일을 반복 재생, 없으면 Web Audio로 만든 곡을 반복.
 * 분위기: intro(표지·설명) · voyage(순서 발표·공개) · tension(제출 3분) · sphinx(스핑크스) · final(8일차부터) · finale(최종 결과)
 * 효과음이 날 때는 duckBgm 으로 잠깐 줄임. 전체 소리 끄기(M)는 sound.ts 의 master 를 따름.
 */
import { audioOut } from './sound';

export type Mood = 'intro' | 'voyage' | 'tension' | 'sphinx' | 'final' | 'finale';
const MOODS: Mood[] = ['intro', 'voyage', 'tension', 'sphinx', 'final', 'finale'];

const BGM_KEY = 'odyssey-bgm-off';
/** 배경음악 음량 (효과음·진행자 목소리보다 확실히 작게) */
const VOLUME = 0.22;
/** 효과음이 나는 동안 줄여 둘 비율 */
const DUCK = 0.35;
const FADE = 1.5;

interface Style {
  bpm: number;
  /** 화음 (MIDI 음 번호, 낮은 음부터). 하나에 4박 */
  chords: number[][];
  /** harp: 8분음표 하프 펼침화음 · ostinato: 낮은 음 8분음표 반복 · sparse: 띄엄띄엄 높은 음 · none */
  arp: 'harp' | 'ostinato' | 'sparse' | 'none';
  /** soft: 마디 첫 박 · pulse: 매 박 작게 · war: 전투 북 */
  drums: 'none' | 'soft' | 'pulse' | 'war';
  /** 뒤에 깔리는 잔잔한 파도 */
  ocean: boolean;
}

const STYLES: Record<Mood, Style> = {
  // D 단조풍, 느리고 잔잔한 리라
  intro: { bpm: 72, chords: [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [48, 55, 60, 64]], arp: 'harp', drums: 'none', ocean: true },
  // 바다 모험: Dm–B♭–F–C
  voyage: { bpm: 96, chords: [[50, 57, 62, 65], [46, 53, 58, 62], [41, 53, 57, 60], [48, 55, 60, 64]], arp: 'harp', drums: 'soft', ocean: true },
  // 제출 3분: Dm 위에서 E♭로 반음 오르내리는 긴장
  tension: { bpm: 112, chords: [[50, 57, 62, 65], [50, 57, 62, 65], [51, 58, 63, 67], [50, 57, 62, 65]], arp: 'ostinato', drums: 'pulse', ocean: false },
  // 스핑크스: Am–E 화성 단음계, 느리고 신비롭게
  sphinx: { bpm: 60, chords: [[45, 52, 60, 64], [40, 52, 56, 59], [41, 53, 57, 60], [40, 52, 56, 59]], arp: 'sparse', drums: 'none', ocean: false },
  // 최종 결전: Cm–A♭–B♭–G, 전투 북
  final: { bpm: 104, chords: [[48, 55, 60, 63], [44, 56, 60, 63], [46, 53, 58, 62], [43, 55, 59, 62]], arp: 'ostinato', drums: 'war', ocean: false },
  // 피날레: C–G–Am–F 장조, 밝게
  finale: { bpm: 84, chords: [[48, 55, 60, 64], [43, 55, 59, 62], [45, 52, 60, 64], [41, 53, 57, 60]], arp: 'harp', drums: 'soft', ocean: false },
};

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

let bus: GainNode | undefined;
let duckUntil = 0;
let wanted: Mood | null = null;
let current: { mood: Mood; stop: () => void } | undefined;
const files = new Map<Mood, AudioBuffer | null>();
let loading = false;

export const bgmOn = (): boolean => localStorage.getItem(BGM_KEY) !== '1';
export function setBgmOn(on: boolean) {
  localStorage.setItem(BGM_KEY, on ? '0' : '1');
  setBgm(wanted);
}

/** 이 분위기의 곡을 틀어 둠 (null 이면 끔). 같은 분위기면 그대로. 오디오가 아직 안 깨어났으면 기억만 */
export function setBgm(mood: Mood | null) {
  wanted = mood;
  const a = audioOut();
  if (!a || a.ctx.state !== 'running') return;
  if (!bus) {
    bus = a.ctx.createGain();
    bus.gain.value = VOLUME;
    bus.connect(a.out);
  }
  if (!loading) {
    loading = true;
    void loadFiles(a.ctx);
  }
  const next = bgmOn() ? mood : null;
  if (current?.mood === next) return;
  current?.stop();
  current = next ? { mood: next, stop: play(a.ctx, bus, next) } : undefined;
}

/** 효과음이 나는 동안 배경음악을 줄였다가 sec 초 뒤 원래대로 */
export function duckBgm(sec: number) {
  const a = audioOut();
  if (!a || !bus) return;
  const t = a.ctx.currentTime;
  duckUntil = Math.max(duckUntil, t + sec);
  const g = bus.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(VOLUME * DUCK, t + 0.15);
  g.setValueAtTime(VOLUME * DUCK, duckUntil);
  g.linearRampToValueAtTime(VOLUME, duckUntil + 1.2);
}

async function loadFiles(c: AudioContext) {
  for (const mood of MOODS) {
    try {
      const res = await fetch(`sfx/bgm-${mood}.mp3`);
      const ok = res.ok && (res.headers.get('content-type') ?? '').includes('audio');
      files.set(mood, ok ? await c.decodeAudioData(await res.arrayBuffer()) : null);
    } catch {
      files.set(mood, null);
    }
    // 파일이 늦게 도착했으면 지금 분위기는 파일로 갈아탐
    if (files.get(mood) && current?.mood === mood) {
      current.stop();
      current = { mood, stop: play(c, bus!, mood) };
    }
  }
}

/** 한 곡을 틀고, 멈추는 함수를 돌려줌 (멈출 때 FADE 초 동안 줄어듦) */
function play(c: AudioContext, out: AudioNode, mood: Mood): () => void {
  const g = c.createGain();
  const t0 = c.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1, t0 + FADE);
  g.connect(out);
  const fadeOut = (stopAll: () => void) => () => {
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
    setTimeout(() => {
      stopAll();
      g.disconnect();
    }, FADE * 1000 + 100);
  };

  const file = files.get(mood);
  if (file) {
    const src = c.createBufferSource();
    src.buffer = file;
    src.loop = true;
    src.connect(g);
    src.start(t0);
    return fadeOut(() => src.stop());
  }

  const style = STYLES[mood];
  // 공간감: 짧은 메아리
  const delay = c.createDelay(1);
  delay.delayTime.value = (60 / style.bpm) * 0.75;
  const fb = c.createGain();
  fb.gain.value = 0.28;
  const wet = c.createGain();
  wet.gain.value = 0.3;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(g);

  const stops: (() => void)[] = [];
  if (style.ocean) stops.push(ocean(c, g));

  const beat = 60 / style.bpm;
  let next = t0 + 0.1;
  let n = 0;
  const timer = window.setInterval(() => {
    while (next < c.currentTime + 0.5) {
      scheduleBeat(c, g, delay, style, n, next, beat);
      next += beat;
      n += 1;
    }
  }, 100);
  return fadeOut(() => {
    clearInterval(timer);
    stops.forEach((s) => s());
  });
}

function scheduleBeat(c: AudioContext, out: AudioNode, fx: AudioNode, s: Style, n: number, t: number, beat: number) {
  const chord = s.chords[Math.floor(n / 4) % s.chords.length];
  const inBar = n % 4;
  if (inBar === 0) {
    pad(c, out, chord.slice(1), t, beat * 4);
    bass(c, out, chord[0] - 12, t, beat * 4);
  }
  // 펼침화음·반복음 (8분음표 둘)
  const up = [...chord.slice(1), chord[1] + 12, chord[2] + 12];
  for (const half of [0, 1]) {
    const at = t + (half * beat) / 2;
    const step = inBar * 2 + half;
    if (s.arp === 'harp') pluck(c, out, fx, mtof(up[step % up.length] + 12), at, 0.07);
    if (s.arp === 'ostinato') staccato(c, out, mtof(chord[0] - (step % 4 === 3 ? 5 : 0)), at);
    if (s.arp === 'sparse' && (step * 7 + n) % 5 === 0) pluck(c, out, fx, mtof(up[(step + n) % up.length] + 24), at, 0.05);
  }
  if (s.drums === 'soft' && inBar === 0) drum(c, out, t, 0.35);
  if (s.drums === 'pulse') drum(c, out, t, inBar === 0 ? 0.3 : 0.14);
  if (s.drums === 'war') {
    drum(c, out, t, inBar === 0 ? 0.5 : 0.22);
    if (inBar === 2) drum(c, out, t + beat / 2, 0.3);
  }
}

/** 현악·합창 같은 깔리는 화음 */
function pad(c: AudioContext, out: AudioNode, notes: number[], t: number, dur: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.6);
  g.gain.setValueAtTime(0.07, t + dur - 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.connect(g).connect(out);
  for (const m of notes)
    for (const d of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
}

function bass(c: AudioContext, out: AudioNode, m: number, t: number, dur: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = mtof(m);
  o.connect(g);
  o.start(t);
  o.stop(t + dur);
}

/** 하프·리라처럼 튕기는 음 */
function pluck(c: AudioContext, out: AudioNode, fx: AudioNode, f: number, t: number, vol: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  g.connect(out);
  g.connect(fx);
  for (const [type, mul, v] of [['triangle', 1, 1], ['sine', 2, 0.3]] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    const og = c.createGain();
    og.gain.value = v;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 1.2);
  }
}

/** 낮은 현을 짧게 끊어 켜는 소리 */
function staccato(c: AudioContext, out: AudioNode, f: number, t: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.connect(g).connect(out);
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = f;
  o.connect(lp);
  o.start(t);
  o.stop(t + 0.2);
}

function drum(c: AudioContext, out: AudioNode, t: number, vol: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  g.connect(out);
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.5);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.55);
}

/** 잔잔한 파도 (8초마다 밀려왔다 빠짐). 멈추는 함수를 돌려줌 */
function ocean(c: AudioContext, out: AudioNode): () => void {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const g = c.createGain();
  g.gain.value = 0.05;
  // 느린 물결: 음량과 필터를 함께 흔듦
  const lfo = c.createOscillator();
  lfo.frequency.value = 1 / 8;
  const depth = c.createGain();
  depth.gain.value = 0.035;
  lfo.connect(depth).connect(g.gain);
  const fdepth = c.createGain();
  fdepth.gain.value = 300;
  lfo.connect(fdepth).connect(lp.frequency);
  src.connect(lp).connect(g).connect(out);
  src.start();
  lfo.start();
  return () => {
    src.stop();
    lfo.stop();
  };
}
