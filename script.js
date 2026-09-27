import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/400-italic.css';
import '@fontsource-variable/manrope';

const HOVER_INTENT_MS = 80;   // imleç bu kadar durmadan panel açılmaz
const LEAVE_DELAY_MS = 160;   // alandan çıkınca eşit düzene dönüş gecikmesi

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// Yan yana düzen + gerçek fare: üzerine gelince aç. Diğer her durumda dokununca aç.
const hoverLayout = window.matchMedia('(min-width: 1024px) and (min-aspect-ratio: 5/4) and (hover: hover) and (pointer: fine)');
const rowLayout = window.matchMedia('(min-width: 1024px) and (min-aspect-ratio: 5/4)');

/* ------------------------------------------------------------------ */
/* Dört panel                                                          */
/* ------------------------------------------------------------------ */

function initStage(stage) {
  const panels = [...stage.querySelectorAll('[data-panel]')];
  const triggers = panels.map((p) => p.querySelector('[data-trigger]'));
  const bodies = panels.map((p) => p.querySelector('[data-body]'));
  let active = -1;
  let enterTimer = 0;
  let leaveTimer = 0;
  let pointerInside = false;

  function setActive(index) {
    if (index === active) return;
    active = index;
    stage.classList.toggle('has-active', index > -1);
    panels.forEach((panel, i) => {
      const on = i === index;
      panel.classList.toggle('is-active', on);
      triggers[i].setAttribute('aria-expanded', String(on));
      // Kapalı paneldeki bağlantı ne dokunuşla ne de Tab ile yakalanabilsin.
      bodies[i].toggleAttribute('inert', !on);
    });
  }

  setActive(-1);
  bodies.forEach((b) => b.setAttribute('inert', ''));

  // Fare: kısa bir niyet gecikmesiyle, böylece hızlı geçişlerde animasyonlar birikmez.
  panels.forEach((panel, i) => {
    panel.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !hoverLayout.matches) return;
      clearTimeout(leaveTimer);
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => setActive(i), active === -1 ? HOVER_INTENT_MS : HOVER_INTENT_MS * 1.5);
    });
  });

  stage.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') pointerInside = true;
  });
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || !hoverLayout.matches) return;
    pointerInside = false;
    clearTimeout(enterTimer);
    clearTimeout(leaveTimer);
    if (stage.contains(document.activeElement)) return; // klavye odağı içerideyse açık kalsın
    leaveTimer = setTimeout(() => setActive(-1), LEAVE_DELAY_MS);
  });

  // Dokunma ve tıklama: ilk dokunuş yalnızca paneli açar; yönlendirme bağlantıdadır.
  triggers.forEach((trigger, i) => {
    trigger.addEventListener('click', () => {
      clearTimeout(enterTimer);
      if (active !== i) setActive(i);
    });
  });

  // Klavye: odak paneli açar; oklarla paneller arasında gezilir.
  triggers.forEach((trigger, i) => {
    trigger.addEventListener('focus', () => {
      if (trigger.matches(':focus-visible')) setActive(i);
    });
    trigger.addEventListener('keydown', (e) => {
      const horizontal = rowLayout.matches;
      const next = horizontal ? 'ArrowRight' : 'ArrowDown';
      const prev = horizontal ? 'ArrowLeft' : 'ArrowUp';
      let target = -1;
      if (e.key === next) target = (i + 1) % triggers.length;
      else if (e.key === prev) target = (i - 1 + triggers.length) % triggers.length;
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End') target = triggers.length - 1;
      else if (e.key === 'Escape') {
        setActive(-1);
        return;
      }
      if (target > -1) {
        e.preventDefault();
        triggers[target].focus();
        setActive(target);
      }
    });
  });

  stage.addEventListener('focusout', (e) => {
    if (stage.contains(e.relatedTarget)) return;
    if (hoverLayout.matches && !pointerInside) setActive(-1);
  });

  // Yerleşim türü değişince (döndürme, pencere boyutu) temiz başla.
  rowLayout.addEventListener('change', () => setActive(-1));

  // Kısa açılış
  if (!reducedMotion.matches) {
    stage.classList.add('is-intro');
    setTimeout(() => stage.classList.remove('is-intro'), 1200);
  }
}

/* ------------------------------------------------------------------ */
/* Üst menü                                                            */
/* ------------------------------------------------------------------ */

function initNav(nav, stage) {
  const toggle = nav.querySelector('[data-menu-toggle]');
  const links = nav.querySelector('#site-menu');
  const label = toggle.querySelector('span');

  function setMenu(open) {
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    label.textContent = open ? label.dataset.labelClose : label.dataset.labelOpen;
  }

  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
  });

  // Paneller geride kalınca menü düz zemine geçer.
  new IntersectionObserver(
    ([entry]) => nav.classList.toggle('is-solid', !entry.isIntersecting),
    { rootMargin: `-${nav.offsetHeight}px 0px 0px 0px` }
  ).observe(stage);
}

/* ------------------------------------------------------------------ */
/* Rezervasyon                                                         */
/* ------------------------------------------------------------------ */

function initReservation(dialog) {
  const openers = document.querySelectorAll('[data-open-reservation]');
  const closer = dialog.querySelector('[data-close-reservation]');
  let opener = null;

  openers.forEach((btn) =>
    btn.addEventListener('click', () => {
      opener = btn;
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    })
  );

  closer.addEventListener('click', () => dialog.close());

  // Arka plana tıklayınca kapan
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    opener?.focus();
  });
}

const stage = document.querySelector('[data-stage]');
const nav = document.querySelector('[data-nav]');
const dialog = document.getElementById('rezervasyon');

if (stage) initStage(stage);
if (nav && stage) initNav(nav, stage);
if (dialog) initReservation(dialog);
