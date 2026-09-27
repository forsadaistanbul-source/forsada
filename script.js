import * as THREE from 'three';
import { vertexShader, trailFragmentShader, displayFragmentShader } from './shaders.js';

const CONFIG = {
  simSize: 500,            // simülasyon render-target boyutu (kare, ping-pong)
  decay: 0.965,            // iz maskesinin sönme hızı
  lineWidth: 0.085,
  perFrameIntensity: 0.28,
  revealThreshold: 0.02,
  edgeWidthBase: 0.004,    // shader içinde uDpr'a bölünür
  haloUpperMul: 2.0,
  haloMixStrength: 0.3,
  haloGray: [0.85, 0.8, 0.7],   // sıcak/krem tonlu hâle — CafeCadde paletine uygun
  idleThresholdMs: 2600,
  idleEaseInMs: 1500,
  autoLerp: 0.05,
  stopAfterMs: 50,
  maxTextureSize: 4096,
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const BASE = import.meta.env.BASE_URL;

/* ------------------------------------------------------------------ */
/* Hero: "İz Bırakan Masa"                                             */
/* ------------------------------------------------------------------ */

function initHero(canvas) {
  const hero = canvas.closest('.hero');

  // 1. Renderer
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, precision: 'highp' });
  } catch (err) {
    hero.classList.add('hero--static');
    console.warn('WebGL kullanılamıyor, statik hero gösteriliyor.', err);
    return;
  }
  const getDpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const getSize = () => ({ w: hero.clientWidth || window.innerWidth, h: hero.clientHeight || window.innerHeight });
  let { w, h } = getSize();
  renderer.setPixelRatio(getDpr());
  renderer.setSize(w, h, false);

  // 2. Scene + camera
  const scene = new THREE.Scene();
  const simScene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // 3. Ping-pong targets. Float32 needs linear filtering support; otherwise
  // fall back to half floats, and as a last resort to bytes with a decay floor
  // so 8-bit rounding can't freeze the mask above the reveal threshold.
  const ext = renderer.extensions;
  let texType = THREE.FloatType;
  let decayFloor = 0;
  if (!(ext.has('EXT_color_buffer_float') && ext.has('OES_texture_float_linear'))) {
    if (ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float')) {
      texType = THREE.HalfFloatType;
    } else {
      texType = THREE.UnsignedByteType;
      decayFloor = 1.5 / 255;
    }
  }
  const rtOptions = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: texType,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const targets = [
    new THREE.WebGLRenderTarget(CONFIG.simSize, CONFIG.simSize, rtOptions),
    new THREE.WebGLRenderTarget(CONFIG.simSize, CONFIG.simSize, rtOptions),
  ];
  renderer.setClearColor(0x000000, 1);
  for (const target of targets) {
    renderer.setRenderTarget(target);
    renderer.clear();
  }
  renderer.setRenderTarget(null);
  let currentTarget = 0;

  // 4. Pointer state, normalised [0,1] canvas coords (y up)
  const mouse = new THREE.Vector2(0.5, 0.5);
  const prevMouse = new THREE.Vector2(0.5, 0.5);
  let isMoving = false;
  let lastMoveTime = performance.now();

  // Idle auto-pointer state
  const autoMouse = new THREE.Vector2(0.5, 0.5);
  const prevAutoMouse = new THREE.Vector2(0.5, 0.5);
  const autoTarget = new THREE.Vector2();
  let autoActive = false;

  // 5. Textures: flat placeholders until the photos arrive
  const topTextureSize = new THREE.Vector2(2, 2);
  const bottomTextureSize = new THREE.Vector2(2, 2);
  const topPlaceholder = solidTexture([226, 212, 188]);   // sıcak bej
  const bottomPlaceholder = solidTexture([74, 22, 30]);   // koyu bordo

  // 6. Materials + meshes
  const quad = new THREE.PlaneGeometry(2, 2);

  const trailMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: trailFragmentShader,
    uniforms: {
      uPrevTrail: { value: targets[0].texture },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: { value: new THREE.Vector2(w, h) },
      uDecay: { value: CONFIG.decay },
      uDecayFloor: { value: decayFloor },
      uIsMoving: { value: 0 },
      uLineWidth: { value: CONFIG.lineWidth },
      uIntensity: { value: CONFIG.perFrameIntensity },
    },
    depthTest: false,
    depthWrite: false,
  });

  const displayMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: displayFragmentShader,
    uniforms: {
      uTrail: { value: targets[0].texture },
      uTopTexture: { value: topPlaceholder },
      uBottomTexture: { value: bottomPlaceholder },
      uResolution: { value: new THREE.Vector2(w, h) },
      uTopTextureSize: { value: topTextureSize },
      uBottomTextureSize: { value: bottomTextureSize },
      uDpr: { value: getDpr() },
      uRevealThreshold: { value: CONFIG.revealThreshold },
      uEdgeWidthBase: { value: CONFIG.edgeWidthBase },
      uHaloUpperMul: { value: CONFIG.haloUpperMul },
      uHaloMixStrength: { value: CONFIG.haloMixStrength },
      uHaloColor: { value: new THREE.Vector3(...CONFIG.haloGray) },
    },
    depthTest: false,
    depthWrite: false,
  });

  const simMesh = new THREE.Mesh(quad, trailMaterial);
  simScene.add(simMesh);
  const displayMesh = new THREE.Mesh(quad, displayMaterial);
  scene.add(displayMesh);

  loadImageTexture(`${BASE}hero-day.jpg`, renderer, displayMaterial.uniforms.uTopTexture, topTextureSize);
  loadImageTexture(`${BASE}hero-night.jpg`, renderer, displayMaterial.uniforms.uBottomTexture, bottomTextureSize);

  // 8. Input — window-level so the overlay text never swallows movement
  function handlePointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const inside =
      clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) {
      // Deliberately leave lastMoveTime alone so the idle trail keeps going.
      isMoving = false;
      return;
    }
    const x = (clientX - rect.left) / rect.width;
    const y = 1 - (clientY - rect.top) / rect.height;
    if (!isMoving) {
      // Starting a fresh stroke (or taking over from the auto-pointer):
      // collapse the segment so no stale line is drawn across the canvas.
      prevMouse.set(x, y);
    }
    mouse.set(x, y);
    isMoving = true;
    lastMoveTime = performance.now();
    autoActive = false;
  }
  window.addEventListener('mousemove', (e) => handlePointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) handlePointer(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t) { isMoving = false; handlePointer(t.clientX, t.clientY); }
  }, { passive: true });

  // 9. Resize
  function onResize() {
    ({ w, h } = getSize());
    const dpr = getDpr();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    trailMaterial.uniforms.uResolution.value.set(w, h);
    displayMaterial.uniforms.uResolution.value.set(w, h);
    displayMaterial.uniforms.uDpr.value = dpr;
  }
  window.addEventListener('resize', onResize);

  // Pause entirely while the hero is scrolled out of view or the tab is hidden
  let heroVisible = true;
  new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }).observe(hero);

  // 7. Render loop
  function frame(now) {
    requestAnimationFrame(frame);
    if (!heroVisible || document.hidden) return;

    const sinceMove = now - lastMoveTime;
    if (isMoving && sinceMove > CONFIG.stopAfterMs) isMoving = false;

    let strength = isMoving ? 1 : 0;
    const idleFor = sinceMove - CONFIG.idleThresholdMs;

    if (!reducedMotion.matches && idleFor > 0) {
      if (!autoActive) {
        // Start the synthetic pointer where the real one was left.
        autoActive = true;
        autoMouse.copy(mouse);
        prevAutoMouse.copy(mouse);
      }
      prevAutoMouse.copy(autoMouse);
      autoPath(now * 0.001, autoTarget);
      autoMouse.lerp(autoTarget, CONFIG.autoLerp);

      // Mirror into the real vectors so a hand-over never starts from a stale point.
      mouse.copy(autoMouse);
      prevMouse.copy(prevAutoMouse);
      strength = smoothstep(0, CONFIG.idleEaseInMs, idleFor);
    }

    const tu = trailMaterial.uniforms;
    tu.uMouse.value.copy(mouse);
    tu.uPrevMouse.value.copy(prevMouse);
    tu.uIsMoving.value = strength;

    const readTarget = targets[currentTarget];
    currentTarget = 1 - currentTarget;
    const writeTarget = targets[currentTarget];

    tu.uPrevTrail.value = readTarget.texture;
    renderer.setRenderTarget(writeTarget);
    renderer.render(simScene, camera);
    renderer.setRenderTarget(null);

    displayMaterial.uniforms.uTrail.value = writeTarget.texture;
    renderer.render(scene, camera);

    // Next frame's segment starts where this one ended, however many
    // pointer events arrived in between.
    prevMouse.copy(mouse);
  }
  requestAnimationFrame(frame);
}

