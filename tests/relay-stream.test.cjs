const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../assets/reliability.js'), 'utf8');

function fixture(t, cooldown = () => 0) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    hidden: false, body: { dataset: {} }, getElementById: () => null
  });
  const opened = [];
  class Transport extends EventTarget {
    constructor(url) { super(); this.url = new URL(url); opened.push(this); }
    close() { this.closed = true; }
    packet(type, data) {
      const event = new MessageEvent(type, { data: JSON.stringify(data) });
      this['on' + type]?.(event);
      this.dispatchEvent(event);
    }
  }
  const storage = { getItem: () => null, setItem() {} };
  window.fetch = () => assert.fail('Monitoring a stream attempted an HTTP request');
  vm.runInNewContext(source, {
    window, document, localStorage: storage, sessionStorage: storage, crypto: globalThis.crypto,
    EventSource: Transport, WebSocket: Transport, URL, Date, setTimeout, clearTimeout
  });
  const stream = window.JialatUI.relayStream('https://ntfy.sh/example/sse?since=all', cooldown, () => 5000);
  t.after(() => stream.close());
  t.mock.timers.tick(0);
  return { stream, opened, document, tick: ms => t.mock.timers.tick(ms) };
}

test('native SSE open starts one handshake and a later ntfy open delivers the relay clock', t => {
  const { stream, opened, tick } = fixture(t);
  let handshakes = 0;
  const frames = [];
  stream.onopen = () => handshakes++;
  stream.onmessage = event => frames.push(JSON.parse(event.data));
  opened[0].onopen(new Event('open'));
  assert.equal(handshakes, 1);
  assert.equal(stream.readyState, 1);
  tick(8000);
  assert.equal(opened.length, 1);
  opened[0].packet('open', { event: 'open', time: 123 });
  opened[0].packet('message', { event: 'message', message: 'first update' });
  assert.deepEqual(frames, [{ event: 'open', time: 123 }, { event: 'message', message: 'first update' }]);
  assert.equal(handshakes, 1);
});

test('an unopened SSE falls back and WebSocket can start pairing before its first frame', t => {
  const { stream, opened, tick } = fixture(t);
  let handshakes = 0;
  stream.onopen = () => handshakes++;
  tick(8000);
  assert.equal(opened[1].url.href, 'wss://ntfy.sh/example/ws?since=all');
  opened[0].packet('open', { event: 'open' });
  assert.equal(handshakes, 0);
  opened[1].onopen(new Event('open'));
  assert.equal(handshakes, 1);
  tick(8000);
  assert.equal(opened.length, 2);
  opened[1].packet('message', { event: 'open' });
  opened[1].packet('message', { event: 'keepalive' });
  assert.equal(stream.readyState, 1);
  assert.equal(handshakes, 1);
});

test('a natively open transport that stays silent still times out', t => {
  const { opened, tick } = fixture(t);
  opened[0].onopen(new Event('open'));
  tick(100000);
  assert.ok(opened[0].closed);
  assert.equal(opened[1].url.protocol, 'wss:');
});

test('keepalives sustain a quiet stream and a silent stream resumes from durable state', t => {
  const { stream, opened, tick, document } = fixture(t);
  const sse = opened[0], received = [];
  stream.onmessage = e => received.push(JSON.parse(e.data).event);
  sse.packet('open', { event: 'open' });
  sse.packet('message', { event: 'message', id: 'saved', message: '{"t":"state"}' });
  sse.packet('message', { event: 'message', id: 'transient', message: '{"_jialat":"control"}' });
  for (let i = 0; i < 3; i++) {
    tick(45000);
    sse.packet('keepalive', { event: 'keepalive' });
  }
  assert.deepEqual(received, ['open', 'message', 'message']);
  assert.equal(opened.length, 1);
  document.hidden = true;
  tick(100000);
  assert.equal(opened.length, 1);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.ok(sse.closed);
  assert.equal(opened[1].url.searchParams.get('since'), 'saved');
  assert.equal(stream.readyState, 0);
});

test('a failed fallback waits for the relay cooldown and a closed page never retries', t => {
  let until = 0;
  const { stream, opened, tick } = fixture(t, () => Math.max(0, until - Date.now()));
  opened[0].onerror();
  until = Date.now() + 30000;
  opened[1].onerror();
  opened[1].onclose();
  assert.equal(stream.readyState, 2);
  tick(29999);
  assert.equal(opened.length, 2);
  tick(1);
  assert.equal(opened.length, 3);
  assert.equal(opened[2].url.pathname, '/example/sse');
  stream.close();
  tick(100000);
  assert.equal(opened.length, 3);
});
