// WebGL2 stable-fluid smoke. 외부 라이브러리 없이 동작한다.
// 좌표는 0..1 정규화, y는 아래에서 위로 증가(GL 기준).

const DEFAULTS = {
  SIM_RES: 128,
  DYE_RES: 1024,
  DENSITY_DISSIPATION: 0.8,
  VELOCITY_DISSIPATION: 0.35,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 24,
  MAX_DPR: 1.5,
};
const LITE = { SIM_RES: 64, DYE_RES: 512, PRESSURE_ITERATIONS: 10, MAX_DPR: 1 };

const VS = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform vec2 texelSize;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FS_HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
`;

const FS = {
  clear: `
uniform sampler2D uTexture;
uniform float value;
void main () { fragColor = value * texture(uTexture, vUv); }`,

  splat: `
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`,

  advection: `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main () {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  fragColor = result / (1.0 + dissipation * dt);
}`,

  divergence: `
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,

  curl: `
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,

  vorticity: `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * dt;
  fragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`,

  pressure: `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,

  gradient: `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  fragColor = vec4(vel, 0.0, 1.0);
}`,

  display: `
uniform sampler2D uTexture;
uniform vec2 texelSize;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uTime;
uniform float uNebula;

// 절차적 성운: 연기가 없는 곳에도 은하수 같은 옅은 구름과 먼지띠를 깐다.
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.02 + vec2(3.1, 1.7); a *= 0.5; }
  return v;
}
vec3 nebula(vec2 uv, float t) {
  float aspect = texelSize.y / texelSize.x;
  vec2 p = (uv - vec2(0.5, 0.52)) * vec2(aspect, 1.0);
  vec2 dir = normalize(vec2(1.0, 0.36));
  float d = dot(p, vec2(-dir.y, dir.x));
  float along = dot(p, dir);
  vec2 w = p * 2.3 + vec2(t * 0.010, t * 0.003);
  float n1 = fbm(w);
  float n2 = fbm(w * 1.8 + n1 * 1.7 - vec2(t * 0.005, 0.0));
  float band = exp(-d * d / 0.09) * smoothstep(1.6, 0.1, abs(along));
  float dens = pow(clamp(n2 * 1.45 - 0.25, 0.0, 1.0), 1.6) * band;
  vec3 violet = vec3(0.36, 0.17, 0.66);
  vec3 blue = vec3(0.10, 0.30, 0.68);
  vec3 rose = vec3(0.70, 0.20, 0.45);
  vec3 col = mix(mix(blue, violet, smoothstep(0.3, 0.7, n1)), rose, smoothstep(0.55, 0.82, n2) * 0.55);
  float dust = smoothstep(0.48, 0.78, fbm(w * 3.2 + 7.0));
  float core = exp(-d * d / 0.004) * smoothstep(1.1, 0.0, abs(along));
  return col * dens * (1.0 - dust * 0.6) * 1.15 + vec3(0.75, 0.8, 1.0) * core * 0.07;
}

void main () {
  vec3 c = texture(uTexture, vUv).rgb;
  // 밀도 기울기로 연기 표면에 음영을 준다.
  float dx = length(texture(uTexture, vR).rgb) - length(texture(uTexture, vL).rgb);
  float dy = length(texture(uTexture, vT).rgb) - length(texture(uTexture, vB).rgb);
  vec3 n = normalize(vec3(dx, dy, length(texelSize)));
  float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
  c *= diffuse;
  c = 1.0 - exp(-c * 1.35);
  vec2 q = vUv - 0.5;
  vec3 bg = vec3(0.018, 0.022, 0.04) + uTint * uTintAmt * 0.045 * (1.0 - length(q));
  if (uNebula > 0.001) bg += nebula(vUv, uTime) * uNebula;
  vec3 col = bg + c;
  col *= mix(0.55, 1.0, smoothstep(0.9, 0.15, length(q)));
  float g = fract(sin(dot(vUv * 913.7 + mod(uTime, 100.0), vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.018;
  fragColor = vec4(col, 1.0);
}`,
};

