import * as THREE from 'three';

function hash2d(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function makeCanvas(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function createScaleTextures() {
  const size = 256;
  const { canvas: bumpCanvas, ctx: bCtx } = makeCanvas(size);
  const { canvas: mapCanvas, ctx: mCtx } = makeCanvas(size);

  bCtx.fillStyle = '#555';
  bCtx.fillRect(0, 0, size, size);
  mCtx.fillStyle = '#cfcfcf';
  mCtx.fillRect(0, 0, size, size);

  const rows = 18;
  const cols = 18;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = (r % 2) * (cellW * 0.5);
      const cx = (c * cellW + offsetX) % size;
      const cy = r * cellH + cellH * 0.5;
      const radius = cellW * (0.42 + hash2d(c, r) * 0.14);

      const grad = bCtx.createRadialGradient(cx, cy - radius * 0.15, radius * 0.1, cx, cy, radius);
      grad.addColorStop(0, '#f2f2f2');
      grad.addColorStop(0.65, '#999999');
      grad.addColorStop(1, '#262626');
      bCtx.fillStyle = grad;
      bCtx.beginPath();
      bCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      bCtx.fill();

      const shade = 185 + Math.floor(hash2d(r, c) * 55);
      mCtx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      mCtx.beginPath();
      mCtx.arc(cx, cy, radius * 0.9, 0, Math.PI * 2);
      mCtx.fill();
    }
  }

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(3, 3);

  const map = new THREE.CanvasTexture(mapCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.colorSpace = THREE.SRGBColorSpace;

  return { bump, map };
}

export function createTerrainTextures() {
  const size = 512;
  const { canvas: mapCanvas, ctx: mCtx } = makeCanvas(size);
  const { canvas: bumpCanvas, ctx: bCtx } = makeCanvas(size);

  // Base orgánica tierra/selva
  mCtx.fillStyle = '#2d3927';
  mCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 2 + Math.random() * 14;
    const type = Math.random();
    if (type < 0.45) {
      mCtx.fillStyle = `rgba(34, 52, 29, ${0.12 + Math.random() * 0.18})`;
    } else if (type < 0.8) {
      mCtx.fillStyle = `rgba(68, 56, 42, ${0.1 + Math.random() * 0.16})`;
    } else {
      mCtx.fillStyle = `rgba(88, 92, 82, ${0.08 + Math.random() * 0.14})`;
    }
    mCtx.beginPath();
    mCtx.arc(x, y, rad, 0, Math.PI * 2);
    mCtx.fill();

    const g = 90 + Math.floor(Math.random() * 130);
    bCtx.fillStyle = `rgba(${g},${g},${g},0.22)`;
    bCtx.beginPath();
    bCtx.arc(x, y, rad * 0.7, 0, Math.PI * 2);
    bCtx.fill();
  }

  const map = new THREE.CanvasTexture(mapCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(22, 54);
  map.colorSpace = THREE.SRGBColorSpace;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(22, 54);

  return { map, bump };
}

export function createBarkTexture() {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#3b2d22';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 180; i++) {
    const x = Math.random() * size;
    const w = 2 + Math.random() * 5;
    const shade = 30 + Math.floor(Math.random() * 45);
    ctx.fillStyle = `rgba(${shade + 18}, ${shade + 8}, ${shade}, 0.55)`;
    ctx.fillRect(x, 0, w, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRockTexture() {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#4e524e';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 12;
    const c = 55 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${c}, ${c + 2}, ${c - 2}, 0.32)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
