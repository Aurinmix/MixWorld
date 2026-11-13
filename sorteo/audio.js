// Efectos de sonido sintetizados por Web Audio API (sin dependencias externas)

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(val) {
    this.muted = !!val;
  }

  playCountdownTick(isFinal = false) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isFinal ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 520, now);
    if (isFinal) {
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.14);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isFinal ? 0.22 : 0.14, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.45 : 0.18));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (isFinal ? 0.48 : 0.2));
  }

  playRoar(heavy = true) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = heavy ? 0.95 : 0.55;

    // Oscilador gutural
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(heavy ? 125 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 48 : 95, now + dur);

    // Modulación de gruñido
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(heavy ? 24 : 36, now);
    lfoGain.gain.setValueAtTime(heavy ? 22 : 16, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Filtro pasa-bajos resonante
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(heavy ? 480 : 820, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + dur);
    filter.Q.setValueAtTime(4.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(heavy ? 0.24 : 0.14, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + dur + 0.05);
    lfo.stop(now + dur + 0.05);
  }

  playBiteImpact() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Impacto sub-grave estilo cámara lenta cine
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(130, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.65);

    subGain.gain.setValueAtTime(0.32, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.start(now);
    sub.stop(now + 0.72);

    // Ruido de mordida
    const bufferSize = this.ctx.sampleRate * 0.16;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(650, now);
    bp.Q.setValueAtTime(1.5, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.28, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start(now);
  }

  playVictory() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // Acorde épico La mayor / Tek
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
      const start = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 1.45);
    });
  }
}

export const soundEngine = new SoundEngine();
