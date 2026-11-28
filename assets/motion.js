/* Local presentation cues. Callers own game state, audio and timing. */
(function () {
  'use strict';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.2,.75,.25,1)';
  const settle = 'cubic-bezier(.18,.8,.28,1.15)';
  const active = new Map();
  const bursts = new Map();
  const presses = new Map();
  const controls = 'button:enabled, summary, a.button, a.action, a.back-menu, a.day-tab, a.destination-card, .site-utility a[href]';
  const rest = {transform:'none'};
  const compression = {transform:'translateY(3px) scale(.955)'};
  const cues = {
    enter: [{opacity:.78, transform:'translateX(-18px)'}, {opacity:1, transform:'none'}, 320, ease],
    day: [{opacity:.75, transform:'translateX(12px)'}, {opacity:1, transform:'none'}, 300, ease],
    slide: [rest, rest, 470, ease],
    rebound: [compression, rest, 245, ease, [
      {...compression, boxShadow:'inset 0 0 0 2px #ffe6a4, 0 0 12px #e5aa3c70'},
      {...compression, boxShadow:'inset 0 0 0 2px #ffe6a4, 0 0 12px #e5aa3c70', offset:.15},
      {transform:'translateY(-1px) scale(1.025)', offset:.62},
      rest
    ]],
    tap: [{transform:'scale(1.10)'}, rest, 150, ease],
    pad: [{opacity:.88, transform:'scale(.985)'}, {opacity:0, transform:'scale(1)'}, 130, ease],
    signal: [{transform:'scale(1.18)'}, rest, 240, settle],
    reject: [{transform:'translateX(-8px)'}, rest, 240, ease],
    score: [{transform:'scale(1.18)', color:'#fff1c8', textShadow:'0 0 12px #ffd263'}, rest, 390, settle],
    count: [{transform:'scale(1.15)'}, rest, 310, settle],
    reveal: [{opacity:.72, transform:'translateY(10px) scale(.86,1.12)'}, {opacity:1, transform:'none'}, 540, settle],
    finale: [{opacity:.52, transform:'translateY(24px) scale(.82,1.13)'}, {opacity:1, transform:'none'}, 740, settle],
    rim: [{boxShadow:'inset 0 0 0 2px #ffe7a6, 0 0 14px #e6a74688'}, {boxShadow:'none'}, 520, ease]
  };

  function enabled() {
    return !preference.matches && !document.hidden;
  }

  function play(node, cue, options = {}) {
    if (!node || !enabled() || typeof node.animate !== 'function') return;
    const [from, to, duration, easing, sequence] = cues[cue];
    const previous = active.get(node);
    if (previous && options.coalesce && previous.playState !== 'finished') return;
    if (previous) previous.cancel();
    const frames = options.from ? [options.from, to] : sequence || [from, to];
    const animation = node.animate(frames, {duration, easing, delay:options.delay || 0, fill:'backwards'});
    active.set(node, animation);
    const release = () => { if (active.get(node) === animation) active.delete(node); };
    animation.onfinish = release;
    animation.oncancel = release;
  }

  function pressTarget(target) {
    const node = target instanceof Element ? target.closest(controls) : null;
    return node && !node.matches('[aria-disabled="true"]') ? node : null;
  }

  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    const node = pressTarget(event.target);
    if (!node) return;
    active.get(node)?.cancel();
    presses.set(event.pointerId, node);
    node.setAttribute('data-arcade-press', '');
  }, true);

  function releasePress(event) {
    const node = presses.get(event.pointerId);
    if (!node) return;
    presses.delete(event.pointerId);
    node.removeAttribute('data-arcade-press');
    if (event.type === 'pointerup' && node.contains(document.elementFromPoint(event.clientX, event.clientY))) play(node, 'rebound');
  }

  document.addEventListener('pointerup', releasePress, true);
  document.addEventListener('pointercancel', releasePress, true);
  document.addEventListener('click', event => {
    if (event.detail === 0) play(pressTarget(event.target), 'rebound');
  }, true);
  window.addEventListener('blur', () => {
    presses.forEach(node => node.removeAttribute('data-arcade-press'));
    presses.clear();
  });

  function clearBurst(surface) {
    const effect = bursts.get(surface);
    if (!effect) return;
    effect.layer.remove();
    clearTimeout(effect.timeout);
    bursts.delete(surface);
  }

  function burst(surface, style) {
    if (!surface || !enabled()) return;
    clearBurst(surface);
    const layer = document.createElement('div');
    layer.className = 'motion-burst motion-burst-' + style;
    layer.setAttribute('aria-hidden', 'true');
    const count = style === 'grand' ? 40 : style === 'room' ? 26 : 20;
    for (let i = 0; i < count; i++) {
      const speck = document.createElement('i');
      const direction = i % 2 ? -1 : 1;
      const spread = 8 + Math.random() * 36;
      speck.style.setProperty('--travel-x', direction * spread + 'vw');
      speck.style.setProperty('--lift', -(10 + Math.random() * 28) + 'vh');
      speck.style.setProperty('--drop', (15 + Math.random() * 37) + 'vh');
      speck.style.setProperty('--turn', direction * (60 + Math.random() * 250) + 'deg');
      speck.style.setProperty('--wait', (Math.random() * 220).toFixed(0) + 'ms');
      speck.style.setProperty('--flight', (950 + Math.random() * 820).toFixed(0) + 'ms');
      layer.appendChild(speck);
    }
    surface.appendChild(layer);
    bursts.set(surface, {layer, timeout:setTimeout(() => clearBurst(surface), 2100)});
  }

  function stop() {
    active.forEach(animation => animation.cancel());
    active.clear();
    bursts.forEach((_, surface) => clearBurst(surface));
  }

  if (preference.addEventListener) preference.addEventListener('change', () => { if (preference.matches) stop(); });
  else preference.addListener(() => { if (preference.matches) stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.JialatMotion = {enabled, play, burst, clearBurst};
}());
