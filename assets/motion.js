/* Local presentation cues. Callers own game state, audio and timing. */
(function () {
  'use strict';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.2,.75,.25,1)';
  const settle = 'cubic-bezier(.18,.8,.28,1.15)';
  const active = new Map();
  const bursts = new Map();
  const cues = {
    enter: [{opacity:.72, transform:'translateY(8px)'}, {opacity:1, transform:'none'}, 260, ease],
    day: [{opacity:.75, transform:'translateX(12px)'}, {opacity:1, transform:'none'}, 300, ease],
    tap: [{transform:'scale(1.085)'}, {transform:'none'}, 145, ease],
    signal: [{transform:'scale(1.04)'}, {transform:'none'}, 190, ease],
    reject: [{transform:'translateX(3px)'}, {transform:'none'}, 180, ease],
    score: [{opacity:.82, transform:'translateY(4px) scale(1.06)'}, {opacity:1, transform:'none'}, 280, settle],
    count: [{opacity:.9, transform:'scale(1.065)'}, {opacity:1, transform:'none'}, 330, settle],
    reveal: [{opacity:.68, transform:'translateY(12px) scale(.96)'}, {opacity:1, transform:'none'}, 560, settle],
    finale: [{opacity:.6, transform:'translateY(20px) scale(.92)'}, {opacity:1, transform:'none'}, 760, settle],
    pointer: [{transform:'rotate(-8deg)'}, {transform:'none'}, 180, settle]
  };

  function enabled() {
    return !preference.matches && !document.hidden;
  }

  function play(node, cue, options = {}) {
    if (!node || !enabled() || typeof node.animate !== 'function') return;
    const [from, to, duration, easing] = cues[cue];
    const previous = active.get(node);
    if (previous) previous.cancel();
    const frames = options.from ? [options.from, to] : [from, to];
    const animation = node.animate(frames, {duration, easing, delay:options.delay || 0, fill:'backwards'});
    active.set(node, animation);
    const release = () => { if (active.get(node) === animation) active.delete(node); };
    animation.onfinish = release;
    animation.oncancel = release;
  }

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
    const count = style === 'grand' ? 36 : style === 'stage' ? 24 : 16;
    for (let i = 0; i < count; i++) {
      const speck = document.createElement('i');
      const direction = i % 2 ? -1 : 1;
      const spread = 12 + Math.random() * 32;
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
