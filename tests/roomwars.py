"""Run from the repository root: python3 tests/roomwars.py
Use --focused for the two-phone display and countdown regressions.

Requires Python Playwright and Chromium. Uses system chromium if available,
otherwise Playwright's Chromium. Set CHROMIUM_PATH to override the executable.
All relay traffic is simulated in memory and browser network requests are blocked.
"""
import argparse
import asyncio
import json
import mimetypes
import os
import shutil
import time
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://audit.invalid"

# Adapted from the original Room Wars Codex browser simulation.
RELAY = r"""
window.relayStreams = [];
window.relayOnline = !window.startOffline;
Object.defineProperty(navigator, 'onLine', {get: () => relayOnline});
window.elapsedTestTime = 0;
const realDateNow = Date.now;
const realPerformanceNow = performance.now.bind(performance);
Date.now = () => realDateNow() + (window.clockSkew || 0) + elapsedTestTime;
performance.now = () => realPerformanceNow() + elapsedTestTime;
window.EventSource = class {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = [];
    relayStreams.push(this);
    setTimeout(async () => {
      if (this.readyState === 2 || !relayOnline) return;
      const {packets, time} = await readRelay(url);
      if (this.readyState === 2 || !relayOnline) return;
      this.readyState = 1;
      this.onopen?.({data: JSON.stringify({event: 'open', time})});
      for (const packet of packets) {
        if (this.readyState === 2) break;
        this.deliver(packet);
      }
    }, 0);
  }
  addEventListener(type, listener) {
    if (type === 'message') this.listeners.push(listener);
  }
  deliver(packet) {
    for (const listener of this.listeners)
      listener({data: JSON.stringify(packet)});
  }
  close() { this.readyState = 2; }
};
window.deliverRelay = (packet) => {
  if (!relayOnline) return;
  for (const stream of relayStreams)
    if (stream.readyState === 1) stream.deliver(packet);
};
window.WebSocket = class {
  constructor() { throw Error('Real WebSockets disabled in this test'); }
};
const fetchAsset = window.fetch;
window.fetch = async (url, options = {}) => {
  if (new URL(url, location.href).origin !== 'https://ntfy.sh')
    return fetchAsset(url, options);
  if (!relayOnline) throw Error('Simulated offline');
  if (options.method === 'POST') {
    await publishRelay(options.body);
    return new Response('{}');
  }
  const {packets} = await readRelay(url);
  return new Response(packets.map(packet => JSON.stringify(packet)).join('\n'));
};
"""


