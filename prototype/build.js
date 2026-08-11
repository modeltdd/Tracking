/* Rebuilds prototype.html (and wireframe.html) from the template + JS + fonts.
   Usage: node build.js */
const fs = require('fs');
const path = require('path');

function b64(file) {
  return fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64');
}

const FONT_MAP = {
  F400_THAI: 'sarabun-400-thai.woff2',
  F400_LATIN: 'sarabun-400-latin.woff2',
  F600_THAI: 'sarabun-600-thai.woff2',
  F600_LATIN: 'sarabun-600-latin.woff2',
  F700_THAI: 'sarabun-700-thai.woff2',
  F700_LATIN: 'sarabun-700-latin.woff2',
};

function injectFonts(html) {
  for (const [key, file] of Object.entries(FONT_MAP)) {
    html = html.split('{{' + key + '}}').join(b64(file));
  }
  return html;
}

// prototype.html = template + inline app.js
let protoHtml = fs.readFileSync(path.join(__dirname, 'prototype.template.html'), 'utf8');
protoHtml = injectFonts(protoHtml);
const appJs = fs.readFileSync(path.join(__dirname, 'prototype.app.js'), 'utf8');
protoHtml = protoHtml.replace('{{APP_JS}}', () => appJs);
fs.writeFileSync(path.join(__dirname, 'prototype.html'), protoHtml);
console.log('prototype.html rebuilt:', (protoHtml.length / 1024).toFixed(0), 'KB');

// wireframe.html = template only (no separate JS file, inline already)
let wfHtml = fs.readFileSync(path.join(__dirname, 'wireframe.template.html'), 'utf8');
wfHtml = injectFonts(wfHtml);
fs.writeFileSync(path.join(__dirname, 'wireframe.html'), wfHtml);
console.log('wireframe.html rebuilt:', (wfHtml.length / 1024).toFixed(0), 'KB');
