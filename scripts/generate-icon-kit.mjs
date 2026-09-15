import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.join(rootDir, 'assets', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const masterSvgPath = path.join(iconsDir, 'logo-google.svg');
if (!fs.existsSync(masterSvgPath)) {
  throw new Error(`Master SVG not found at ${masterSvgPath}`);
}
const masterSvgContent = fs.readFileSync(masterSvgPath, 'utf8');

// Find Edge or Chrome executable for hardware-accelerated / subpixel rasterization
function findBrowserPath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Pure Node.js PNG encoder fallback (zero dependencies, fully spec compliant)
function createPureNodePng(width, height, renderFn) {
  // RGBA buffer: height scanlines, each scanline has 1 filter byte (0x00) + width * 4 bytes
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderFn(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);

  // Helper to build a PNG chunk
  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);

    // CRC32 over type and data
    const crc = calcCrc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  // PNG Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const idatChunk = makeChunk('IDAT', idatData);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// CRC-32 table calculation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function calcCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Icon specifications to generate
const ICON_SPECS = [
  {
    filename: 'favicon-16x16.png',
    width: 16,
    height: 16,
    type: 'favicon',
    bg: 'transparent',
    paddingRatio: 0,
  },
  {
    filename: 'favicon-32x32.png',
    width: 32,
    height: 32,
    type: 'favicon',
    bg: 'transparent',
    paddingRatio: 0,
  },
  {
    filename: 'apple-touch-icon.png',
    width: 180,
    height: 180,
    type: 'apple-touch',
    bg: '#0b1120',
    paddingRatio: 0.12, // 12% padding with dark navy backdrop
  },
  {
    filename: 'icon-192.png',
    width: 192,
    height: 192,
    type: 'pwa-standard',
    bg: 'transparent',
    paddingRatio: 0.04,
  },
  {
    filename: 'icon-512.png',
    width: 512,
    height: 512,
    type: 'pwa-standard',
    bg: 'transparent',
    paddingRatio: 0.04,
  },
  {
    filename: 'icon-maskable-192.png',
    width: 192,
    height: 192,
    type: 'pwa-maskable',
    bg: '#0b1120',
    paddingRatio: 0.18, // 18% safe-zone margin per W3C Maskable spec
  },
  {
    filename: 'icon-maskable-512.png',
    width: 512,
    height: 512,
    type: 'pwa-maskable',
    bg: '#0b1120',
    paddingRatio: 0.18, // 18% safe-zone margin per W3C Maskable spec
  },
];

const browserPath = findBrowserPath();
console.log('Rasterization engine:', browserPath ? `Headless Browser (${browserPath})` : 'Pure Node.js Fallback');

for (const spec of ICON_SPECS) {
  const destPath = path.join(iconsDir, spec.filename);
  let rendered = false;

  if (browserPath) {
    try {
      const pad = Math.round(spec.width * spec.paddingRatio);
      const iconSize = spec.width - pad * 2;
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${spec.width}px;
    height: ${spec.height}px;
    overflow: hidden;
    background: ${spec.bg};
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-wrapper {
    width: ${iconSize}px;
    height: ${iconSize}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
</head>
<body>
  <div class="icon-wrapper">
    ${masterSvgContent}
  </div>
</body>
</html>`;

      const tempHtmlPath = path.join(iconsDir, `_temp_${spec.filename}.html`);
      fs.writeFileSync(tempHtmlPath, html, 'utf8');

      const cmd = `"${browserPath}" --headless=new --disable-gpu --screenshot="${destPath}" --window-size=${spec.width},${spec.height} --default-background-color=00000000 --hide-scrollbars "${tempHtmlPath}"`;
      execSync(cmd, { stdio: 'pipe' });

      if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);

      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
        rendered = true;
      }
    } catch (err) {
      console.warn(`Browser render failed for ${spec.filename}: ${err.message}, using fallback.`);
    }
  }

  if (!rendered) {
    // Pure Node.js fallback rasterizer
    const pngBuffer = createPureNodePng(spec.width, spec.height, (x, y, w, h) => {
      const u = x / w;
      const v = y / h;
      const isMaskableOrApple = spec.bg !== 'transparent';

      if (isMaskableOrApple) {
        // Base dark blue navy backdrop (#0b1120)
        let r = 11, g = 17, b = 32, a = 255;
        // Central icon safe zone
        const dx = u - 0.5;
        const dy = v - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.35) {
          // Checkmark / ribbon color blend
          if (u > 0.4 && v > 0.3 && u < 0.7 && v < 0.7) {
            return [52, 168, 83, 255]; // Google Green (#34A853)
          }
          return [66, 133, 244, 255]; // Google Blue (#4285F4)
        }
        return [r, g, b, a];
      } else {
        // Transparent favicon / standard PWA icon
        const dx = u - 0.5;
        const dy = v - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.46) {
          if (u > 0.35 && v > 0.3 && u < 0.75 && v < 0.75) {
            return [52, 168, 83, 255]; // Google Green
          }
          return [66, 133, 244, 255]; // Google Blue
        }
        return [0, 0, 0, 0];
      }
    });

    fs.writeFileSync(destPath, pngBuffer);
  }

  // Verify PNG header and dimensions
  const buf = fs.readFileSync(destPath);
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);

  if (!isPng || w !== spec.width || h !== spec.height) {
    throw new Error(`Corrupted PNG generated for ${spec.filename}: expected ${spec.width}x${spec.height}, got ${w}x${h}`);
  }

  console.log(`✓ Generated ${spec.filename} (${w}x${h}, ${buf.length} bytes)`);
}

// Generate standalone manifest.json
const manifestData = {
  name: "E-Kinerja Harian ASN",
  short_name: "E-Kinerja",
  description: "Log aktivitas harian dan kinerja pribadi ASN berbasis Google Sheets",
  start_url: "./",
  scope: "./",
  display: "standalone",
  orientation: "any",
  background_color: "#0b1120",
  theme_color: "#2563eb",
  icons: [
    {
      src: "./assets/icons/favicon-16x16.png",
      sizes: "16x16",
      type: "image/png"
    },
    {
      src: "./assets/icons/favicon-32x32.png",
      sizes: "32x32",
      type: "image/png"
    },
    {
      src: "./assets/icons/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png"
    },
    {
      src: "./assets/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "./assets/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "./assets/icons/icon-maskable-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable"
    },
    {
      src: "./assets/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    },
    {
      src: "./assets/icons/logo-google.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any"
    }
  ]
};

const manifestPath = path.join(iconsDir, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2) + '\n', 'utf8');
console.log(`✓ Generated manifest.json (${manifestPath})`);

// Also generate root manifest.json if useful for static hosts/PWA
const rootManifestPath = path.join(rootDir, 'manifest.json');
fs.writeFileSync(rootManifestPath, JSON.stringify(manifestData, null, 2) + '\n', 'utf8');
console.log(`✓ Generated root manifest.json (${rootManifestPath})`);

console.log('\nAll multi-size raster icon kit & PWA assets generated successfully!');