async def main(focused=False):
    packets, pages, page_errors, blocked = [], [], [], []
    pending = asyncio.Queue()
    elapsed = 0

    async def serve(route):
        url = urlsplit(route.request.url)
        path = (ROOT / url.path.lstrip("/")).resolve()
        if path.is_dir():
            path /= "index.html"
        if url.netloc == "audit.invalid" and path.is_relative_to(ROOT) and path.is_file():
            await route.fulfill(
                body=path.read_bytes(),
                content_type=mimetypes.guess_type(path)[0] or "application/octet-stream",
            )
        else:
            blocked.append(url.hostname)
            await route.abort()

    def read_relay(_, url):
        from urllib.parse import parse_qs

        since = parse_qs(urlsplit(url).query).get("since", ["all"])[0]
        start = next((i + 1 for i, p in enumerate(packets) if p["id"] == since), 0)
        return {"packets": packets[start:], "time": int(time.time()) + elapsed}

    def publish_relay(_, body):
        packet = {
            "event": "message", "id": str(len(packets) + 1),
            "time": int(time.time()) + elapsed, "message": body,
        }
        packets.append(packet)
        pending.put_nowait(packet)

    async def drain():
        while not pending.empty():
            packet = pending.get_nowait()
            await asyncio.gather(*(page.evaluate("deliverRelay", packet) for page in pages))

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_PATH") or shutil.which("chromium"),
        )
        try:
            async def phone(url, player, *, offline=False, skew=0):
                context = await browser.new_context(
                    viewport={"width": 390, "height": 844}, service_workers="block",
                )
                await context.route("**/*", serve)
                await context.add_init_script(
                    f"window.startOffline = {json.dumps(offline)}; window.clockSkew = {skew};\n" + RELAY
                )
                await context.expose_binding("readRelay", read_relay)
                await context.expose_binding("publishRelay", publish_relay)
                page = await context.new_page()
                page.set_default_timeout(10000)
                pages.append(page)
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                await page.goto(url)
                if player == 0:
                    await page.locator("#go").click()
                    await page.wait_for_function("roomHostActive() && S.names")
                await page.locator(f'[data-i="{player}"]').click()
                return page

            async def confirm(host, label):
                await host.get_by_role("dialog").get_by_role("button", name=label, exact=True).click()

            async def pick(host, room):
                await host.locator(f'[data-r="{room}"]').click()
                await host.wait_for_function("r => S.claims[r] === S.pick.order[S.pick.i]", arg=room)

            scores = {
                "tap": {str(i): 100 - i for i in range(10)},
                "react": {str(i): 100 + i for i in range(10)},
                "stop": {str(i): i / 10 for i in range(10)},
            }

            async def seed_scores(host):
                rows = [{"g": game, "p": int(p), "v": value}
                        for game, values in scores.items() for p, value in values.items()]
                await host.evaluate("rows => send({t: 'scores', rows})", rows)

            async def finish_picking(host):
                for room in range(4):
                    await pick(host, room)
                    await host.locator("#pn").click()
                    await host.wait_for_function("i => S.pick.i === i", arg=room + 1)
                await host.locator("#pe").click()
                await host.wait_for_function("S.roomResult?.complete && out.length === 0")
                await drain()

            async def display_regression():
                host = await phone(f"{ORIGIN}/roomwars/", 0)
                guest = await phone(await host.locator("#lk").input_value(), 1)
                await guest.wait_for_function("es?.readyState === 1")
                await seed_scores(host)
                await host.wait_for_function("out.length === 0")
                await drain()

                await host.locator("#rv").click()
                await host.wait_for_function("out.length === 0")
                await drain()
                await guest.get_by_role("button", name="View all scores").click()
                await host.locator("#hd").click()
                await host.wait_for_function("out.length === 0")
                await drain()
                await guest.wait_for_function("view === 'home' && !S.reveal")
                await host.locator("#rv").click()
                await host.wait_for_function("out.length === 0")
                await drain()
                await guest.get_by_role("button", name="View all scores").click()

                # A newer reveal also works when rankings are already marked as shown.
                await host.locator("#sb").click()
                await host.locator("#rv").click()
                await host.wait_for_function("out.length === 0")
                await drain()
                await guest.locator(".room-final").wait_for()

                await host.locator("#sb").click()
                await host.locator("#sp").click()
                await host.wait_for_function("out.length === 0")
                await drain()
                await guest.wait_for_function("view === 'picking'")
                await finish_picking(host)
                for page in (host, guest):
                    heading = page.get_by_role("heading", name="Rooms confirmed")
                    await heading.wait_for()
                    await page.wait_for_function(
                        "document.activeElement === document.querySelector('.room-result-title')"
                    )
                print("PASS: Rankings reopen on request and the completed summary takes focus.")

            async def countdown_regression(anchor_available):
                nonlocal elapsed
                host = await phone(f"{ORIGIN}/roomwars/", 0, offline=True, skew=240_000)
                guest = await phone(await host.locator("#lk").input_value(), 1, skew=-180_000)
                await guest.wait_for_function("!!relayClock")
                await seed_scores(host)
                await host.locator("#sp").click()
                await host.wait_for_function("S.pick && !relayClock && out.some(m => m.t === 'pick')")
                assert not packets, "The offline organiser must queue the start."
                elapsed = 70
                for page in (host, guest):
                    await page.evaluate("elapsedTestTime = 70000")
                assert 225_000 < await host.evaluate("left()") <= 230_000

                if anchor_available:
                    await host.evaluate(
                        """() => {
                            es.close();
                            relayOnline = true;
                            window.dispatchEvent(new Event('online'));
                        }"""
                    )
                    await host.wait_for_function("!!relayClock && out.length === 0")
                else:
                    # The POST can work even when the stream cannot supply a clock.
                    await host.evaluate("es.close(); relayOnline = true; post()")
                    await host.wait_for_function("out.length === 0")
                await drain()
                await guest.wait_for_function("view === 'picking'")

                pick_packets = [json.loads(p["message"]) for p in packets
                                if json.loads(p["message"])["t"] == "pick"]
                assert len(pick_packets) == 1, "Countdown recovery must use the queued publish."
                if anchor_available:
                    host_left, guest_left = await asyncio.gather(
                        host.evaluate("left()"), guest.evaluate("left()")
                    )
                    assert abs(host_left - guest_left) < 1500, (host_left, guest_left)
                    assert guest_left < 231_500
                    # An automatic wall-clock adjustment does not change either timer.
                    await guest.evaluate("window.clockSkew += 600000")
                    assert abs(await guest.evaluate("left()") - host_left) < 1500
                    print("PASS: The queued start preserves elapsed time on skewed phones.")
                else:
                    assert await guest.evaluate("left()") is None
                    assert "Countdown unavailable" in await guest.locator("#cs").inner_text()
                    await host.evaluate("connect()")
                    await host.wait_for_function("!!relayClock")
                    await pick(host, 0)
                    await host.wait_for_function("out.length === 0")
                    await drain()
                    await guest.wait_for_function("S.claims[0] === 0 && left() !== null")
                    host_left, guest_left = await asyncio.gather(
                        host.evaluate("left()"), guest.evaluate("left()")
                    )
                    assert abs(host_left - guest_left) < 1500, (host_left, guest_left)
                    assert guest_left < 231_500
                    print("PASS: Without a shared clock, the timer stays unavailable until the next synced room update.")

            if focused:
                for scenario in (display_regression, lambda: countdown_regression(True),
                                 lambda: countdown_regression(False)):
                    await scenario()
                    for page in pages:
                        await page.context.close()
                    pages.clear()
                    packets.clear()
                    elapsed = 0
                    assert pending.empty()
                assert not page_errors, page_errors
                assert not blocked, blocked
                return

            host = await phone(f"{ORIGIN}/roomwars/", 0)
            invite = await host.locator("#lk").input_value()
            for i in range(1, 10):
                await phone(invite, i)
            await drain()

            # Submit fixed game outcomes through the same result-saving path as gameplay.
            for i, page in enumerate(pages):
                await page.evaluate(
                    "rows => rows.forEach(([game, value]) => fin(game, value))",
                    [[game, values[str(i)]] for game, values in scores.items()],
                )
            await asyncio.gather(*(page.wait_for_function("out.length === 0") for page in pages))
            await drain()
            for page in pages:
                assert await page.evaluate("S.sc") == scores
                assert await page.evaluate("pairStandings().map(p => p.t)") == [57, 45, 33, 21, 9]
                assert await page.evaluate("order()") == [0, 1, 2, 3, 4]
            print("PASS: Ten phones agree on all 30 scores, pair points and initial rankings.", flush=True)

            await host.locator("#nx").click()
            await host.locator("#sp").click()
            await pick(host, 0)
            await host.wait_for_function("out.length === 0")
            await drain()
            lagger = pages[-1]
            stale_packets = [p for p in packets if json.loads(p["message"])["t"] in ("claim", "pick")]
            await lagger.evaluate("relayOnline = false; es.close()")

            await host.locator("#pc").click()
            await host.locator(".backup-import summary").click()
            await host.locator("#bc").fill("tap|0|0\ntap|1|0")
            await host.locator("#bb").click()
            await host.locator("#backup-confirm").click()
            await confirm(host, "Save correction")
            await confirm(host, "Cancel")
            await host.wait_for_function("pickReview && S.pick.paused")
            assert await host.evaluate("S.claims") == {"0": 0}
            assert await host.evaluate("[S.sc.tap[0], S.sc.tap[1]]") == [0, 0]
            assert await host.locator("[data-r]").count() == 0

            await host.reload()
            await host.wait_for_function("roomHostActive() && pickReview && S.pick.paused")
            assert await host.evaluate("S.claims") == {"0": 0}
            await host.locator("#sp").click()
            await confirm(host, "Reset room choices")
            await host.wait_for_function("S.pick && !pickReview && out.length === 0")
            assert await host.evaluate("S.claims") == {}
            assert await host.evaluate("S.pick.order") == [1, 0, 2, 3, 4]
            print("PASS: Correction pauses picking; declining reset preserves choices across reload.", flush=True)

            await drain()
            await lagger.evaluate("relayOnline = true; connect()")
            await lagger.wait_for_function("S.pick && S.pick.order[0] === 1 && !pickReview")
            # New relay IDs, including one new application ID, distinguish replay from a stale revision.
            for index, packet in enumerate(reversed(stale_packets)):
                duplicate = dict(packet, id=f"duplicate-{index}")
                stale = dict(json.loads(packet["message"]), mid=f"delayed-{index}")
                await lagger.evaluate("deliverRelay", duplicate)
                await lagger.evaluate("deliverRelay", dict(packet, id=f"late-{index}", message=json.dumps(stale)))
            assert await lagger.evaluate("S.claims") == {}
            assert await lagger.evaluate("S.pick.order") == [1, 0, 2, 3, 4]
            await lagger.reload()
            await lagger.wait_for_function("S.pick && S.pick.order[0] === 1")
            assert await lagger.evaluate("S.claims") == {}
            print("PASS: Reconnect and reload recover the reset; duplicate and stale messages cannot undo it.", flush=True)

            await finish_picking(host)
            scores["tap"].update({"0": 0, "1": 0})
            for page in pages:
                await page.wait_for_function("S.roomResult?.complete")
                assert await page.evaluate("S.sc") == scores
                assert await page.evaluate("pairStandings().map(p => p.t)") == [49, 42, 37, 25, 13]
                assert await page.evaluate("S.roomResult.order") == [1, 0, 2, 3, 4]
                assert await page.evaluate("S.roomResult.claims") == {"0": 1, "1": 0, "2": 2, "3": 3, "4": 4}
            assert not page_errors, page_errors
            assert not blocked, blocked
            print("PASS: All ten phones agree on corrected scoring, rankings and all five room assignments.")
        finally:
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Room Wars browser simulation.")
    parser.add_argument("--focused", action="store_true", help="Run the display and countdown regressions.")
    asyncio.run(main(parser.parse_args().focused))
