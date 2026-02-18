const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let W, H;
let mouse = { x: -9999, y: -9999 };
let mouseActive = false;
const RADIUS = 180;
const PUSH_STRENGTH = 14;
const RETURN_SPEED = 0.06;
const CELL = 3;

// bayer 4x4 threshold matrix
const bayer = [
   0/16,  8/16,  2/16, 10/16,
  12/16,  4/16, 14/16,  6/16,
   3/16, 11/16,  1/16,  9/16,
  15/16,  7/16, 13/16,  5/16,
];

// color palette
const palette = [
  '#dcaa6e', // sand
  '#b46450', // terracotta
  '#648c78', // sage
  '#465a82', // slate blue
  '#c882a0', // dusty rose
  '#a09664', // olive
  '#825064', // plum
  '#5aa0a0', // teal
];

const paletteDark = '#0f0c12';

function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

let cols, rows;
let baseField, colorField;
let dispX, dispY;
let needsRender = true;
let animating = false;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cols = Math.ceil(W / CELL);
  rows = Math.ceil(H / CELL);
  dispX = new Float32Array(cols * rows);
  dispY = new Float32Array(cols * rows);
  baseField = new Float32Array(cols * rows);
  colorField = new Uint8Array(cols * rows);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx;
      const nx = gx / cols;
      const ny = gy / rows;

      // layered noise — boosted to fill more of the field
      let v = 0;
      v += Math.sin(nx * 8.0 + ny * 3.0) * 0.25;
      v += Math.sin(ny * 12.0 - nx * 5.0) * 0.25;
      v += Math.sin((nx + ny) * 15.0) * 0.2;
      v += Math.sin(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 20.0) * 0.2;
      v += Math.sin(nx * 20.0 + ny * 20.0) * 0.15;
      v += hash(gx, gy) * 0.3;
      baseField[idx] = Math.max(0, Math.min(1, v * 0.5 + 0.55)); // bias upward so more dots show

      const colorNoise = Math.sin(nx * 4.0 + ny * 6.0) + Math.sin(nx * 7.0 - ny * 3.0) * 0.6;
      colorField[idx] = Math.floor(((colorNoise * 0.5 + 0.5) + hash(gx + 100, gy + 200) * 0.3) * palette.length) % palette.length;
    }
  }

  needsRender = true;
  if (!animating) startLoop();
}

resize();
window.addEventListener('resize', resize);

document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouseActive = true;
  needsRender = true;
  if (!animating) startLoop();
});

document.addEventListener('mouseleave', () => {
  mouse.x = -9999;
  mouse.y = -9999;
  mouseActive = false;
});

document.addEventListener('touchstart', (e) => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
  mouseActive = true;
  needsRender = true;
  if (!animating) startLoop();
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
  mouseActive = true;
  needsRender = true;
  if (!animating) startLoop();
}, { passive: false });

document.addEventListener('touchend', () => {
  mouse.x = -9999;
  mouse.y = -9999;
  mouseActive = false;
});

function render() {
  // update displacement
  let anyMovement = false;

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx;
      const cx = gx * CELL + CELL / 2;
      const cy = gy * CELL + CELL / 2;
      const dx = cx - mouse.x;
      const dy = cy - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < RADIUS && dist > 0.1) {
        const force = (1.0 - dist / RADIUS);
        const strength = force * force * PUSH_STRENGTH;
        const nx = dx / dist;
        const ny = dy / dist;
        dispX[idx] += nx * strength;
        dispY[idx] += ny * strength;
      }

      dispX[idx] *= (1.0 - RETURN_SPEED);
      dispY[idx] *= (1.0 - RETURN_SPEED);

      if (Math.abs(dispX[idx]) > 0.01 || Math.abs(dispY[idx]) > 0.01) {
        anyMovement = true;
      }
    }
  }

  // draw cells
  ctx.fillStyle = paletteDark;
  ctx.fillRect(0, 0, W, H);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx;

      // find source cell after displacement
      const srcGx = Math.round(gx + dispX[idx] / CELL);
      const srcGy = Math.round(gy + dispY[idx] / CELL);

      let noise, colorIdx;
      if (srcGx >= 0 && srcGx < cols && srcGy >= 0 && srcGy < rows) {
        const sIdx = srcGy * cols + srcGx;
        noise = baseField[sIdx];
        colorIdx = colorField[sIdx];
      } else {
        continue; // displaced off-screen = empty
      }

      // bayer threshold per cell
      const threshold = bayer[(gy % 4) * 4 + (gx % 4)];

      if (noise > threshold) {
        ctx.fillStyle = palette[colorIdx];
        ctx.fillRect(gx * CELL, gy * CELL, CELL - 1, CELL - 1);
      }
    }
  }

  if (anyMovement || mouseActive) {
    needsRender = true;
  }
}

function startLoop() {
  animating = true;
  function loop() {
    if (needsRender) {
      needsRender = false;
      render();
    }
    if (needsRender || mouseActive) {
      requestAnimationFrame(loop);
    } else {
      animating = false;
    }
  }
  requestAnimationFrame(loop);
}

startLoop();
