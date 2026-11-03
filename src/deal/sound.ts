/*
 * 현장 진행 효과음. 음원 파일 없이 Web Audio로 합성해서 바로 씀.
 * 진짜 음원으로 바꾸고 싶으면 public/sfx/<이름>.mp3 (예: slash.mp3)를 넣으면 그 파일을 우선 재생.
 * 이름: slash, arrow, impact, magic, drum, waves, horn, chain, fail, drumroll
 * 배경음악은 bgm.ts (같은 AudioContext, 효과음이 나는 동안 살짝 줄어듦)
 * 브라우저는 그 창에서 한 번 클릭·키 입력이 있어야 소리를 낼 수 있음 (unlockSound).
 */

export type Sfx = 'slash' | 'arrow' | 'impact' | 'magic' | 'drum' | 'waves' | 'horn' | 'chain' | 'fail' | 'drumroll';
/** [효과음, 시작까지 기다릴 초] */
export type Cue = [Sfx, number][];

const MUTE_KEY = 'odyssey-sound-muted';
/** 전체 음량 (효과음·배경음악 모두) */
const MASTER = 0.9;

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuf: AudioBuffer | undefined;
const samples = new Map<Sfx, AudioBuffer | null>();

export const isMuted = (): boolean => localStorage.getItem(MUTE_KEY) === '1';
export function setMuted(on: boolean) {
  localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  if (master) master.gain.value = on ? 0 : MASTER;
}
/** 배경음악(bgm.ts)이 같은 오디오·전체 음량을 쓰도록 */
export const audioOut = (): { ctx: AudioContext; out: AudioNode } | undefined => (ctx && master ? { ctx, out: master } : undefined);
/** 이 창에서 소리를 낼 수 있는지 (클릭 전이면 false) */
export const soundReady = (): boolean => ctx?.state === 'running';

/** 클릭·키 입력 때 불러서 오디오를 깨움 */
export function unlockSound() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = isMuted() ? 0 : MASTER;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    void loadSamples();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

const NAMES: Sfx[] = ['slash', 'arrow', 'impact', 'magic', 'drum', 'waves', 'horn', 'chain', 'fail', 'drumroll'];
async function loadSamples() {
  for (const name of NAMES) {
    try {
      const res = await fetch(`sfx/${name}.mp3`);
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) {
        samples.set(name, null);
        continue;
      }
      samples.set(name, await ctx!.decodeAudioData(await res.arrayBuffer()));
    } catch {
      samples.set(name, null);
    }
  }
}

export function playCue(cue: Cue) {
  if (!ctx || !master || isMuted() || !cue.length) return;
  // 첫 클릭으로 막 만든 오디오는 잠깐 suspended 상태일 수 있어 깨어난 뒤 재생
  if (ctx.state !== 'running') {
    void ctx.resume().then(() => schedule(cue));
    return;
  }
  schedule(cue);
}

function schedule(cue: Cue) {
  if (!ctx || !master) return;
  for (const [name, delay] of cue) {
    const at = ctx.currentTime + 0.02 + delay;
    const buf = samples.get(name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.7;
      src.connect(g).connect(master);
      src.start(at);
    } else SYNTH[name](ctx, master, at);
  }
}

/* ───────── 합성 ───────── */

type Synth = (c: AudioContext, out: AudioNode, t: number) => void;

/** 0 → peak 로 attack 초 동안 올렸다가 decay 초 동안 지수로 줄어드는 음량 */
function env(c: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function noise(c: AudioContext, t: number, dur: number): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuf!;
  src.loop = true;
  src.start(t, Math.random());
  src.stop(t + dur);
  return src;
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, endFreq?: number): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  o.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function filter(c: AudioContext, out: AudioNode, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(out);
  return f;
}

/** 칼이 베어지는 소리: 높은 데서 내려오는 바람 소리 + 쇳소리 */
const slash: Synth = (c, out, t) => {
  const g = env(c, out, t, 0.5, 0.01, 0.22);
  const bp = filter(c, g, 'bandpass', 6000, 2.5);
  bp.frequency.setValueAtTime(7000, t);
  bp.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
  noise(c, t, 0.3).connect(bp);
  const ring = env(c, out, t + 0.02, 0.06, 0.005, 0.5);
  tone(c, ring, 'sine', 3520, t + 0.02, 0.5);
  tone(c, ring, 'sine', 4980, t + 0.02, 0.35);
};

