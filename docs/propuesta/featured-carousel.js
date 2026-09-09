'use strict';
(() => {
  const section = document.querySelector('#destacados');
  const slides = [...section.querySelectorAll('.featured-slide')];
  if (slides.length < 2) return;
  const toggle = document.querySelector('#featured-toggle');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let playing = !reducedMotion.matches;
  let hovered = false;
  let visible = false;
  let timer;
  function canPlay() {
    return playing && visible && !hovered && !document.hidden && !document.querySelector('#home-content').hidden && !document.querySelector('dialog[open]');
  }
  function schedule() {
    clearTimeout(timer);
    if (canPlay()) timer = setTimeout(() => {
      if (canPlay()) show(current + 1);
      schedule();
    }, 7000);
  }
  function updateToggle() {
    const label = playing ? 'Pausar rotación automática' : 'Reanudar rotación automática';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.querySelector('use').setAttribute('href', `assets/icons.svg#player-${playing ? 'pause' : 'play'}`);
  }
  function show(index, manual = false) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.classList.toggle('is-active', active);
      slide.inert = !active;
      if (active) slide.removeAttribute('aria-hidden'); else slide.setAttribute('aria-hidden', 'true');
    });
    document.querySelector('#featured-position').textContent = `${current + 1} / ${slides.length}`;
    if (manual) document.querySelector('#featured-status').textContent = `Grupo ${current + 1} de ${slides.length}: seis productos destacados.`;
  }
  function manualStep(direction) {
    playing = false;
    updateToggle();
    show(current + direction, true);
    schedule();
  }
  document.querySelector('#featured-prev').addEventListener('click', () => manualStep(-1));
  document.querySelector('#featured-next').addEventListener('click', () => manualStep(1));
  toggle.addEventListener('click', () => { playing = !playing; updateToggle(); schedule(); });
  section.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
  section.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hovered = false; schedule(); } });
  section.addEventListener('focusin', event => {
    if (event.target !== toggle) { playing = false; updateToggle(); schedule(); }
  });
  section.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.target.closest('.featured-slide')) { playing = false; updateToggle(); schedule(); }
  });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { playing = false; updateToggle(); schedule(); } });
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }, {threshold:0}).observe(section);
  const observer = new MutationObserver(schedule);
  document.querySelectorAll('dialog, #home-content').forEach(element => observer.observe(element, {attributes:true,attributeFilter:['open','hidden']}));
  section.querySelector('.featured-controls').hidden = false;
  show(0);
  updateToggle();
  schedule();
})();
