import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/400-italic.css';
import '@fontsource-variable/manrope';

const HOVER_INTENT_MS = 80;    // imleç bu kadar durmadan kart açılmaz
const LEAVE_DELAY_MS = 160;    // alandan çıkınca eşit düzene dönüş
const AUTOPLAY_MS = 4500;      // carousel modunda kartlar arası süre
const RESUME_AFTER_MS = 7000;  // kullanıcı dokunduktan sonra otomatik kaydırmanın yeniden başlaması

// Sayfa tek başına çalışırken <html>, WordPress içine gömülüyken betikten hemen önceki sarmalayıcı.
// Aynı kod sayfaya iki kez eklenirse her kopya yalnızca kendi alanını yönetir.
const OWN_ROOT = document.currentScript?.previousElementSibling;
const ROOT = OWN_ROOT?.matches?.('[data-ccf-root]') ? OWN_ROOT : document.documentElement;
const EMBEDDED = ROOT !== document.documentElement;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktop = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');

/* ------------------------------------------------------------------ */
/* Kartlar                                                             */
/* ------------------------------------------------------------------ */

function initDeck(deck) {
  const cards = [...deck.querySelectorAll('[data-card]')];
  const triggers = cards.map((c) => c.querySelector('[data-trigger]'));
  const bodies = cards.map((c) => c.querySelector('[data-body]'));
  const nav = ROOT.querySelector('[data-deck-nav]');
  const dots = nav ? [...nav.querySelectorAll('[data-go]')] : [];
  let active = -1;

  function setActive(index) {
    if (index === active) return;
    active = index;
    deck.classList.toggle('has-active', index > -1);
    cards.forEach((card, i) => {
      const on = i === index;
      card.classList.toggle('is-active', on);
      triggers[i].setAttribute('aria-expanded', String(on));
      bodies[i].toggleAttribute('inert', !on);
      if (!on) resetTilt(card);
    });
    dots.forEach((d, i) => {
      d.classList.toggle('is-current', i === index);
      d.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  }

  /* ---------- Masaüstü: üzerine gelince aç + 3B eğim ---------- */

  let enterTimer = 0;
  let leaveTimer = 0;
  let pointerInside = false;

  cards.forEach((card, i) => {
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !desktop.matches) return;
      clearTimeout(leaveTimer);
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => setActive(i), active === -1 ? HOVER_INTENT_MS : HOVER_INTENT_MS * 1.5);
    });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !desktop.matches || reducedMotion.matches || i !== active) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--ry', `${(x - 0.5) * 6}deg`);
      card.style.setProperty('--rx', `${(0.5 - y) * 5}deg`);
      card.style.setProperty('--gx', `${x * 100}%`);
      card.style.setProperty('--gy', `${y * 100}%`);
      card.style.setProperty('--px', `${(0.5 - x) * 18}px`);
      card.style.setProperty('--py', `${(0.5 - y) * 12}px`);
    });
    card.addEventListener('pointerleave', () => resetTilt(card));
  });

  deck.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') pointerInside = true;
  });
  deck.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || !desktop.matches) return;
    pointerInside = false;
    clearTimeout(enterTimer);
    clearTimeout(leaveTimer);
    if (deck.contains(document.activeElement)) return;
    leaveTimer = setTimeout(() => setActive(-1), LEAVE_DELAY_MS);
  });

  /* ---------- Carousel (telefon, tablet): sonsuz dönen 3B kartlar ---------- */
  // Her kartın ortadaki karta göre konumu: -1 sol, 0 orta, 1 sağ, ±2 gizli (arkada).
  // Uçtan uca geçen kart önce gizli tarafa çekilir, sonra görünmeden diğer yana alınır;
  // böylece kartlar bir halka gibi döner, ekranı boydan boya kat etmez.

  const n = cards.length;
  const pos = cards.map((_, i) => i);
  let current = 0;
  let autoplayTimer = 0;
  let resumeTimer = 0;
  let deckVisible = true;

  const canonical = (i, cur) => {
    let d = (((i - cur) % n) + n) % n;
    if (d > n / 2) d -= n;
    return d; // n = 4 → -1, 0, 1, 2
  };

  function place(card, d, animate = true) {
    if (!animate) card.style.transition = 'none';
    card.style.setProperty('--d', d);
    card.style.setProperty('--ad', Math.abs(d));
    card.classList.toggle('is-hidden', Math.abs(d) >= 2);
    if (!animate) {
      void card.offsetWidth; // konumu uygula, sonra geçişi geri aç
      card.style.transition = '';
    }
  }

  function go(target) {
    current = ((target % n) + n) % n;
    cards.forEach((card, i) => {
      const from = pos[i];
      const to = canonical(i, current);
      if (to === 2 && from < 0) {
        // Sol taraftan çıkan kart: sola doğru kaybolur, sonra sağ arkaya alınır
        place(card, -2);
        setTimeout(() => { if (pos[i] === 2) place(card, 2, false); }, 750);
      } else if (to < 0 && from === 2) {
        // Sağ arkadaki kart sola gelecekse önce görünmeden sol arkaya taşınır
        place(card, -2, false);
        requestAnimationFrame(() => place(card, to));
      } else {
        place(card, to);
      }
      pos[i] = to;
    });
    setActive(current);
  }

  function canAutoplay() {
    return !desktop.matches && !reducedMotion.matches && deckVisible && !document.hidden;
  }

  function schedule() {
    clearTimeout(autoplayTimer);
    nav?.classList.remove('is-playing');
    if (!canAutoplay()) return;
    // Gösterge animasyonunu yeniden başlatmak için sınıfı bir kare sonra ekle
    requestAnimationFrame(() => nav?.classList.add('is-playing'));
    autoplayTimer = setTimeout(() => {
      go(current + 1);
      schedule();
    }, AUTOPLAY_MS);
  }

  function pauseForUser() {
    clearTimeout(autoplayTimer);
    clearTimeout(resumeTimer);
    nav?.classList.remove('is-playing');
    resumeTimer = setTimeout(schedule, RESUME_AFTER_MS);
  }

  // Kaydırma hareketi: yatayda sürükleyince önceki/sonraki kart; dikey sayfa kaydırması serbest
  let startX = 0;
  let startY = 0;
  let tracking = false;
  deck.addEventListener('pointerdown', (e) => {
    if (desktop.matches) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  }, { passive: true });
  deck.addEventListener('pointerup', (e) => {
    if (!tracking || desktop.matches) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      swiped = true;
      go(current + (dx < 0 ? 1 : -1));
      pauseForUser();
      setTimeout(() => (swiped = false), 50);
    }
  }, { passive: true });
  deck.addEventListener('pointercancel', () => (tracking = false));
  let swiped = false;

  new IntersectionObserver(([entry]) => {
    deckVisible = entry.isIntersecting;
    deckVisible ? schedule() : clearTimeout(autoplayTimer);
  }, { threshold: 0.4 }).observe(deck);

  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(autoplayTimer) : schedule()));

  dots.forEach((dot, i) =>
    dot.addEventListener('click', () => {
      go(i);
      pauseForUser();
    })
  );

  /* ---------- Dokunma, tıklama, klavye ---------- */

  triggers.forEach((trigger, i) => {
    // İlk dokunuş yalnızca kartı açar; yönlendirme "Mekanı Keşfet" bağlantısındadır.
    trigger.addEventListener('click', () => {
      clearTimeout(enterTimer);
      if (swiped) return;
      if (desktop.matches) setActive(i);
      else if (active !== i) { go(i); pauseForUser(); }
    });

    trigger.addEventListener('focus', () => {
      if (!trigger.matches(':focus-visible')) return;
      if (desktop.matches) setActive(i);
      else if (active !== i) go(i);
    });

    trigger.addEventListener('keydown', (e) => {
      let target = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = (i + 1) % triggers.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = (i - 1 + triggers.length) % triggers.length;
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End') target = triggers.length - 1;
      else if (e.key === 'Escape' && desktop.matches) { setActive(-1); return; }
      if (target > -1) {
        e.preventDefault();
        triggers[target].focus({ preventScroll: true });
        desktop.matches ? setActive(target) : go(target);
        if (!desktop.matches) pauseForUser();
      }
    });
  });

  deck.addEventListener('focusout', (e) => {
    if (deck.contains(e.relatedTarget)) return;
    if (desktop.matches && !pointerInside) setActive(-1);
  });

  /* ---------- Başlangıç ve düzen değişimi ---------- */

  function setupMode() {
    clearTimeout(autoplayTimer);
    active = -2; // zorla güncelle
    deck.classList.toggle('is-carousel', !desktop.matches);
    if (desktop.matches) {
      cards.forEach((c) => { c.style.removeProperty('--d'); c.style.removeProperty('--ad'); c.classList.remove('is-hidden'); });
      setActive(-1);
    } else {
      cards.forEach((c, i) => { pos[i] = canonical(i, 0); place(c, pos[i], false); });
      current = 0;
      setActive(0);
      schedule();
    }
  }
  desktop.addEventListener('change', setupMode);
  setupMode();

  if (!reducedMotion.matches) {
    deck.classList.add('is-intro');
    setTimeout(() => deck.classList.remove('is-intro'), desktop.matches ? 1400 : 2900);
  }
}

