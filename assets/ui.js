/* Small shared controls. Game state and relay traffic stay in their own pages. */
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
  window.JialatUI = { confirm: confirmAction };
}());
