// WordPress + WPBakery paketi üretir.
//
//   npm run build:wp
//   ASSET_BASE=https://www.cafecadde.com.tr/wp-content/uploads/cafecadde-family/ npm run build:wp
//
// Çıktı (wordpress/):
//   cafecadde-family/                  → sunucuya yüklenecek görseller, logolar, fontlar
//   cafecadde-family-assets.zip        → aynı klasörün zip hâli
//   raw-html.html                      → WPBakery "Raw HTML" öğesine yapıştırılacak kod
//   wpbakery-shortcode.txt             → Arka uç düzenleyicisine (Classic Mode) yapıştırılacak hazır satır
//   onizleme.html                      → yerelde denemek için tam sayfa
//
// Temayla çakışmayı önlemek için tüm sınıflar, kimlikler ve animasyon adları "ccf-" önekini alır,
// tüm CSS kuralları .ccf-root sarmalayıcısının altına alınır.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT_DIR, 'wordpress');
const ASSET_DIR_NAME = 'cafecadde-family';
const ASSET_BASE = withSlash(process.env.ASSET_BASE || `/wp-content/uploads/${ASSET_DIR_NAME}/`);
const P = 'ccf-';

const read = (f) => fs.readFileSync(path.join(ROOT_DIR, f), 'utf8');

function withSlash(u) {
  return u.endsWith('/') ? u : `${u}/`;
}

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

const indexHtml = read('index.html');
const mainMatch = indexHtml.match(/<main>([\s\S]*?)<\/main>/);
if (!mainMatch) throw new Error('index.html içinde <main> bulunamadı');
let body = mainMatch[1];

// Sınıflar
const classNames = new Set();
body.replace(/class="([^"]+)"/g, (_, list) => {
  list.split(/\s+/).filter(Boolean).forEach((c) => classNames.add(c));
});
// Yalnızca JS/CSS'te geçen durum sınıfları
['has-active', 'is-active', 'is-current', 'is-playing', 'is-intro', 'reveal-ready', 'is-visible'].forEach((c) =>
  classNames.add(c)
);

body = body.replace(/class="([^"]+)"/g, (_, list) =>
  `class="${list.split(/\s+/).filter(Boolean).map((c) => P + c).join(' ')}"`
);

// Kimlikler ve onlara verilen referanslar
const ids = new Set();
body.replace(/\sid="([^"]+)"/g, (_, id) => ids.add(id));
body = body
  .replace(/\sid="([^"]+)"/g, (_, id) => ` id="${P}${id}"`)
  .replace(/\s(aria-controls|aria-labelledby|for)="([^"]+)"/g, (_, attr, v) =>
    ` ${attr}="${v.split(/\s+/).map((x) => (ids.has(x) ? P + x : x)).join(' ')}"`
  )
  .replace(/href="#([^"]+)"/g, (m, id) => (ids.has(id) ? `href="#${P}${id}"` : m));

