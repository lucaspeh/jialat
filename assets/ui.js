/* Shared controls. Game state and relay traffic stay in their own pages. */
(function () {
  'use strict';
  var active = false;
  function confirmAction(options, action) {
    if (active) return;
    var dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function') {
      if (window.confirm(options.message)) action();
      return;
    }
    active = true;
    var previous = document.activeElement;
    var previousId = previous && previous.id;
    dialog.className = 'confirmation';
    dialog.setAttribute('aria-labelledby', 'confirmation-title');
    dialog.setAttribute('aria-describedby', 'confirmation-message');
    var title = document.createElement('h2');
    title.id = 'confirmation-title';
    title.textContent = options.title;
    var message = document.createElement('p');
    message.id = 'confirmation-message';
    message.textContent = options.message;
    var form = document.createElement('form');
    form.method = 'dialog';
    var cancel = document.createElement('button');
    cancel.value = 'cancel';
    cancel.textContent = 'Cancel';
    cancel.autofocus = true;
    var accept = document.createElement('button');
    accept.value = 'confirm';
    accept.textContent = options.label || 'Continue';
    accept.className = 'confirm-action';
    form.append(cancel, accept);
    dialog.append(title, message, form);
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var buttons = [cancel, accept];
      var current = buttons.indexOf(document.activeElement);
      event.preventDefault();
      buttons[current === 0 ? 1 : 0].focus();
    });
    dialog.addEventListener('close', function () {
      var confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      active = false;
      if (confirmed) action();
      var target = previous && previous.isConnected ? previous : previousId && document.getElementById(previousId);
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }, { once: true });
    document.body.appendChild(dialog);
    dialog.showModal();
    cancel.focus();
  }
  var announcements = Object.create(null);
  var bootReady = false;
  function status(node, text) {
    if (!node) return;
    if (node.textContent !== text) node.textContent = text;
    node.setAttribute('aria-live', 'off');
    var message = String(text).replace(/next check in \d+s/gi, 'waiting to reconnect');
    var key = node.id || 'connection';
    if (announcements[key] === message) return;
    announcements[key] = message;
    var announcer = document.getElementById('connection-announcement');
    if (!announcer) {
      announcer = document.createElement('p');
      announcer.id = 'connection-announcement';
      announcer.className = 'sr-only';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      document.body.appendChild(announcer);
    }
    announcer.textContent = message;
  }
  function arena(node, label, action) {
    if (!node) return;
    var lastKey = -1000;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', label);
    node.onpointerdown = action;
    node.onkeydown = function (event) {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (event.repeat) return;
      lastKey = performance.now();
      action(event);
    };
    node.onclick = function (event) {
      if (event.detail === 0 && performance.now() - lastKey > 300) action(event);
    };
    node.focus({ preventScroll: true });
  }
  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }
  function updateFullscreen() {
    document.querySelectorAll('[data-fullscreen]').forEach(function (button) {
      button.textContent = fullscreenElement() ? 'Exit full screen' : 'Full screen';
      button.removeAttribute('aria-pressed');
    });
  }
  function bind(root) {
    (root || document).querySelectorAll('[data-fullscreen]').forEach(function (button) {
      var target = document.documentElement;
      var request = target.requestFullscreen || target.webkitRequestFullscreen;
      button.hidden = !request;
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', async function () {
        try {
          if (fullscreenElement()) {
            var leave = document.exitFullscreen || document.webkitExitFullscreen;
            if (leave) await leave.call(document);
          } else if (request) await request.call(target);
          updateFullscreen();
        } catch (error) {
          var note = button.parentElement.querySelector('[data-display-note]');
          if (note) note.textContent = 'Use your browser’s full-screen command for this display.';
        }
      });
    });
    updateFullscreen();
  }
  document.addEventListener('fullscreenchange', updateFullscreen);
  document.addEventListener('webkitfullscreenchange', updateFullscreen);
  var textProbe;
  function startTextSizing() {
    if (textProbe) return;
    textProbe = document.createElement('span');
    textProbe.className = 'text-size-probe';
    textProbe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(textProbe);
    var previous = 0;
    function measure() {
      var root = document.documentElement;
      var reference = parseFloat(getComputedStyle(root).getPropertyValue('--root-reference')) || 16;
      var scale = parseFloat(getComputedStyle(root).fontSize) / reference;
      if (Math.abs(scale - previous) < .001) return;
      previous = scale;
      root.style.setProperty('--display-text-scale', String(scale));
      root.classList.toggle('large-text', scale > 1.05);
    }
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(textProbe);
    else window.addEventListener('resize', measure);
  }
  function ready() {
    bootReady = true;
    startTextSizing();
    var boot = document.getElementById('site-boot');
    if (boot) boot.remove();
    bind(document);
  }
  function bootError() {
    if (bootReady) return;
    var title = document.getElementById('boot-title');
    var message = document.getElementById('boot-message');
    if (title) title.textContent = 'This page could not open';
    if (message) message.textContent = 'Reload to try again, or return to the main menu.';
  }
  window.addEventListener('error', bootError);
  window.JialatUI = { confirm: confirmAction, status: status, arena: arena, bind: bind, ready: ready };
}());