// Low-frequency Lissajous-ish wander built from incommensurate frequencies,
// so the path never visibly repeats.
function autoPath(t, out) {
  const x = 0.5
    + 0.26 * Math.sin(t * 0.53)
    + 0.11 * Math.sin(t * 1.37 + 1.3)
    + 0.04 * Math.cos(t * 2.71 + 0.2);
  const y = 0.5
    + 0.2 * Math.cos(t * 0.61 + 0.4)
    + 0.12 * Math.sin(t * 1.13 + 2.1)
    + 0.04 * Math.sin(t * 3.07);
  return out.set(x, y);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function solidTexture([r, g, b]) {
  const data = new Uint8Array(2 * 2 * 4);
  for (let i = 0; i < 4; i++) data.set([r, g, b, 255], i * 4);
  const tex = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

function loadImageTexture(src, renderer, textureUniform, sizeVector) {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.decoding = 'async';
  img.onload = () => {
    let source = img;
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    const limit = Math.min(CONFIG.maxTextureSize, renderer.capabilities.maxTextureSize);

    if (Math.max(width, height) > limit) {
      const scale = limit / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const off = document.createElement('canvas');
      off.width = width;
      off.height = height;
      off.getContext('2d').drawImage(img, 0, 0, width, height);
      source = off;
    }

    const texture = new THREE.Texture(source);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    textureUniform.value.dispose();
    textureUniform.value = texture;
    sizeVector.set(width, height);
  };
  img.onerror = () => console.warn(`Hero görseli yüklenemedi (${src}); yer tutucu renk kullanılıyor.`);
  img.src = src;
}

/* ------------------------------------------------------------------ */
/* Rakamlar: count-up, bir kez                                         */
/* ------------------------------------------------------------------ */

function initCountUp() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  if (reducedMotion.matches || !('IntersectionObserver' in window)) return; // HTML already holds final values

  const duration = 1600;
  const run = (el) => {
    const target = Number(el.dataset.count);
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      run(entry.target);
    }
  }, { threshold: 0.6 });

  counters.forEach((el) => {
    el.textContent = '0';
    observer.observe(el);
  });
}

/* ------------------------------------------------------------------ */
/* Henüz doğrulanmamış bağlantılar                                     */
/* ------------------------------------------------------------------ */

function initPendingLinks() {
  document.querySelectorAll('a[data-pending="true"]').forEach((a) => {
    a.setAttribute('aria-disabled', 'true');
    a.addEventListener('click', (e) => e.preventDefault());
  });
}

/* ------------------------------------------------------------------ */
/* Marka kartları: fotoğraf yoksa logo ortada kalır                    */
/* ------------------------------------------------------------------ */

function initBrandPhotos() {
  document.querySelectorAll('.brand-card__img').forEach((img) => {
    const markEmpty = () => img.closest('.brand-card__photo').classList.add('is-empty');
    // The module can run after a missing image has already failed.
    if (img.complete && img.naturalWidth === 0) markEmpty();
    else img.addEventListener('error', markEmpty, { once: true });
  });
}

const heroCanvas = document.querySelector('.hero canvas');
if (heroCanvas) initHero(heroCanvas);
initCountUp();
initPendingLinks();
initBrandPhotos();
