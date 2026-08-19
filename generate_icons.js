import fs from 'fs';
import path from 'path';

// Valid 128x128 standard PNG base64
const VALID_ICON_BASE64 = 
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAFFJREFUeJztwTEBAAAAwqD1T20ND6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBvAiUAAAFmB1UAAAAASUVORK5CYII=';

const iconBuffer = Buffer.from(VALID_ICON_BASE64, 'base64');

const directories = ['./icons', './public', './public/icons', './src/extension/icons'];
directories.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const files = [
  './icon.png',
  './icon16.png',
  './icon48.png',
  './icon128.png',
  './icons/icon16.png',
  './icons/icon48.png',
  './icons/icon128.png',
  './icons/icon.png',
  './public/icon.png',
  './public/icon16.png',
  './public/icon48.png',
  './public/icon128.png',
  './public/icons/icon16.png',
  './public/icons/icon48.png',
  './public/icons/icon128.png',
  './src/extension/icons/icon16.png',
  './src/extension/icons/icon48.png',
  './src/extension/icons/icon128.png',
];

files.forEach((file) => {
  fs.writeFileSync(file, iconBuffer);
  console.log('Created valid icon at:', file);
});

console.log('All icon PNGs successfully generated in root and subfolders!');
