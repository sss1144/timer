/* 音の一覧（音源ファイルを使わずブラウザで作る）。
 * ここに 1 つ足すだけで、設定画面の「作業終了の音」「作業開始の音」で選べるようになる。 */

export type SoundDef = {
  id: string;
  name: string;
  /** 音の長さ（秒）。予約の取り消しや重なりの目安 */
  duration: number;
  /** when（AudioContext の時刻）に鳴るよう予約し、作った音源を返す（取り消しに使う） */
  schedule: (ctx: AudioContext, out: AudioNode, when: number) => AudioScheduledSourceNode[];
};

/** 1 つの音（音の高さ・始まる時刻・長さ・波形・大きさ） */
function tone(ctx: AudioContext, out: AudioNode, freq: number, start: number, dur: number, type: OscillatorType, peak: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
  return osc;
}

export const SOUNDS: SoundDef[] = [
  {
    id: 'chime',
    name: 'チャイム',
    duration: 2.4,
    schedule: (ctx, out, when) => {
      const nodes: AudioScheduledSourceNode[] = [];
      for (let rep = 0; rep < 2; rep++) {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nodes.push(tone(ctx, out, f, when + rep * 1.2 + i * 0.16, 0.7, 'sine', 0.22)));
      }
      return nodes;
    },
  },
  {
    id: 'bell',
    name: 'ベル',
    duration: 3.2,
    schedule: (ctx, out, when) => {
      const nodes: AudioScheduledSourceNode[] = [];
      for (let rep = 0; rep < 2; rep++) {
        const base = when + rep * 1.6;
        nodes.push(tone(ctx, out, 880, base, 1.5, 'sine', 0.25));
        nodes.push(tone(ctx, out, 2217, base, 0.9, 'sine', 0.08));
        nodes.push(tone(ctx, out, 1320, base + 0.02, 1.2, 'triangle', 0.06));
      }
      return nodes;
    },
  },
  {
    id: 'beep',
    name: '電子音',
    duration: 1.8,
    schedule: (ctx, out, when) => {
      const nodes: AudioScheduledSourceNode[] = [];
      for (let rep = 0; rep < 2; rep++) {
        for (let i = 0; i < 3; i++) nodes.push(tone(ctx, out, 1000, when + rep * 0.9 + i * 0.17, 0.11, 'square', 0.08));
      }
      return nodes;
    },
  },
];

/** ID から音を探す。見つからなければ一覧の先頭 */
export function findSound(id: string): SoundDef {
  return SOUNDS.find(s => s.id === id) ?? SOUNDS[0];
}
