const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let W, H;
let mouse = { x: -9999, y: -9999 };
const RADIUS = 180;
const CELL = 4;
const FADE_SPEED = 0.03;

// each cell tracks its current "clear" amount (0 = full dither, 1 = fully clear)
let grid = [];
let cols, rows;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cols = Math.ceil(W / CELL);
  rows = Math.ceil(H / CELL);
  grid = new Float32Array(cols * rows);
}

resize();
window.addEventListener('resize', resize);

// bayer 4x4 threshold matrix normalized to 0-1
const bayer = [
   0/16,  8/16,  2/16, 10/16,
  12/16,  4/16, 14/16,  6/16,
   3/16, 11/16,  1/16,  9/16,
  15/16,  7/16, 13/16,  5/16,
];

function getBayer(x, y) {
  return bayer[(y % 4) * 4 + (x % 4)];
}

// organic noise field — layered sine waves
function noiseField(x, y, t) {
  const nx = x / W;
  const ny = y / H;
  let v = 0;
  v += Math.sin(nx * 6.0 + t * 0.4) * 0.25;
  v += Math.sin(ny * 8.0 - t * 0.3) * 0.25;
  v += Math.sin((nx + ny) * 10.0 + t * 0.5) * 0.2;
  v += Math.sin(Math.sqrt(nx * nx + ny * ny) * 12.0 - t * 0.6) * 0.15;
  v += Math.sin(nx * 3.0 - ny * 5.0 + t * 0.2) * 0.15;
  return v * 0.5 + 0.5; // normalize to 0-1
}

document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

document.addEventListener('mouseleave', () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

// touch support
document.addEventListener('touchmove', (e) => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
}, { passive: false });

document.addEventListener('touchend', () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

let t = 0;

function render() {
  t += 0.016;

  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;

  // update grid — cells near mouse get pushed toward 1 (clear), others fade back to 0
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = gx * CELL + CELL / 2;
      const cy = gy * CELL + CELL / 2;
      const dx = cx - mouse.x;
      const dy = cy - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = gy * cols + gx;

      if (dist < RADIUS) {
        // smooth falloff
        const strength = 1.0 - (dist / RADIUS);
        const target = strength * strength; // quadratic falloff
        grid[idx] = Math.min(1, grid[idx] + (target - grid[idx]) * 0.3);
      } else {
        // fade back
        grid[idx] = Math.max(0, grid[idx] - FADE_SPEED);
      }
    }
  }

  // render pixels
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / CELL);
      const gy = Math.floor(y / CELL);
      const clearAmount = grid[gy * cols + gx];

      // base grayscale from noise field
      const noise = noiseField(x, y, t);

      // dither threshold
      const threshold = getBayer(x, y);

      // the dithered value — when clear, we push toward showing nothing (black)
      const dithered = noise > threshold ? 1 : 0;

      // blend: full dither when clearAmount=0, fade to black when clearAmount=1
      const brightness = dithered * (1.0 - clearAmount);

      // subtle warm tint
      const r = brightness * 220;
      const g = brightness * 210;
      const b = brightness * 200;

      const i = (y * W + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  requestAnimationFrame(render);
}

render();
