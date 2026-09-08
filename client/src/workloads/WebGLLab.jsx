import { useEffect, useRef } from "react";

const VERT = `
attribute vec3 aPos;
attribute vec3 aNrm;
uniform mat4 uMVP;
uniform mat4 uN;
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = mat3(uN) * aNrm;
  vP = aPos;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG_LIT = `
precision highp float;
varying vec3 vN;
varying vec3 vP;
uniform float uTime;
uniform float uBomb;
uniform float uHeat;
void main() {
  vec3 n = normalize(vN);
  vec3 lp = vec3(sin(uTime), 0.8, cos(uTime));
  float d = max(0.15, dot(n, normalize(lp)));
  vec3 col = mix(vec3(0.0, 0.55, 0.72), vec3(1.0, 0.28, 0.08), uBomb);
  col *= d;
  float acc = 0.0;
  int steps = int(uBomb > 0.5 ? 28.0 : 6.0);
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    vec3 p = vP * (1.2 + float(i) * 0.04);
    acc += abs(sin(p.x * 4.0 + uTime) * cos(p.y * 3.5 - uTime));
  }
  col += vec3(acc * (uBomb > 0.5 ? 0.04 : 0.012));
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT_FULL = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG_RAY = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uBomb;
uniform float uHeat;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.0, -2.4);
  vec3 rd = normalize(vec3(uv, 1.6));
  float t = 0.0;
  float glow = 0.0;
  int steps = int(28.0 + uBomb * 40.0);
  for (int i = 0; i < 72; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    p.xy *= mat2(cos(uTime * 0.4), -sin(uTime * 0.4), sin(uTime * 0.4), cos(uTime * 0.4));
    float d = length(p) - 0.72;
    d = min(d, length(p - vec3(sin(uTime), 0.2, 0.4)) - 0.28);
    glow += 0.012 / (0.04 + abs(d));
    t += max(0.02, abs(d) * 0.45);
  }
  glow = min(glow, 1.35);
  vec3 col = mix(vec3(0.03, 0.05, 0.09), vec3(0.18, 0.04, 0.02), uBomb);
  col += glow * mix(vec3(0.05, 0.45, 0.62), vec3(0.85, 0.28, 0.08), uHeat);
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return p;
}

function icosphere(sub = 3) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(...v);
    return v.map((c) => c / l);
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const midCache = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (midCache.has(key)) return midCache.get(key);
    const va = verts[a], vb = verts[b];
    const m = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
    const l = Math.hypot(...m);
    verts.push(m.map((c) => c / l));
    const idx = verts.length - 1;
    midCache.set(key, idx);
    return idx;
  };
  for (let s = 0; s < sub; s++) {
    const next = [];
    faces.forEach(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    });
    faces = next;
    midCache.clear();
  }
  const pos = [];
  const nrm = [];
  faces.forEach(([a, b, c]) => {
    [a, b, c].forEach((i) => {
      pos.push(...verts[i]);
      nrm.push(...verts[i]);
    });
  });
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), count: faces.length * 3 };
}

function matMul(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      o[j * 4 + i] =
        a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
  }
  return o;
}
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
function rotateXY(ax, ay) {
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const rx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  return matMul(ry, rx);
}

function useGlLoop(canvasRef, stateRef, setup) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance" });
    if (!gl) return;
    let anim = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round((rect.width || 390) * dpr);
      canvas.height = Math.round((rect.height || 700) * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    const handle = setup(gl, canvas);
    const loop = (t) => {
      handle.draw(t, stateRef.current, canvas);
      anim = requestAnimationFrame(loop);
    };
    anim = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(anim);
      window.removeEventListener("resize", resize);
      handle.dispose?.();
    };
  }, [canvasRef, setup, stateRef]);
}

export function Shader3DCanvas({ bomb, heat }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ bomb, heat });
  stateRef.current = { bomb, heat };
  const setup = useRef((gl) => {
    const mesh = icosphere(3);
    const prog = program(gl, VERT, FRAG_LIT);
    const bufP = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufP);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    const bufN = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufN);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    const aNrm = gl.getAttribLocation(prog, "aNrm");
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    return {
      draw(t, st, canvas) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.04 + st.heat * 0.2, 0.04, 0.05, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(prog);
        const aspect = canvas.width / Math.max(1, canvas.height);
        const proj = perspective(38, aspect, 0.1, 30);
        const speed = st.bomb ? 0.0022 : 0.0009;
        const world = rotateXY(t * speed, t * speed * 0.73);
        world[13] = 0.15;
        world[14] = -4.6;
        const mvp = matMul(proj, world);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uMVP"), false, mvp);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uN"), false, world);
        gl.uniform1f(gl.getUniformLocation(prog, "uTime"), t * 0.001);
        gl.uniform1f(gl.getUniformLocation(prog, "uBomb"), st.bomb ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(prog, "uHeat"), st.heat || 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufP);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufN);
        gl.enableVertexAttribArray(aNrm);
        gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
        const copies = st.bomb ? 5 : 1;
        for (let i = 0; i < copies; i++) {
          if (i > 0) {
            const extra = rotateXY(t * speed + i * 0.7, t * speed * 0.4 + i);
            extra[12] = (i % 2 === 0 ? -1.6 : 1.6);
            extra[13] = i > 2 ? -1.2 : 1.1;
            extra[14] = -5.4;
            gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uMVP"), false, matMul(proj, extra));
          }
          gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
      },
    };
  }).current;
  useGlLoop(canvasRef, stateRef, setup);
  return <canvas ref={canvasRef} className="stress-canvas" />;
}

export function TriangleMesh({ bomb, heat }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ bomb, heat });
  stateRef.current = { bomb, heat };
  const setup = useRef((gl) => {
    const COUNT = 18000;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2.4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    }
    const prog = program(gl, VERT, FRAG_LIT);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    const aNrm = gl.getAttribLocation(prog, "aNrm");
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    return {
      draw(t, st, canvas) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.03 + st.heat * 0.25, 0.03, 0.04, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(prog);
        const aspect = canvas.width / Math.max(1, canvas.height);
        const proj = perspective(50, aspect, 0.1, 20);
        const world = rotateXY(t * (st.bomb ? 0.0024 : 0.0007), t * 0.0011);
        world[14] = -3.4;
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uMVP"), false, matMul(proj, world));
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uN"), false, world);
        gl.uniform1f(gl.getUniformLocation(prog, "uTime"), t * 0.001);
        gl.uniform1f(gl.getUniformLocation(prog, "uBomb"), st.bomb ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(prog, "uHeat"), st.heat || 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(aNrm);
        gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, st.bomb ? COUNT : Math.floor(COUNT * 0.55));
      },
    };
  }).current;
  useGlLoop(canvasRef, stateRef, setup);
  return <canvas ref={canvasRef} className="stress-canvas" />;
}

export function RaymarchCanvas({ bomb, heat }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ bomb, heat });
  stateRef.current = { bomb, heat };
  const setup = useRef((gl) => {
    const prog = program(gl, VERT_FULL, FRAG_RAY);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    return {
      draw(t, st, canvas) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog);
        gl.uniform2f(gl.getUniformLocation(prog, "uRes"), canvas.width, canvas.height);
        gl.uniform1f(gl.getUniformLocation(prog, "uTime"), t * 0.001);
        gl.uniform1f(gl.getUniformLocation(prog, "uBomb"), st.bomb ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(prog, "uHeat"), st.heat || 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }).current;
  useGlLoop(canvasRef, stateRef, setup);
  return <canvas ref={canvasRef} className="stress-canvas" />;
}
