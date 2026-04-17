export class AudioEngine {
  private readonly audioCtx = new AudioContext({ latencyHint: "interactive" });
  private readonly analyser = this.audioCtx.createAnalyser();
  private readonly gain = this.audioCtx.createGain();

  private audioBuffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  private pausedOffset = 0;
  private startedAt = 0;
  private playing = false;
  private readonly endedListeners = new Set<() => void>();

  constructor() {
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -15;

    this.analyser.connect(this.gain);
    this.gain.connect(this.audioCtx.destination);
    this.gain.gain.value = 0.95;
  }

  async load(file: File) {
    const buffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioCtx.decodeAudioData(buffer);
    this.stop(true);
  }

  async play() {
    if (!this.audioBuffer) {
      return;
    }

    if (this.audioCtx.state !== "running") {
      await this.audioCtx.resume();
    }

    this.stopSourceNode();

    const offset = Math.min(this.pausedOffset, this.getDuration());

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.analyser);
    source.onended = () => {
      if (this.source !== source) {
        return;
      }

      this.source = null;
      this.playing = false;

      if (this.getCurrentTime() >= this.getDuration() - 0.02) {
        this.pausedOffset = 0;
        this.endedListeners.forEach((listener) => listener());
      }
    };

    this.source = source;
    this.startedAt = this.audioCtx.currentTime - offset;
    this.playing = true;
    source.start(0, offset);
  }

  pause() {
    if (!this.playing) {
      return;
    }

    this.pausedOffset = this.getCurrentTime();
    this.playing = false;
    this.stopSourceNode();
  }

  seek(seconds: number) {
    if (!this.audioBuffer) {
      return;
    }

    const duration = this.getDuration();
    const clamped = Math.min(Math.max(0, seconds), duration);
    this.pausedOffset = clamped;

    if (this.playing) {
      void this.play();
    }
  }

  stop(resetOffset = false) {
    this.playing = false;
    this.stopSourceNode();

    if (resetOffset) {
      this.pausedOffset = 0;
    }
  }

  setVolume(volume: number) {
    const clamped = Math.min(Math.max(volume, 0), 1);
    this.gain.gain.value = clamped;
  }

  isPlaying() {
    return this.playing;
  }

  getDuration() {
    return this.audioBuffer?.duration ?? 0;
  }

  getAudioBuffer() {
    return this.audioBuffer;
  }

  getCurrentTime() {
    if (!this.audioBuffer) {
      return 0;
    }

    if (!this.playing) {
      return Math.min(this.pausedOffset, this.getDuration());
    }

    const elapsed = this.audioCtx.currentTime - this.startedAt;
    return Math.min(Math.max(elapsed, 0), this.getDuration());
  }

  getFrequencyData() {
    if (this.dataArray.length !== this.analyser.frequencyBinCount) {
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }

  onEnded(listener: () => void) {
    this.endedListeners.add(listener);
    return () => {
      this.endedListeners.delete(listener);
    };
  }

  private stopSourceNode() {
    if (!this.source) {
      return;
    }

    this.source.onended = null;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }
}
