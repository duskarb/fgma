import type { ArtboardSize, PosterTexture, RenderSettings } from '../types';
import { MAX_MASSES, POSTER_HEIGHT, POSTER_WIDTH } from './posterTexture';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

const vertexSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

function fragmentSource(maxMasses: number) {
  return `
precision highp float;

const int MAX_MASSES = ${maxMasses};

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec3 uMasses[MAX_MASSES];
uniform int uMassCount;
uniform float uStrength;
uniform float uDecay;
uniform float uEpsilon;
uniform float uTime;
uniform float uMotionAmount;
uniform float uPointSpacing;
uniform float uPointSize;
uniform bool uShowField;
uniform bool uShowMasses;
uniform vec3 uBgColor;

varying vec2 vUv;

float grid(vec2 p, float spacing) {
  vec2 cell = abs(fract(p / spacing) - 0.5);
  float line = min(cell.x, cell.y);
  return smoothstep(0.055, 0.0, line);
}

vec2 canvasMassPosition(vec3 massPoint) {
  return vec2(massPoint.x, uResolution.y - massPoint.y);
}

vec2 fieldAt(vec2 p, float pulse) {
  vec2 field = vec2(0.0);

  for (int i = 0; i < MAX_MASSES; i++) {
    if (i >= uMassCount) break;

    vec3 massPoint = uMasses[i];
    vec2 massPosition = canvasMassPosition(massPoint);
    vec2 d = massPosition - p;
    float dist = max(length(d), 1.0);
    float mass = massPoint.z;
    float force = uStrength * 0.12 * mass * pulse / pow(dist + uEpsilon, uDecay);
    field += normalize(d) * force;
  }

  float edge = min(min(p.x, uResolution.x - p.x), min(p.y, uResolution.y - p.y));
  field *= smoothstep(0.0, 72.0, edge);
  return field;
}

void main() {
  vec2 p = vUv * uResolution;
  float pulse = 1.0 + sin(uTime * 1.65) * uMotionAmount;
  vec2 displacement = fieldAt(p, pulse);

  vec2 samplePoint = clamp(p - displacement, vec2(0.0), uResolution - vec2(1.0));
  vec4 color = texture2D(uTexture, samplePoint / uResolution);

  float textDist = length(color.rgb - uBgColor);
  float isBackground = 1.0 - smoothstep(0.08, 0.22, textDist);

  if (uShowField) {
    float g = grid(samplePoint, 36.0);
    color.rgb = mix(color.rgb, vec3(0.02, 0.10, 0.08), g * 0.18 * isBackground);
  }

  if (uShowMasses && uPointSpacing >= 2.0) {
    vec2 gridCenter = (floor(p / uPointSpacing) + 0.5) * uPointSpacing;
    vec4 origColor = texture2D(uTexture, gridCenter / uResolution);
    float textness = length(origColor.rgb - uBgColor);
    vec2 diff = abs(p - gridCenter);
    bool inSquare = diff.x <= uPointSize && diff.y <= uPointSize;
    if (inSquare && textness > 0.12) {
      color.rgb = vec3(1.0) - uBgColor;
    }
  }

  gl_FragColor = color;
}
`;
}

function compile(gl: GL, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL shader allocation failed.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'WebGL shader compilation failed.');
  }

  return shader;
}

function createProgram(gl: GL, maxMasses: number) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(maxMasses));
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL program allocation failed.');

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || 'WebGL program linking failed.');
  }

  return program;
}

function maxMassesFor(gl: GL) {
  const uniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number;
  return Math.max(32, Math.min(MAX_MASSES, uniformVectors - 32));
}

export class WebglPosterRenderer {
  private gl: GL;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private masses: Float32Array;
  private massCount = 0;
  private maxMasses: number;
  private size: ArtboardSize = { width: POSTER_WIDTH, height: POSTER_HEIGHT };
  private bgColor: [number, number, number] = [1, 1, 1];
  private locations: Record<string, WebGLUniformLocation | null>;

  constructor(private canvas: HTMLCanvasElement) {
    const gl =
      canvas.getContext('webgl', {
        antialias: true,
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
      }) ||
      canvas.getContext('experimental-webgl', {
        antialias: true,
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
      });

    if (!gl) throw new Error('WebGL is not available in this browser.');

    this.gl = gl as GL;
    this.maxMasses = maxMassesFor(this.gl);
    this.masses = new Float32Array(this.maxMasses * 3);
    this.program = createProgram(this.gl, this.maxMasses);
    this.texture = this.gl.createTexture()!;
    this.locations = {
      texture: this.gl.getUniformLocation(this.program, 'uTexture'),
      resolution: this.gl.getUniformLocation(this.program, 'uResolution'),
      masses: this.gl.getUniformLocation(this.program, 'uMasses'),
      massCount: this.gl.getUniformLocation(this.program, 'uMassCount'),
      strength: this.gl.getUniformLocation(this.program, 'uStrength'),
      decay: this.gl.getUniformLocation(this.program, 'uDecay'),
      epsilon: this.gl.getUniformLocation(this.program, 'uEpsilon'),
      time: this.gl.getUniformLocation(this.program, 'uTime'),
      motionAmount: this.gl.getUniformLocation(this.program, 'uMotionAmount'),
      pointSpacing: this.gl.getUniformLocation(this.program, 'uPointSpacing'),
      pointSize: this.gl.getUniformLocation(this.program, 'uPointSize'),
      showField: this.gl.getUniformLocation(this.program, 'uShowField'),
      showMasses: this.gl.getUniformLocation(this.program, 'uShowMasses'),
      bgColor: this.gl.getUniformLocation(this.program, 'uBgColor'),
    };

    this.setup();
  }

  private setup() {
    const gl = this.gl;
    this.setSize(this.size);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setSize(size: ArtboardSize) {
    const width = Math.round(size.width);
    const height = Math.round(size.height);
    if (this.size.width === width && this.size.height === height && this.canvas.width === width && this.canvas.height === height) return;
    this.size = { width, height };
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  updateTexture(texture: PosterTexture) {
    const gl = this.gl;
    this.massCount = Math.min(texture.massCount, this.maxMasses);
    this.bgColor = texture.bgColor;
    this.masses.fill(0);
    this.masses.set(texture.masses.subarray(0, this.massCount * 3));

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.canvas);
  }

  render(settings: RenderSettings, time = 0) {
    const gl = this.gl;
    gl.viewport(0, 0, this.size.width, this.size.height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locations.texture, 0);
    gl.uniform2f(this.locations.resolution, this.size.width, this.size.height);
    gl.uniform3fv(this.locations.masses, this.masses);
    gl.uniform1i(this.locations.massCount, this.massCount);
    gl.uniform1f(this.locations.strength, settings.strength);
    gl.uniform1f(this.locations.decay, settings.decay);
    gl.uniform1f(this.locations.epsilon, settings.epsilon);
    gl.uniform1f(this.locations.time, time);
    gl.uniform1f(this.locations.motionAmount, settings.animate ? settings.motionAmount : 0);
    gl.uniform1f(this.locations.pointSpacing, settings.pointSpacing);
    gl.uniform1f(this.locations.pointSize, settings.pointSize);
    gl.uniform1i(this.locations.showField, settings.showField ? 1 : 0);
    gl.uniform1i(this.locations.showMasses, settings.showMasses ? 1 : 0);
    gl.uniform3fv(this.locations.bgColor, this.bgColor);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  toBlob(type = 'image/png', quality?: number) {
    return new Promise<Blob>((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not export canvas.'));
      }, type, quality);
    });
  }

  getMaxMasses() {
    return this.maxMasses;
  }
}
