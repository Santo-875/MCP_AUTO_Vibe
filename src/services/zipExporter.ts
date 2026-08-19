import JSZip from 'jszip';

// Valid 128x128 standard PNG base64
const VALID_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAFFJREFUeJztwTEBAAAAwqD1T20ND6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBvAiUAAAFmB1UAAAAASUVORK5CYII=';

function getPngBlob(): Blob {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#4f46e5';
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, 0, 128, 128, 28);
      } else {
        ctx.rect(0, 0, 128, 128);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', 64, 68);
    }
    const dataUrl = canvas.toDataURL('image/png');
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes.buffer], { type: 'image/png' });
  } catch (e) {
    const binary = atob(VALID_ICON_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes.buffer], { type: 'image/png' });
  }
}

export interface ExtensionFileMap {
  [path: string]: string;
}

export async function generateExtensionZip(files: ExtensionFileMap): Promise<Blob> {
  const zip = new JSZip();

  // 1. Add all core extension files directly to root of the ZIP
  Object.entries(files).forEach(([filename, content]) => {
    zip.file(filename, content);
  });

  // 2. Add icon files at both root and icons/ folder for 100% compatibility
  const iconBlob = getPngBlob();
  zip.file('icon.png', iconBlob);
  zip.file('icon16.png', iconBlob);
  zip.file('icon48.png', iconBlob);
  zip.file('icon128.png', iconBlob);
  zip.file('icons/icon.png', iconBlob);
  zip.file('icons/icon16.png', iconBlob);
  zip.file('icons/icon48.png', iconBlob);
  zip.file('icons/icon128.png', iconBlob);

  // 3. Explicit README
  zip.file(
    'README.md',
    `# Gemini Auto MCQ & Quiz Solver - Chrome Extension (Manifest V3)

## How to Load in Chrome:
1. Open Google Chrome (or Brave / Edge / Opera).
2. Go to \`chrome://extensions\`.
3. Enable **"Developer mode"** in the top-right.
4. Click **"Load unpacked"** in the top-left.
5. Select this folder (where \`manifest.json\` is located).
6. Open any quiz and start solving!
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