/** 화살이 날아가 꽂히는 소리 */
const arrow: Synth = (c, out, t) => {
  const g = env(c, out, t, 0.35, 0.25, 0.08);
  const bp = filter(c, g, 'bandpass', 800, 4);
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.exponentialRampToValueAtTime(4000, t + 0.33);
  noise(c, t, 0.4).connect(bp);
  const hit = t + 0.34;
  tone(c, env(c, out, hit, 0.6, 0.003, 0.18), 'triangle', 220, hit, 0.18, 70);
  noise(c, hit, 0.06).connect(filter(c, env(c, out, hit, 0.4, 0.002, 0.06), 'highpass', 2000));
  // 꽂힌 화살대가 떨리는 소리
  tone(c, env(c, out, hit + 0.01, 0.08, 0.01, 0.35), 'square', 140, hit, 0.4);
};

/** 묵직한 타격음 */
const impact: Synth = (c, out, t) => {
  tone(c, env(c, out, t, 0.9, 0.004, 0.45), 'sine', 130, t, 0.45, 40);
  noise(c, t, 0.25).connect(filter(c, env(c, out, t, 0.55, 0.003, 0.2), 'lowpass', 900));
};

/** 신비로운 마법 효과음: 반짝이는 아르페지오 */
const magic: Synth = (c, out, t) => {
  const notes = [1046.5, 1318.5, 1568, 2093, 2637, 3136];
  notes.forEach((f, i) => {
    const at = t + i * 0.07;
    const g = env(c, out, at, 0.12, 0.01, 1.2);
    tone(c, g, 'sine', f, at, 1.2);
    tone(c, g, 'sine', f * 1.005, at, 1.2);
  });
  const g = env(c, out, t, 0.08, 0.3, 1.0);
  const bp = filter(c, g, 'bandpass', 5000, 6);
  bp.frequency.setValueAtTime(3000, t);
  bp.frequency.exponentialRampToValueAtTime(9000, t + 1.2);
  noise(c, t, 1.4).connect(bp);
};

/** 큰 북 (팀파니) */
const drum: Synth = (c, out, t) => {
  tone(c, env(c, out, t, 0.9, 0.005, 0.9), 'sine', 98, t, 0.9, 55);
  noise(c, t, 0.15).connect(filter(c, env(c, out, t, 0.4, 0.002, 0.12), 'lowpass', 600));
};

/** 파도 소리: 두 번 밀려왔다 빠지는 물결 */
const waves: Synth = (c, out, t) => {
  for (const [at, dur] of [
    [0, 1.6],
    [1.1, 1.9],
  ]) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.35, t + at + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
    g.connect(out);
    const lp = filter(c, g, 'lowpass', 500, 0.7);
    lp.frequency.setValueAtTime(400, t + at);
    lp.frequency.linearRampToValueAtTime(1400, t + at + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(350, t + at + dur);
    noise(c, t + at, dur).connect(lp);
  }
};

/** 웅장한 뱃고동 */
const horn: Synth = (c, out, t) => {
  const dur = 1.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.25);
  g.gain.setValueAtTime(0.35, t + dur - 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  const lp = filter(c, g, 'lowpass', 520, 1.5);
  for (const f of [98, 147, 196.5]) tone(c, lp, 'sawtooth', f, t, dur);
};

/** 닻을 내리는 쇠사슬 소리: 금속이 차르르 */
const chain: Synth = (c, out, t) => {
  for (let i = 0; i < 9; i++) {
    const at = t + i * 0.055 + Math.random() * 0.02;
    const vol = 0.22 * (1 - i / 12);
    noise(c, at, 0.04).connect(filter(c, env(c, out, at, vol, 0.002, 0.04), 'bandpass', 3000 + Math.random() * 2500, 3));
    tone(c, env(c, out, at, vol * 0.25, 0.002, 0.12), 'square', 1800 + Math.random() * 1600, at, 0.12);
  }
  // 마지막에 닻이 '쿵'
  const end = t + 0.55;
  tone(c, env(c, out, end, 0.5, 0.004, 0.35), 'sine', 90, end, 0.35, 45);
};

/** 무효: 둔하게 내려가는 소리 */
const fail: Synth = (c, out, t) => {
  const lp = filter(c, env(c, out, t, 0.25, 0.01, 0.5), 'lowpass', 600);
  tone(c, lp, 'sawtooth', 196, t, 0.5, 110);
};

/** 북 연타 (최종 결전 등장) */
const drumroll: Synth = (c, out, t) => {
  for (let i = 0; i < 18; i++) {
    const at = t + i * 0.06;
    const vol = 0.08 + (0.3 * i) / 18;
    noise(c, at, 0.06).connect(filter(c, env(c, out, at, vol, 0.003, 0.06), 'bandpass', 250, 1));
  }
  drum(c, out, t + 1.1);
};

const SYNTH: Record<Sfx, Synth> = { slash, arrow, impact, magic, drum, waves, horn, chain, fail, drumroll };
