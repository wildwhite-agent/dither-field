const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let W, H;
let mouse = { x: -9999, y: -9999 };
const RADIUS = 160;
const PUSH_STRENGTH = 12;
const RETURN_SPEED = 0.04;
const CELL = 3;

// bayer 8x8 threshold matrix
const bayer8 = new Float32Array(64);
(function buildBayer() {
  const b4 = [
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ];
  for (let i = 0; i < 64; i++) bayer8[i] = b4[i] / 64;
})();

// color palette — warm earthy tones with some pops
const palette = [
  [220, 170, 110],  // sand
  [180, 100, 80],   // terracotta
  [100, 140, 120],  // sage
  [70, 90, 130],    // slate blue
  [200, 130, 160],  // dusty rose
  [160, 150, 100],  // olive
  [130, 80, 100],   // plum
  [90, 160, 160],   // teal
];

// static noise field for base pattern — computed once
let baseField = null;
let colorField = null;

// displacement grid — each cell has dx, dy offset
let dispX, dispY;
let cols, rows;

function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cols = Math.ceil(W / CELL);
  rows = Math.ceil(H / CELL);
  dispX = new Float32Array(cols * rows);
  dispY = new Float32Array(cols * rows);

  // build static base noise + color assignment per cell
  baseField = new Float32Array(cols * rows);
  colorField = new Uint8Array(cols * rows);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx;
      const nx = gx / cols;
      const ny = gy / rows;

      // layered static noise
      let v = 0;
      v += Math.sin(nx * 8.0 + ny * 3.0) * 0.2;
      v += Math.sin(ny * 12.0 - nx * 5.0) * 0.2;
      v += Math.sin((nx + ny) * 15.0) * 0.15;
      v += Math.sin(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 20.0) * 0.15;
      v += Math.sin(nx * 20.0 + ny * 20.0) * 0.1;
      v += (hash(gx, gy) / 4294967295) * 0.2;
      baseField[idx] = v * 0.5 + 0.5;

      // assign color based on spatial regions with noise
      const colorNoise = Math.sin(nx * 4.0 + ny * 6.0) + Math.sin(nx * 7.0 - ny * 3.0) * 0.6;
      colorField[idx] = Math.floor(((colorNoise * 0.5 + 0.5) + (hash(gx + 100, gy + 200) / 4294967295) * 0.3) * palette.length) % palette.length;
    }
  }
}

resize();
window.addEventListener('resize', resize);

document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

document.addEventListener('mouseleave', () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

document.addEventListener('touchmove', (e) => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
}, { passive: false });

document.addEventListener('touchend', () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

function render() {
  // update displacement — push cells away from mouse, spring back when far
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = gx * CELL + CELL / 2;
      const cy = gy * CELL + CELL / 2;
      const dx = cx - mouse.x;
      const dy = cy - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = gy * cols + gx;

      if (dist < RADIUS && dist > 0.1) {
        // push away from mouse — stronger when closer
        const force = (1.0 - dist / RADIUS);
        const strength = force * force * PUSH_STRENGTH;
        const nx = dx / dist;
        const ny = dy / dist;
        dispX[idx] += nx * strength;
        dispY[idx] += ny * strength;
      }

      // spring back toward origin
      dispX[idx] *= (1.0 - RETURN_SPEED);
      dispY[idx] *= (1.0 - RETURN_SPEED);
    }
  }

  // render
  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / CELL);
      const gy = Math.floor(y / CELL);
      const idx = gy * cols + gx;

      // displaced source position
      const srcX = x + dispX[idx];
      const srcY = y + dispY[idx];

      // sample from displaced position
      const sgx = Math.floor(srcX / CELL);
      const sgy = Math.floor(srcY / CELL);

      let noise, colorIdx;
      if (sgx >= 0 && sgx < cols && sgy >= 0 && sgy < rows) {
        const sIdx = sgy * cols + sgx;
        noise = baseField[sIdx];
        colorIdx = colorField[sIdx];
      } else {
        noise = 0;
        colorIdx = 0;
      }

      // bayer threshold at original pixel position for stable pattern
      const threshold = bayer8[(y % 8) * 8 + (x % 8)];

      const dithered = noise > threshold ? 1 : 0;

      const col = palette[colorIdx];
      const i = (y * W + x) * 4;

      if (dithered) {
        data[i] = col[0];
        data[i + 1] = col[1];
        data[i + 2] = col[2];
      } else {
        // dark background with subtle tint
        data[i] = 15;
        data[i + 1] = 12;
        data[i + 2] = 18;
      }
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  requestAnimationFrame(render);
}

render();
