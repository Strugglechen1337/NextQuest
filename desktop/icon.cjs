const sharp = require('../node_modules/sharp');
const fs = require('node:fs');
fs.mkdirSync('build', { recursive: true });
sharp('../src/app/icon.svg').resize(512, 512).png().toFile('build/icon.png').catch(e => { console.error(e); process.exitCode = 1; });
