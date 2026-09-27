import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Dört marka, dört halka. Kaydırdıkça dağınık eksenlerden tek bir eksene hizalanırlar.
const RINGS = [
  { color: '#d55e00', radius: 1.55, tube: 0.028, tilt: [1.1, 0.2, 0.4] },  // Strada
  { color: '#e5e5cc', radius: 1.3, tube: 0.024, tilt: [-0.7, 0.9, -0.3] }, // Machi
  { color: '#cda66d', radius: 1.05, tube: 0.026, tilt: [0.3, -1.2, 0.8] }, // Süreyya
  { color: '#b4ad7a', radius: 0.8, tube: 0.022, tilt: [-1.3, -0.4, -0.9] }, // CafeCadde Family
];

const DUST_COUNT = 900;

export function createWorld(section, canvas, { reducedMotion }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x0f0e0d, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f0e0d, 6, 14);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 7);

  // Işıklar: sıcak ana ışık + soğuk kenar ışığı
  const key = new THREE.PointLight(0xffd9a8, 30, 20, 2);
  key.position.set(3, 3, 4);
  const rim = new THREE.PointLight(0x9fb3c8, 14, 20, 2);
  rim.position.set(-4, -2, -3);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.08));

  const group = new THREE.Group();
  scene.add(group);

  // Merkez: cam küre
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 64, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0xfff6ea,
      metalness: 0,
      roughness: 0.08,
      transmission: 1,
      thickness: 0.9,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      attenuationColor: new THREE.Color('#cda66d'),
      attenuationDistance: 2.2,
    })
  );
  group.add(core);

  // Halkalar
  const rings = RINGS.map((cfg) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.radius, cfg.tube, 32, 240),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(cfg.color),
        metalness: 1,
        roughness: 0.22,
        clearcoat: 0.6,
        emissive: new THREE.Color(cfg.color),
        emissiveIntensity: 0.06,
      })
    );
    const from = new THREE.Quaternion().setFromEuler(new THREE.Euler(...cfg.tilt));
    const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.35, 0, 0));
    group.add(mesh);
    return { mesh, from, to, spin: 0 };
  });

  // Toz: sıcak ışıkta yüzen zerreler
  const dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(DUST_COUNT * 3);
  const seeds = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    const r = 1.8 + Math.random() * 4.5;
    const a = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 6;
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r - 1], i * 3);
    seeds[i] = Math.random();
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: renderer.getPixelRatio() } },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime;
        uniform float uPixel;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.25 + seed * 6.2831) * 0.25;
          p.x += cos(uTime * 0.18 + seed * 12.0) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.2 + seed * 2.6) * uPixel * (6.0 / -mv.z);
          vAlpha = 0.25 + 0.55 * (0.5 + 0.5 * sin(uTime * 0.8 + seed * 40.0));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(1.0, 0.86, 0.66, a);
        }
      `,
    })
  );
  scene.add(dust);

  /* ---------- Etkileşim ---------- */

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  let progress = 0;
  let smoothProgress = 0;
  function readScroll() {
    const r = section.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    progress = total > 0 ? Math.min(Math.max(-r.top / total, 0), 1) : 0;
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Dar ekranda sahne sığsın
    camera.position.z = w / h < 0.8 ? 9.5 : 7;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(section);

  let last = performance.now();
  let elapsed = 0;
  const tmp = new THREE.Quaternion();
  const ease = (t) => t * t * (3 - 2 * t);

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || document.hidden) return;
    elapsed += dt;
    const t = elapsed;
    const still = reducedMotion.matches;

    smoothProgress += (progress - smoothProgress) * (still ? 1 : 0.08);
    // İlk bölümde dağınık, son bölümde hizalı
    const align = ease(Math.min(Math.max((smoothProgress - 0.25) / 0.6, 0), 1));

    rings.forEach((ring, i) => {
      if (!still) ring.spin += dt * (0.18 + i * 0.07) * (1 - align * 0.7);
      tmp.slerpQuaternions(ring.from, ring.to, align);
      ring.mesh.quaternion.copy(tmp);
      ring.mesh.rotateZ(ring.spin);
      // Hizalanınca halkalar hafifçe dikeyde yayılır
      ring.mesh.position.y = (i - 1.5) * 0.12 * align;
      ring.mesh.material.emissiveIntensity = 0.06 + align * 0.18;
    });

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    group.rotation.y = pointer.x * 0.25 + (still ? 0 : t * 0.05);
    group.rotation.x = pointer.y * 0.15;
    // Metnin karşı tarafında dur: sağ → sol → orta
    group.position.x = window.innerWidth >= 700 ? 1.4 * Math.cos(smoothProgress * Math.PI * 1.5) : 0;
    // Dar ekranda metin üstte, sahne altta; son bölümde halkalar başlığın altına iner
    const narrow = camera.aspect < 0.8;
    const baseY = narrow ? -1.35 : 0;
    group.position.y = baseY - align * (narrow ? 0.2 : 1.05);
    group.scale.setScalar((narrow ? 0.85 : 1) * (1 + align * 0.1));

    dust.material.uniforms.uTime.value = still ? 0 : t;
    dust.rotation.y = still ? 0 : t * 0.02;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
