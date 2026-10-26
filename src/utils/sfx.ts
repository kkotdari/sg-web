let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playMagicRise(): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    const RISE = 0.44;

    const out = ac.createGain();
    out.gain.setValueAtTime(1, t0);
    out.connect(ac.destination);

    const len = Math.max(1, Math.floor(ac.sampleRate * (RISE + 0.12)));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.setValueAtTime(9, t0);
    bp.frequency.setValueAtTime(420, t0);
    bp.frequency.exponentialRampToValueAtTime(5200, t0 + RISE);
    const noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.022, t0 + 0.045);
    noiseGain.gain.exponentialRampToValueAtTime(0.075, t0 + RISE * 0.85);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + RISE + 0.12);
    noise.connect(bp).connect(noiseGain).connect(out);
    noise.start(t0);

    const sweep = ac.createOscillator();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(320, t0);
    sweep.frequency.exponentialRampToValueAtTime(1568, t0 + RISE);
    const sweepGain = ac.createGain();
    sweepGain.gain.setValueAtTime(0.0001, t0);
    sweepGain.gain.exponentialRampToValueAtTime(0.015, t0 + 0.05);
    sweepGain.gain.exponentialRampToValueAtTime(0.048, t0 + RISE * 0.7);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, t0 + RISE + 0.07);
    sweep.connect(sweepGain).connect(out);
    sweep.start(t0);
    sweep.stop(t0 + RISE + 0.12);

    const bellAt = t0 + RISE;
    const BELL = 2093;
    for (const [ratio, vol, decay] of [
      [1.0, 1.0, 0.55], [2.76, 0.42, 0.34], [5.40, 0.18, 0.2],
    ] as [number, number, number][]) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(BELL * ratio, bellAt);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, bellAt);
      g.gain.exponentialRampToValueAtTime(0.08 * vol, bellAt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, bellAt + decay);
      o.connect(g).connect(out);
      o.start(bellAt);
      o.stop(bellAt + decay + 0.05);
    }

    const SPARKS = 7, SPAN = 0.6;
    for (let i = 0; i < SPARKS; i++) {
      const at = bellAt + 0.05 + (i + Math.random()) * (SPAN / SPARKS);
      const f = 2600 + Math.random() * 3400;
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, at + 0.09);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.028, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.14);
    }
  } catch {
  }
}
