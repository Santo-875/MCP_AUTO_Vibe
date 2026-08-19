import JSZip from 'jszip';

// Icon generator (creates simple valid 16x16, 48x48, 128x128 PNG data)
function createSvgIcon(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#6366f1"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${Math.floor(size * 0.22)}" fill="url(#g)"/>
    <g fill="none" stroke="#ffffff" stroke-width="${Math.max(1.5, size * 0.08)}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M${size * 0.5} ${size * 0.18}v${size * 0.16}M${size * 0.5} ${size * 0.66}v${size * 0.16}M${size * 0.27} ${size * 0.27}l${size * 0.11} ${size * 0.11}M${size * 0.62} ${size * 0.62}l${size * 0.11} ${size * 0.11}M${size * 0.18} ${size * 0.5}h${size * 0.16}M${size * 0.66} ${size * 0.5}h${size * 0.16}M${size * 0.27} ${size * 0.73}l${size * 0.11}-${size * 0.11}M${size * 0.62} ${size * 0.38}l${size * 0.11}-${size * 0.11}"/>
    </g>
  </svg>`;
}

// Convert SVG string to PNG Blob via Canvas
async function svgToPngBlob(svgStr: string, size: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob || new Blob([]));
      }, 'image/png');
    };
    img.src = url;
  });
}

export interface ExtensionFileMap {
  [path: string]: string;
}

export async function generateExtensionZip(files: ExtensionFileMap): Promise<Blob> {
  const zip = new JSZip();

  // Add source files
  Object.entries(files).forEach(([filename, content]) => {
    zip.file(filename, content);
  });

  // Generate icons
  try {
    const icon16 = await svgToPngBlob(createSvgIcon(16), 16);
    const icon48 = await svgToPngBlob(createSvgIcon(48), 48);
    const icon128 = await svgToPngBlob(createSvgIcon(128), 128);

    zip.file('icons/icon16.png', icon16);
    zip.file('icons/icon48.png', icon48);
    zip.file('icons/icon128.png', icon128);
  } catch (e) {
    console.warn('Canvas icon generation fallback');
  }

  // Add README for Chrome loading
  zip.file(
    'README.md',
    `# Gemini Auto MCQ & Quiz Solver - Chrome Extension (Manifest V3)

## Quick Installation Instructions (Load Unpacked in Chrome):

1. Unzip this folder to a directory on your computer (e.g. \`gemini-mcq-solver\`).
2. Open Google Chrome (or Brave / Edge / Opera).
3. Navigate to \`chrome://extensions\` in your URL bar.
4. Turn ON **"Developer mode"** in the top-right corner.
5. Click the **"Load unpacked"** button in the top-left.
6. Select this unzipped folder containing \`manifest.json\`.
7. The **Gemini MCQ Solver** icon will appear in your Chrome toolbar!

## Configuration:
- Click the extension icon -> Open Settings (Options page).
- Enter your Gemini API Key or set your custom server proxy endpoint.
- Pin the extension to your toolbar.
- Open any quiz / MCQ webpage, click **Start Solving**, and let Gemini autonomously detect, solve, click, verify, scroll, and submit!
`
  );

  return await zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
