function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function normalizedColor(value: number) {
  const v = clamp(value, -1, 1);
  const stops = [
    { p: -1.0, r: 0, g: 36, b: 154 },
    { p: -0.5, r: 54, g: 122, b: 255 },
    { p: 0.0, r: 240, g: 240, b: 240 },
    { p: 0.5, r: 255, g: 138, b: 86 },
    { p: 1.0, r: 180, g: 0, b: 0 }
  ];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (v >= a.p && v <= b.p) {
      const local = (v - a.p) / Math.max(1e-6, b.p - a.p);
      return {
        r: Math.round(lerp(a.r, b.r, local)),
        g: Math.round(lerp(a.g, b.g, local)),
        b: Math.round(lerp(a.b, b.b, local))
      };
    }
  }

  const last = stops[stops.length - 1];
  return { r: last.r, g: last.g, b: last.b };
}

function reverseBits(x: number, bits: number) {
  let n = x;
  let reversed = 0;

  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | (n & 1);
    n >>= 1;
  }

  return reversed;
}

function fftInPlace(re: Float32Array, im: Float32Array) {
  const n = re.length;
  const bits = Math.log2(n);

  for (let i = 0; i < n; i += 1) {
    const j = reverseBits(i, bits);
    if (j > i) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const theta = (-2 * Math.PI) / len;

    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k += 1) {
        const evenIndex = start + k;
        const oddIndex = evenIndex + half;

        const angle = theta * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);

        const oddRe = re[oddIndex];
        const oddIm = im[oddIndex];

        const vr = oddRe * wr - oddIm * wi;
        const vi = oddRe * wi + oddIm * wr;

        const er = re[evenIndex];
        const ei = im[evenIndex];

        re[evenIndex] = er + vr;
        im[evenIndex] = ei + vi;
        re[oddIndex] = er - vr;
        im[oddIndex] = ei - vi;
      }
    }
  }
}

export async function buildStaticSpectrogram(
  buffer: AudioBuffer,
  targetWidth: number,
  targetHeight: number
) {
  const fftSize = 1024;
  const hopSize = 256;
  const bins = fftSize / 2;

  const samples = buffer.getChannelData(0);
  const frameCount = Math.max(1, Math.floor((samples.length - fftSize) / hopSize) + 1);

  const width = Math.max(384, Math.min(targetWidth, frameCount));
  const height = Math.max(160, Math.min(targetHeight, bins));

  const dbMap = new Float32Array(width * height);

  const frame = new Float32Array(fftSize);
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const mags = new Float32Array(bins);

  let maxDb = Number.NEGATIVE_INFINITY;

  for (let x = 0; x < width; x += 1) {
    const frameIndex = width === 1 ? 0 : Math.floor((x * (frameCount - 1)) / (width - 1));
    const sampleStart = frameIndex * hopSize;

    for (let i = 0; i < fftSize; i += 1) {
      const s = samples[sampleStart + i] ?? 0;
      frame[i] = s * window[i];
      re[i] = frame[i];
      im[i] = 0;
    }

    fftInPlace(re, im);

    for (let i = 0; i < bins; i += 1) {
      const power = re[i] * re[i] + im[i] * im[i];
      mags[i] = Math.sqrt(power) + 1e-8;
    }

    for (let y = 0; y < height; y += 1) {
      const yn = y / Math.max(1, height - 1);
      const curved = Math.pow(1 - yn, 2.2);
      const binF = curved * (bins - 1);
      const lo = Math.floor(binF);
      const hi = Math.min(bins - 1, lo + 1);
      const frac = binF - lo;

      const mag = lerp(mags[lo], mags[hi], frac);
      const db = 20 * Math.log10(mag);

      dbMap[y * width + x] = db;
      if (db > maxDb) maxDb = db;
    }

    if (x % 24 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const floorDb = maxDb - 85;
  const ceilingDb = maxDb - 1;
  const image = new ImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const db = clamp(dbMap[idx], floorDb, ceilingDb);
      const normalized = ((db - floorDb) / Math.max(1e-6, ceilingDb - floorDb)) * 2 - 1;
      const c = normalizedColor(normalized);

      const p = idx * 4;
      image.data[p] = c.r;
      image.data[p + 1] = c.g;
      image.data[p + 2] = c.b;
      image.data[p + 3] = 255;
    }
  }

  return image;
}

export class SpectrogramCanvas {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly offscreen: HTMLCanvasElement;
  private readonly offscreenCtx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context unavailable.");
    }

    const offscreen = document.createElement("canvas");
    const offscreenCtx = offscreen.getContext("2d");
    if (!offscreenCtx) {
      throw new Error("Offscreen canvas context unavailable.");
    }

    this.ctx = ctx;
    this.offscreen = offscreen;
    this.offscreenCtx = offscreenCtx;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setImage(image: ImageData) {
    this.offscreen.width = image.width;
    this.offscreen.height = image.height;
    this.offscreenCtx.putImageData(image, 0, 0);
  }

  clear() {
    this.ctx.fillStyle = "#05070d";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(playheadRatio: number) {
    if (this.offscreen.width === 0 || this.offscreen.height === 0) {
      this.clear();
      return;
    }

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);

    const x = clamp(playheadRatio, 0, 1) * this.canvas.width;

    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.canvas.height);
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(255,255,255,0.95)";
    this.ctx.beginPath();
    this.ctx.arc(x, 10, 4, 0, Math.PI * 2);
    this.ctx.fill();
  }

  timeFromClientX(clientX: number, duration: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * duration;
  }

  getSuggestedImageSize() {
    const dpr = window.devicePixelRatio || 1;
    return {
      width: Math.max(640, Math.floor(this.canvas.clientWidth * dpr)),
      height: Math.max(256, Math.floor(this.canvas.clientHeight * dpr))
    };
  }
}
