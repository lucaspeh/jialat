/* Local host coordination and traffic accounting. No background network traffic. */
(function () {
  'use strict';
  var ui = window.JialatUI || {}, build = '26';
  var complete = ['ready', 'bind', 'status', 'arena'].every(function (key) { return typeof ui[key] === 'function'; });
  function token() {
    var bytes = new Uint8Array(8); crypto.getRandomValues(bytes);
    return Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
  }
  var deviceId;
  try {
    deviceId = localStorage.getItem('jialat-host-device');
    if (!/^[a-f0-9]{16}$/.test(deviceId || '')) { deviceId = token(); localStorage.setItem('jialat-host-device', deviceId); }
  } catch (error) { deviceId = token(); }
  var key = 'jialat-traffic-' + (document.body.dataset.page || 'page');
  var traffic = { build: build, since: Date.now(), postAttempts: 0, postOK: 0, failures: 0, limited: 0, polls: 0, allowanceChecks: 0, streamOpens: 0, streamCloses: 0 };
  try {
    var saved = JSON.parse(sessionStorage.getItem(key));
    if (saved && saved.build === build) Object.keys(traffic).forEach(function (name) { if (Number.isFinite(saved[name]) && saved[name] >= 0) traffic[name] = saved[name]; });
  } catch (error) {}
  function showTraffic() {
    var node = document.getElementById('relay-traffic');
    if (node) node.textContent = 'Build ' + build + ' · This tab: ' + traffic.postAttempts + ' publish attempts, ' + traffic.postOK + ' successful responses. Other devices count separately.';
  }
  function recordTraffic(name) {
    if (typeof traffic[name] !== 'number') return;
    traffic[name]++;
    try { sessionStorage.setItem(key, JSON.stringify(traffic)); } catch (error) {}
    showTraffic();
  }
  var nativeFetch = window.fetch.bind(window);
  async function relayFetch(url, options) {
    var publish = options && options.method === 'POST';
    recordTraffic(publish ? 'postAttempts' : String(url).indexOf('/v1/account') >= 0 ? 'allowanceChecks' : 'polls');
    try {
      var response = await nativeFetch(url, options);
      if (publish && response.ok) recordTraffic('postOK');
      if (!response.ok) recordTraffic(response.status === 429 ? 'limited' : 'failures');
      return response;
    } catch (error) { recordTraffic('failures'); throw error; }
  }
  function storageFailure(message) {
    if (document.getElementById('storage-save-warning')) return;
    var node = document.createElement('p'); node.id = 'storage-save-warning'; node.className = 'storage-save-warning'; node.setAttribute('role', 'alert');
    node.textContent = message || 'This browser cannot save your changes. Keep this page open until the results are secured.';
    document.body.prepend(node);
  }
  function hostGuard(scope, changed, options) {
    var alive = false, fallbackMode = false, unlock, timer, leaseKey = 'jialat-host-tab-' + scope, tab = token();
    var guard = { requesting: false, disposed: false, failClosed: !!(options && options.failClosed) };
    function update(value) { if (alive !== value) { alive = value; if (!guard.disposed && changed) changed(value); } }
    Object.defineProperty(guard, 'active', { get: function () {
      if (alive && fallbackMode) {
        try { var lease = JSON.parse(localStorage.getItem(leaseKey)); if (!lease || lease.tab !== tab || lease.until <= Date.now()) update(false); } catch (error) { update(false); }
      }
      return alive;
    } });
    function release() {
      clearInterval(timer); timer = null;
      if (unlock) { var done = unlock; unlock = null; done(); }
      try { var lease = JSON.parse(localStorage.getItem(leaseKey)); if (lease && lease.tab === tab) localStorage.removeItem(leaseKey); } catch (error) {}
      update(false);
    }
    function fallback() {
      fallbackMode = true;
      try {
        var lease = JSON.parse(localStorage.getItem(leaseKey));
        if (lease && lease.tab !== tab && lease.until > Date.now()) { update(false); return; }
        localStorage.setItem(leaseKey, JSON.stringify({ tab: tab, until: Date.now() + 45000 })); update(true);
        timer = setInterval(function () {
          if (!guard.active) { release(); return; }
          try { localStorage.setItem(leaseKey, JSON.stringify({ tab: tab, until: Date.now() + 45000 })); } catch (error) { release(); }
        }, 15000);
      } catch (error) { storageFailure(); fallbackMode = false; update(!(options && options.failClosed)); }
    }
    guard.acquire = function () {
      if (guard.disposed || guard.active || guard.requesting) return guard.ready || Promise.resolve(guard);
      guard.requesting = true;
      guard.ready = new Promise(function (resolve) {
        function finish() { guard.requesting = false; resolve(guard); }
        if (navigator.locks && navigator.locks.request) {
          navigator.locks.request('jialat-host-' + scope, { ifAvailable: true }, function (lock) {
            if (!lock || guard.disposed) { update(false); finish(); return; }
            update(true); finish(); return new Promise(function (done) { unlock = done; });
          }).catch(function () { if (!guard.disposed) fallback(); finish(); });
        } else { fallback(); finish(); }
      });
      return guard.ready;
    };
    function restore(event) { if (event.persisted) guard.acquire(); }
    window.addEventListener('pagehide', release); window.addEventListener('pageshow', restore);
    guard.dispose = function () { guard.disposed = true; release(); window.removeEventListener('pagehide', release); window.removeEventListener('pageshow', restore); };
    return guard;
  }
  ui.build = complete ? build : 'incomplete'; ui.deviceId = deviceId; ui.hostGuard = hostGuard;
  ui.relayFetch = relayFetch; ui.recordTraffic = recordTraffic; ui.showTraffic = showTraffic;
  ui.traffic = function () { return Object.assign({}, traffic); }; ui.storageFailure = storageFailure;
  if (complete) {
    var ready = ui.ready;
    ui.ready = function () {
      ready(); showTraffic();

    };
  }
  window.JialatUI = ui;
}());