function resetTilt(card) {
  ['--rx', '--ry', '--px', '--py'].forEach((p) => card.style.removeProperty(p));
}

/* ------------------------------------------------------------------ */
/* Görünür olunca beliren öğeler + 1994 sayacı                         */
/* ------------------------------------------------------------------ */

function initReveal() {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  ROOT.classList.add('reveal-ready');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
  ROOT.querySelectorAll('[data-reveal]').forEach((el, i, all) => {
    // Aynı kapsayıcıdaki öğeler sırayla gelsin
    const siblings = [...el.parentElement.querySelectorAll(':scope > [data-reveal]')];
    el.style.setProperty('--d', `${siblings.indexOf(el) * 110}ms`);
    io.observe(el);
  });
}

function initCount(el) {
  if (reducedMotion.matches) return;
  const target = Number(el.dataset.count);
  const from = target - 60;
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / 1800, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = String(Math.round(from + (target - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { threshold: 0.5 });
  io.observe(el);
}

/* ------------------------------------------------------------------ */
/* Karolar: imleci izleyen ışık; telefon: hafif 3B eğim                 */
/* ------------------------------------------------------------------ */

function initSpotlights() {
  ROOT.querySelectorAll('[data-spot]').forEach((tile) => {
    tile.addEventListener('pointermove', (e) => {
      const r = tile.getBoundingClientRect();
      tile.style.setProperty('--mx', `${e.clientX - r.left}px`);
      tile.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  const scene = ROOT.querySelector('[data-phone]');
  const tile = scene?.closest('[data-spot]');
  if (!scene || !tile || reducedMotion.matches) return;
  const phone = scene.firstElementChild;
  tile.addEventListener('pointermove', (e) => {
    const r = tile.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    phone.style.setProperty('--ty', `${x * 24}deg`);
    phone.style.setProperty('--tx', `${-y * 16}deg`);
  });
  tile.addEventListener('pointerleave', () => {
    phone.style.removeProperty('--ty');
    phone.style.removeProperty('--tx');
  });
}

/* ------------------------------------------------------------------ */
/* CafeCadde Family amblemi: kaydırmaya ve imlece hafifçe tepki verir  */
/* ------------------------------------------------------------------ */

function initEmblem(section) {
  const emblem = section.querySelector('[data-emblem]');
  if (!emblem) return;
  let target = 0;
  let current = 0;
  let mx = 0;
  let my = 0;
  let tmx = 0;
  let tmy = 0;
  let running = false;

  // Tema bir üst öğeye overflow: hidden verdiyse position: sticky çalışmaz (ör. Salient'te <body>).
  // O durumda sahneyi kaydırmayla birlikte kendimiz taşırız.
  const stage = section.querySelector('.world__stage, .ccf-world__stage');
  const chapters = section.querySelector('.world__chapters, .ccf-world__chapters');
  let manual = false;
  for (let el = section.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    if (/(hidden|auto|scroll)/.test(getComputedStyle(el).overflowY)) { manual = true; break; }
  }
  if (manual && stage && chapters) {
    Object.assign(stage.style, { position: 'absolute', top: '0', left: '0', right: '0', willChange: 'transform' });
    chapters.style.marginTop = '0';
  }

  function read() {
    const r = section.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    target = total > 0 ? Math.min(Math.max(-r.top / total, 0), 1) : 0;
    if (manual) {
      const y = Math.min(Math.max(-r.top, 0), Math.max(total, 0));
      stage.style.transform = `translate3d(0, ${y}px, 0)`;
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    const k = reducedMotion.matches ? 1 : 0.1;
    current += (target - current) * k;
    mx += (tmx - mx) * 0.06;
    my += (tmy - my) * 0.06;
    emblem.style.setProperty('--p', current.toFixed(4));
    emblem.style.setProperty('--mx', mx.toFixed(3));
    emblem.style.setProperty('--my', my.toFixed(3));
    const settled = Math.abs(target - current) < 0.0005 && Math.abs(tmx - mx) < 0.002 && Math.abs(tmy - my) < 0.002;
    if (settled) { running = false; return; }
    requestAnimationFrame(tick);
  }

  window.addEventListener('scroll', read, { passive: true });
  window.addEventListener('resize', read);
  if (!reducedMotion.matches) {
    window.addEventListener('pointermove', (e) => {
      tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      tmy = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!running) { running = true; requestAnimationFrame(tick); }
    }, { passive: true });
  }
  read();
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* WordPress içinde: temanın içerik sütunundan taşıp ekranı tam kapla   */
/* ------------------------------------------------------------------ */

function fitToViewport() {
  const apply = () => {
    ROOT.style.marginLeft = '0px';
    ROOT.style.width = '';
    const left = ROOT.getBoundingClientRect().left;
    ROOT.style.width = `${document.documentElement.clientWidth}px`;
    ROOT.style.marginLeft = `${-left}px`;
  };
  apply();
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(apply);
  });
  window.addEventListener('load', apply);
}

if (EMBEDDED) fitToViewport();

// Açılış logosu animasyonu bitince katmanı kaldır
const intro = ROOT.querySelector('[data-intro]');
if (intro) setTimeout(() => intro.remove(), 2300);

const deck = ROOT.querySelector('[data-deck]');
if (deck) initDeck(deck);

initReveal();
ROOT.querySelectorAll('[data-count]').forEach(initCount);
initSpotlights();

const world = ROOT.querySelector('[data-world]');
if (world) initEmblem(world);
