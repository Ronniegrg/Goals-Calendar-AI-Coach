/**
 * Web Audio API Ambient Soundscape Generator
 * Synthesizes pure procedural noise and meditative soundscapes without external audio dependencies.
 */

export type SoundscapeType = "none" | "brown_noise" | "white_noise" | "rain" | "binaural_432";

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private currentType: SoundscapeType = "none";
  private gainNode: GainNode | null = null;
  private sourceNode: AudioNode | null = null;
  private secondarySourceNode: AudioNode | null = null;
  private volume: number = 0.5;

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getCurrentType(): SoundscapeType {
    return this.currentType;
  }

  public stop() {
    if (this.sourceNode) {
      try {
        (this.sourceNode as AudioBufferSourceNode).stop?.();
      } catch {
        // ignore
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.secondarySourceNode) {
      try {
        (this.secondarySourceNode as AudioBufferSourceNode).stop?.();
      } catch {
        // ignore
      }
      this.secondarySourceNode.disconnect();
      this.secondarySourceNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    this.currentType = "none";
  }

  public play(type: SoundscapeType) {
    this.stop();
    if (type === "none") return;

    this.initContext();
    if (!this.ctx) return;

    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    masterGain.connect(this.ctx.destination);
    this.gainNode = masterGain;

    if (type === "white_noise") {
      this.playWhiteNoise(masterGain);
    } else if (type === "brown_noise") {
      this.playBrownNoise(masterGain);
    } else if (type === "rain") {
      this.playRain(masterGain);
    } else if (type === "binaural_432") {
      this.playBinaural432(masterGain);
    }

    this.currentType = type;
  }

  private playWhiteNoise(destination: GainNode) {
    if (!this.ctx) return;
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Soft lowpass filter to make it gentle on ears
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(4500, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(destination);
    whiteNoise.start(0);
    this.sourceNode = whiteNoise;
  }

  private playBrownNoise(destination: GainNode) {
    if (!this.ctx) return;
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5; // Gain compensation
    }

    const brownNoise = this.ctx.createBufferSource();
    brownNoise.buffer = noiseBuffer;
    brownNoise.loop = true;

    // Filter to retain deep soothing rumbling tone
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    brownNoise.connect(filter);
    filter.connect(destination);
    brownNoise.start(0);
    this.sourceNode = brownNoise;
  }

  private playRain(destination: GainNode) {
    if (!this.ctx) return;
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.18;
    }

    const rainSource = this.ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
    filter.Q.setValueAtTime(0.7, this.ctx.currentTime);

    rainSource.connect(filter);
    filter.connect(destination);
    rainSource.start(0);
    this.sourceNode = rainSource;
  }

  private playBinaural432(destination: GainNode) {
    if (!this.ctx) return;
    // 432 Hz carrier with 10 Hz Alpha beat (Left: 432Hz, Right: 442Hz)
    const merger = this.ctx.createChannelMerger(2);

    const oscLeft = this.ctx.createOscillator();
    oscLeft.type = "sine";
    oscLeft.frequency.setValueAtTime(216, this.ctx.currentTime); // 216Hz octave for pleasant soothing hum

    const oscRight = this.ctx.createOscillator();
    oscRight.type = "sine";
    oscRight.frequency.setValueAtTime(226, this.ctx.currentTime); // 10Hz alpha differential

    const gainL = this.ctx.createGain();
    gainL.gain.setValueAtTime(0.3, this.ctx.currentTime);
    const gainR = this.ctx.createGain();
    gainR.gain.setValueAtTime(0.3, this.ctx.currentTime);

    oscLeft.connect(gainL);
    oscRight.connect(gainR);

    gainL.connect(merger, 0, 0);
    gainR.connect(merger, 0, 1);

    merger.connect(destination);

    oscLeft.start();
    oscRight.start();

    this.sourceNode = oscLeft;
    this.secondarySourceNode = oscRight;
  }
}

export const soundscapeEngine = new SoundscapeEngine();