// Varlık yolları
body = body.replace(/(["\s,])\/(img|logo)\//g, `$1${ASSET_BASE}$2/`);

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const keyframeNames = new Set();
const cssSource = read('styles.css');
postcss.parse(cssSource).walkAtRules(/keyframes$/, (at) => keyframeNames.add(at.params.trim()));

const classRe = /\.(-?[_a-zA-Z][\w-]*)/g;
const renameClasses = (sel) => sel.replace(classRe, (m, name) => (classNames.has(name) ? `.${P}${name}` : m));

function scope(sel) {
  const s = sel.trim();
  if (s === ':root' || s === 'html' || s === 'body') return `.${P}root`;
  if (s.startsWith(`.${P}reveal-ready`)) return `.${P}root${s}`;
  return `.${P}root ${s}`;
}

const scoped = postcss([
  {
    postcssPlugin: 'ccf-scope',
    Once(root) {
      root.walkAtRules(/keyframes$/, (at) => {
        at.params = P + at.params.trim();
      });
      root.walkDecls(/^animation(-name)?$/, (decl) => {
        decl.value = decl.value.replace(/[\w-]+/g, (w) => (keyframeNames.has(w) ? P + w : w));
      });
      root.walkRules((rule) => {
        if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
        rule.selectors = rule.selectors.map((sel) => scope(renameClasses(sel)));
      });
      // Tek başına sayfadaki fixed "atla" bağlantısı gömülü sürümde yok
      root.walkRules((rule) => {
        if (rule.selector.includes(`${P}skip-link`)) rule.remove();
      });
    },
  },
]).process(cssSource, { from: undefined }).css;

// Fontlar: yalnızca Türkçe için gereken latin + latin-ext alt kümeleri
const FONT_SOURCES = [
  'node_modules/@fontsource/bodoni-moda/400.css',
  'node_modules/@fontsource/bodoni-moda/400-italic.css',
  'node_modules/@fontsource-variable/manrope/index.css',
];
const fontFiles = [];
let fontCss = '';
for (const file of FONT_SOURCES) {
  const css = read(file);
  const dir = path.dirname(path.join(ROOT_DIR, file));
  for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
    const woff2 = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/);
    // Dosya adı alt kümeyi taşır: ...-latin-... veya ...-latin-ext-...
    if (!woff2 || !woff2[1].includes('-latin-')) continue;
    fontFiles.push(path.join(dir, 'files', woff2[1]));
    fontCss += block
      .replace(/src:[^;]+;/, `src: url(${ASSET_BASE}fonts/${woff2[1]}) format('woff2');`)
      .replace(/\s+/g, ' ') + '\n';
  }
}
if (fontFiles.length < 6) throw new Error(`Beklenen font dosyaları bulunamadı (${fontFiles.length})`);

// Gömülü sürüme özel küçük eklemeler
const embedCss = `
/* WordPress içinde: sayfanın geri kalanından bağımsız tam genişlik ve koyu zemin */
.${P}root { position: relative; display: block; width: 100%; }
.${P}root img { height: auto; }
.${P}root .${P}card__photo { height: 100%; max-width: none; }
.${P}root a { box-shadow: none; }
`;

/* ------------------------------------------------------------------ */
/* JS                                                                  */
/* ------------------------------------------------------------------ */

let js = read('script.js')
  .replace(/^import .*;\s*$/gm, '')
  .replace(/'(has-active|is-active|is-current|is-playing|is-intro|reveal-ready|is-visible)'/g, `'${P}$1'`);
js = `(function () {\n'use strict';\n${js.trim()}\n})();`;

/* ------------------------------------------------------------------ */
/* Çıktılar                                                            */
/* ------------------------------------------------------------------ */

const fragment = [
  '<!-- CafeCadde Family ana giriş — WPBakery Raw HTML -->',
  `<style>\n${fontCss}${scoped}\n${embedCss}</style>`,
  `<div class="${P}root" data-ccf-root>${body}</div>`,
  `<script>\n${js}\n</script>`,
].join('\n');

// Yalnızca üretilen dosyaları temizle (KURULUM.md elle yazılır, korunur)
for (const f of [ASSET_DIR_NAME, 'cafecadde-family-assets.zip', 'raw-html.html', 'wpbakery-shortcode.txt', 'onizleme.html']) {
  fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'raw-html.html'), fragment);

// WPBakery Raw HTML içeriği: base64(rawurlencode(html))
const rawurlencode = (str) =>
  encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encoded = Buffer.from(rawurlencode(fragment), 'utf8').toString('base64');
fs.writeFileSync(
  path.join(OUT, 'wpbakery-shortcode.txt'),
  `[vc_row full_width="stretch_row_content_no_spaces"][vc_column][vc_raw_html]${encoded}[/vc_raw_html][/vc_column][/vc_row]\n`
);

// Varlıklar
const assetDir = path.join(OUT, ASSET_DIR_NAME);
for (const sub of ['img', 'logo']) {
  fs.cpSync(path.join(ROOT_DIR, 'public', sub), path.join(assetDir, sub), { recursive: true });
}
fs.mkdirSync(path.join(assetDir, 'fonts'), { recursive: true });
for (const f of fontFiles) fs.copyFileSync(f, path.join(assetDir, 'fonts', path.basename(f)));

try {
  execFileSync('zip', ['-rq', 'cafecadde-family-assets.zip', ASSET_DIR_NAME], { cwd: OUT });
} catch {
  console.warn('zip bulunamadı; klasörü elle sıkıştırın.');
}

// Yerel önizleme: varlıkları göreli yoldan okur, bir tema sayfasını taklit eder
const preview = fragment.split(ASSET_BASE).join(`./${ASSET_DIR_NAME}/`);
fs.writeFileSync(
  path.join(OUT, 'onizleme.html'),
  `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>CafeCadde Family — WordPress önizleme</title>
<style>
  /* Tipik tema varsayılanları: gömülü kodun bunlardan etkilenmediğini görmek için */
  body { margin: 0; font: 18px/1.8 Georgia, serif; color: #333; background: #fff; }
  p { margin: 0 0 1.5em; }
  a { color: #c0392b; }
  button { background: #3452ff; color: #fff; padding: 12px 24px; border-radius: 4px; text-transform: uppercase; }
  img { border: 0; }
</style>
</head>
<body>
<div class="wpb_row"><div class="wpb_column"><div class="wpb_wrapper">
${preview}
</div></div></div>
</body>
</html>
`
);

console.log(`WordPress paketi hazır → ${path.relative(ROOT_DIR, OUT)}/ (varlık yolu: ${ASSET_BASE})`);
