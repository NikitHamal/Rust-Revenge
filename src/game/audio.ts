/**
 * Fully procedural audio (WebAudio) — no asset downloads.
 * Call audio.init() from a user gesture. All sounds are rate limited.
 */
type SoundName =
  | 'pistol' | 'smg' | 'shotgun' | 'minigun' | 'swing' | 'flame' | 'tesla' | 'hit' | 'zdie' | 'groan'
  | 'pickup' | 'build' | 'upgrade' | 'slam' | 'hurt' | 'scream' | 'splash' | 'kick' | 'alarm' | 'win'
  | 'lose' | 'click' | 'chop' | 'boom' | 'error' | 'dawn';

const MIN_GAP: Partial<Record<SoundName, number>> = {
  pistol: 0.05, smg: 0.06, shotgun: 0.1, minigun: 0.05, flame: 0.12, tesla: 0.1, hit: 0.045, zdie: 0.06,
  groan: 0.35, pickup: 0.05, chop: 0.2, swing: 0.08,
};

class AudioSys {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  musicGain: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  last: Record<string, number> = {};
  volume = 0.7;
  muted = false;
  night = false;
  musicTimer: number | null = null;
  step = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.musicGain = c.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setVolume(v: number, muted: boolean) {
    this.volume = v;
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  setNight(n: boolean) {
    this.night = n;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0, dest?: AudioNode) {
    const c = this.ctx;
    if (!c || !this.sfx) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 0.7, type: BiquadFilterType = 'bandpass', delay = 0, sweepTo?: number) {
    const c = this.ctx;
    if (!c || !this.sfx || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name: SoundName, vol = 1) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const now = c.currentTime;
    const gap = MIN_GAP[name] ?? 0;
    if (gap && now - (this.last[name] ?? -1) < gap) return;
    this.last[name] = now;
    const v = vol;
    switch (name) {
      case 'pistol': this.noise(0.09, 0.5 * v, 2400, 0.8); this.tone(260, 0.1, 'square', 0.14 * v, 70); break;
      case 'smg': this.noise(0.06, 0.38 * v, 3000, 0.9); this.tone(200, 0.06, 'square', 0.1 * v, 80); break;
      case 'shotgun': this.noise(0.25, 0.8 * v, 1200, 0.6); this.tone(120, 0.2, 'sawtooth', 0.25 * v, 40); break;
      case 'minigun': this.noise(0.05, 0.3 * v, 2000, 0.8); this.tone(150, 0.05, 'square', 0.08 * v, 70); break;
      case 'swing': this.noise(0.14, 0.25 * v, 900, 1.2, 'bandpass', 0, 300); break;
      case 'flame': this.noise(0.18, 0.2 * v, 600, 0.5, 'lowpass'); break;
      case 'tesla': this.tone(900, 0.16, 'sawtooth', 0.14 * v, 200); this.noise(0.12, 0.2 * v, 5000, 2, 'highpass'); break;
      case 'hit': this.tone(130, 0.07, 'triangle', 0.22 * v, 60); this.noise(0.05, 0.14 * v, 700); break;
      case 'zdie': this.tone(180, 0.35, 'sawtooth', 0.12 * v, 45); this.noise(0.15, 0.12 * v, 500, 1, 'lowpass'); break;
      case 'groan': {
        const f = 70 + Math.random() * 50;
        this.tone(f, 0.9, 'sawtooth', 0.07 * v, f * 0.6);
        this.tone(f * 1.5, 0.8, 'square', 0.025 * v, f * 0.9);
        break;
      }
      case 'pickup': this.tone(760, 0.08, 'triangle', 0.14 * v); this.tone(1140, 0.12, 'triangle', 0.14 * v, undefined, 0.06); break;
      case 'chop': this.noise(0.07, 0.35 * v, 500, 1.4); this.tone(110, 0.08, 'triangle', 0.2 * v, 60); break;
      case 'build': this.tone(180, 0.09, 'square', 0.2 * v, 90); this.tone(220, 0.09, 'square', 0.2 * v, 100, 0.13); this.noise(0.1, 0.2 * v, 1500, 1, 'bandpass', 0.13); break;
      case 'upgrade': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16 * v, undefined, i * 0.08)); break;
      case 'slam': this.tone(90, 0.5, 'sine', 0.6 * v, 28); this.noise(0.4, 0.5 * v, 400, 0.6, 'lowpass', 0, 80); break;
      case 'boom': this.tone(70, 0.6, 'sine', 0.5 * v, 25); this.noise(0.5, 0.6 * v, 700, 0.6, 'lowpass', 0, 90); break;
      case 'hurt': this.noise(0.18, 0.4 * v, 800, 0.8); this.tone(300, 0.2, 'sawtooth', 0.16 * v, 100); break;
      case 'scream': {
        const c2 = this.ctx!;
        const t = c2.currentTime;
        const o = c2.createOscillator();
        const g = c2.createGain();
        const lfo = c2.createOscillator();
        const lg = c2.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(420, t);
        o.frequency.linearRampToValueAtTime(900, t + 0.25);
        o.frequency.linearRampToValueAtTime(520, t + 1.1);
        lfo.frequency.value = 24;
        lg.gain.value = 40;
        lfo.connect(lg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        const f = c2.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1200;
        f.Q.value = 0.7;
        o.connect(f).connect(g).connect(this.sfx!);
        o.start(t);
        lfo.start(t);
        o.stop(t + 1.3);
        lfo.stop(t + 1.3);
        break;
      }
      case 'splash': this.noise(0.5, 0.5 * v, 1800, 0.5, 'bandpass', 0, 400); break;
      case 'kick': this.tone(140, 0.12, 'triangle', 0.35 * v, 50); this.noise(0.08, 0.3 * v, 600); break;
      case 'alarm': this.tone(220, 1.6, 'sawtooth', 0.22 * v, 160); this.tone(330, 1.6, 'square', 0.08 * v, 240); break;
      case 'dawn': [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.14 * v, undefined, i * 0.12)); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.2 * v, undefined, i * 0.14)); break;
      case 'lose': [330, 262, 208, 147].forEach((f, i) => this.tone(f, 0.6, 'sawtooth', 0.14 * v, f * 0.8, i * 0.25)); break;
      case 'click': this.tone(520, 0.05, 'square', 0.08 * v, 300); break;
      case 'error': this.tone(140, 0.18, 'square', 0.14 * v, 100); break;
    }
  }

  /** Generative ambient score: soft pentatonic plucks by day, tense drone + pulse at night. */
  private startMusic() {
    const c = this.ctx;
    if (!c || !this.musicGain || this.musicTimer) return;
    // sustained drone pad
    const padFilter = c.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 500;
    const padGain = c.createGain();
    padGain.gain.value = 0.22;
    padFilter.connect(padGain).connect(this.musicGain);
    [55, 82.4, 110.2].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      o.connect(padFilter);
      o.start();
    });
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.08;
    lg.gain.value = 220;
    lfo.connect(lg).connect(padFilter.frequency);
    lfo.start();

    const penta = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
      this.step++;
      const t = this.ctx.currentTime;
      if (this.night) {
        // heartbeat pulse + occasional dark stab
        if (this.step % 2 === 0) this.musicTone(55, 0.35, 'sine', 0.5, 40, t);
        if (this.step % 8 === 0) this.musicTone(110 * (Math.random() < 0.5 ? 1 : 1.0595), 1.4, 'sawtooth', 0.07, 100, t);
      } else if (this.step % 3 === 0 && Math.random() < 0.8) {
        const f = penta[Math.floor(Math.random() * penta.length)];
        this.musicTone(f, 1.6, 'triangle', 0.12, undefined, t);
        if (Math.random() < 0.3) this.musicTone(f * 1.5, 1.4, 'sine', 0.06, undefined, t + 0.2);
      }
    }, 600);
  }

  private musicTone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo: number | undefined, t: number) {
    const c = this.ctx;
    if (!c || !this.musicGain) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

export const audio = new AudioSys();