export function createFluid(canvas, { lite = false, overrides = {} } = {}) {
  const cfg = { ...DEFAULTS, ...overrides, ...(lite ? LITE : {}) };
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2를 사용할 수 없습니다.');
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
    throw new Error('부동소수점 렌더 타깃을 지원하지 않습니다.');
  }

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const makeProgram = (fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS_HEAD + fs));
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    const u = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { u, use: () => gl.useProgram(p) };
  };
  const P = Object.fromEntries(Object.entries(FS).map(([k, src]) => [k, makeProgram(src)]));

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  const blit = (target) => {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };

  const FMT = {
    rgba: [gl.RGBA16F, gl.RGBA],
    rg: [gl.RG16F, gl.RG],
    r: [gl.R16F, gl.RED],
  };
  const textures = [];
  const createFBO = (w, h, [internal, format]) => {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('프레임버퍼를 만들 수 없습니다.');
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    textures.push({ texture, fbo });
    return {
      texture, fbo, width: w, height: h, tx: 1 / w, ty: 1 / h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
    };
  };
  const createDouble = (w, h, fmt) => {
    let a = createFBO(w, h, fmt);
    let b = createFBO(w, h, fmt);
    return {
      width: w, height: h, tx: 1 / w, ty: 1 / h,
      get read() { return a; },
      get write() { return b; },
      swap() { [a, b] = [b, a]; },
    };
  };

  const resolution = (res) => {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(res);
    const max = Math.round(res * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? [max, min] : [min, max];
  };

  let dye, velocity, divergence, curl, pressure;
  const disposeTargets = () => {
    for (const t of textures) { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.fbo); }
    textures.length = 0;
  };
  const initTargets = () => {
    disposeTargets();
    const [sw, sh] = resolution(cfg.SIM_RES);
    const [dw, dh] = resolution(cfg.DYE_RES);
    dye = createDouble(dw, dh, FMT.rgba);
    velocity = createDouble(sw, sh, FMT.rg);
    divergence = createFBO(sw, sh, FMT.r);
    curl = createFBO(sw, sh, FMT.r);
    pressure = createDouble(sw, sh, FMT.r);
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.MAX_DPR);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h && dye) return false;
    canvas.width = w;
    canvas.height = h;
    initTargets();
    return true;
  };
  resize();

  const aspect = () => canvas.width / canvas.height;

  const splat = (x, y, dx, dy, rgb, radius = 0.25) => {
    let r = radius / 100;
    if (aspect() > 1) r *= aspect();
    P.splat.use();
    gl.uniform1i(P.splat.u.uTarget, velocity.read.attach(0));
    gl.uniform1f(P.splat.u.aspectRatio, aspect());
    gl.uniform2f(P.splat.u.point, x, y);
    gl.uniform3f(P.splat.u.color, dx, dy, 0);
    gl.uniform1f(P.splat.u.radius, r);
    blit(velocity.write);
    velocity.swap();
    gl.uniform1i(P.splat.u.uTarget, dye.read.attach(0));
    gl.uniform3f(P.splat.u.color, rgb[0], rgb[1], rgb[2]);
    blit(dye.write);
    dye.swap();
  };

  const step = (dt) => {
    gl.disable(gl.BLEND);
    const setTexel = (prog, t) => gl.uniform2f(prog.u.texelSize, t.tx, t.ty);

    P.curl.use();
    setTexel(P.curl, velocity);
    gl.uniform1i(P.curl.u.uVelocity, velocity.read.attach(0));
    blit(curl);

    P.vorticity.use();
    setTexel(P.vorticity, velocity);
    gl.uniform1i(P.vorticity.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(P.vorticity.u.uCurl, curl.attach(1));
    gl.uniform1f(P.vorticity.u.curl, cfg.CURL);
    gl.uniform1f(P.vorticity.u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    P.divergence.use();
    setTexel(P.divergence, velocity);
    gl.uniform1i(P.divergence.u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    P.clear.use();
    gl.uniform1i(P.clear.u.uTexture, pressure.read.attach(0));
    gl.uniform1f(P.clear.u.value, cfg.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    P.pressure.use();
    setTexel(P.pressure, velocity);
    gl.uniform1i(P.pressure.u.uDivergence, divergence.attach(0));
    for (let i = 0; i < cfg.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(P.pressure.u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    P.gradient.use();
    setTexel(P.gradient, velocity);
    gl.uniform1i(P.gradient.u.uPressure, pressure.read.attach(0));
    gl.uniform1i(P.gradient.u.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    P.advection.use();
    setTexel(P.advection, velocity);
    gl.uniform1i(P.advection.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(P.advection.u.uSource, velocity.read.attach(0));
    gl.uniform1f(P.advection.u.dt, dt);
    gl.uniform1f(P.advection.u.dissipation, cfg.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(P.advection.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(P.advection.u.uSource, dye.read.attach(1));
    gl.uniform1f(P.advection.u.dissipation, cfg.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  };

  const render = (tint = [0, 0, 0], tintAmt = 0, time = 0, nebulaAmt = 0) => {
    P.display.use();
    gl.uniform2f(P.display.u.texelSize, dye.tx, dye.ty);
    gl.uniform1i(P.display.u.uTexture, dye.read.attach(0));
    gl.uniform3f(P.display.u.uTint, tint[0], tint[1], tint[2]);
    gl.uniform1f(P.display.u.uTintAmt, tintAmt);
    gl.uniform1f(P.display.u.uTime, time % 3600);
    gl.uniform1f(P.display.u.uNebula, nebulaAmt);
    blit(null);
  };

  return {
    splat,
    step,
    render,
    resize,
    get info() {
      return `sim ${velocity.width}×${velocity.height} · dye ${dye.width}×${dye.height}${lite ? ' · lite' : ''}`;
    },
  };
}
