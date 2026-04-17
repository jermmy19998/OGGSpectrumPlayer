const VERTEX_SHADER_SOURCE = `#version 300 es
precision mediump float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in float aAmplitude;
layout(location = 2) in float aIndex;

uniform float uBarCount;
uniform float uGap;

void main() {
  float barWidth = (2.0 - uGap * (uBarCount - 1.0)) / uBarCount;
  float xLeft = -1.0 + aIndex * (barWidth + uGap);
  float x = xLeft + aCorner.x * barWidth;

  float yBase = -1.0;
  float yTop = -1.0 + aAmplitude * 2.0;
  float y = mix(yBase, yTop, aCorner.y);

  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

out vec4 outColor;

void main() {
  float t = gl_FragCoord.y / 1080.0;
  vec3 low = vec3(0.09, 0.73, 0.99);
  vec3 high = vec3(0.37, 0.97, 0.66);
  vec3 color = mix(low, high, clamp(t * 1.6, 0.0, 1.0));
  outColor = vec4(color, 1.0);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown program link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

export class WebGLSpectrumRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly amplitudeBuffer: WebGLBuffer;

  private readonly barCount: number;
  private readonly amplitudes: Float32Array;
  private readonly uBarCount: WebGLUniformLocation;
  private readonly uGap: WebGLUniformLocation;

  constructor(private readonly canvas: HTMLCanvasElement, barCount = 1024) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance"
    });

    if (!gl) {
      throw new Error("WebGL2 is unavailable on this machine.");
    }

    this.gl = gl;
    this.program = createProgram(gl);

    const vao = gl.createVertexArray();
    const amplitudeBuffer = gl.createBuffer();

    if (!vao || !amplitudeBuffer) {
      throw new Error("Failed to allocate WebGL buffers.");
    }

    this.vao = vao;
    this.amplitudeBuffer = amplitudeBuffer;
    this.barCount = barCount;
    this.amplitudes = new Float32Array(this.barCount);

    const uBarCount = gl.getUniformLocation(this.program, "uBarCount");
    const uGap = gl.getUniformLocation(this.program, "uGap");

    if (!uBarCount || !uGap) {
      throw new Error("Failed to resolve uniform locations.");
    }

    this.uBarCount = uBarCount;
    this.uGap = uGap;

    this.setupGeometry();
    this.resize();
  }

  private setupGeometry() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const corners = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 0,
      1, 1,
      0, 1
    ]);

    const cornersBuffer = gl.createBuffer();
    if (!cornersBuffer) {
      throw new Error("Failed to create corner buffer.");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, cornersBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.amplitudeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.amplitudes.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    const indexValues = new Float32Array(this.barCount);
    for (let i = 0; i < this.barCount; i += 1) {
      indexValues[i] = i;
    }

    const indexBuffer = gl.createBuffer();
    if (!indexBuffer) {
      throw new Error("Failed to create index buffer.");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, indexValues, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
  }

  render(input: Uint8Array) {
    const gl = this.gl;
    const stride = Math.max(1, Math.floor(input.length / this.barCount));

    for (let i = 0; i < this.barCount; i += 1) {
      const sample = input[i * stride] ?? 0;
      this.amplitudes[i] = sample / 255;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.amplitudeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.amplitudes);

    gl.useProgram(this.program);
    gl.uniform1f(this.uBarCount, this.barCount);
    gl.uniform1f(this.uGap, 0.0006);

    gl.clearColor(0.03, 0.05, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.barCount);
    gl.bindVertexArray(null);
  }
}
