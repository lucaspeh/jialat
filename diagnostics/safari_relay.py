"""Exercise game delivery with disposable browser sessions and isolated live ntfy topics."""
import contextlib
import functools
import http.server
import json
import os
from pathlib import Path
import platform
import secrets
import shutil
import subprocess
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.request

BEFORE = "87764449c235ecd692d287b641c8b001954da45e"
REWRITE = "e8062aa26107662ccf598f6b28640302f9189fd5"
PAGES = "https://lucaspeh.github.io/jialat"
LOCAL = platform.system() != "Darwin"

def wd(url, data=None, method=None):
    payload = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(url, data=payload, method=method, headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(request, timeout=50) as response:
            return json.load(response)["value"]
    except urllib.error.HTTPError as error:
        message = json.load(error)["value"]["message"]
        raise RuntimeError(f"WebDriver {error.code} {message[:240]}") from None

class Driver:
    def __init__(self, endpoint, capabilities):
        session = wd(endpoint + "/session", {"capabilities":{"alwaysMatch":capabilities}})
        self.url = endpoint + "/session/" + session["sessionId"]
        self.browser = session["capabilities"]["browserName"] + " " + session["capabilities"]["browserVersion"]
    def goto(self, url):
        wd(self.url + "/url", {"url":url})
    def js(self, script, *args):
        return wd(self.url + "/execute/sync", {"script":script, "args":list(args)})
    def close(self):
        wd(self.url, method="DELETE")

class LocalTab:
    def __init__(self, browser):
        self.context = browser.new_context()
        self.page = self.context.new_page()
        self.browser = "Chromium " + browser.version
    def goto(self, url):
        self.page.goto(url, wait_until="load", timeout=35000)
    def js(self, script, *args):
        return self.page.evaluate("args => (function(){" + script + "}).apply(null,args)", list(args))
    def close(self):
        self.context.close()

def until(tab, condition, label, timeout=22):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if tab.js("return !!(" + condition + ")"):
            return
        time.sleep(.25)
    state = tab.js("return {status:document.querySelector('#sync,#stat')?.textContent, traffic:window.JialatUI?.traffic(),hidden:document.hidden}")
    raise RuntimeError(f"{label}: {state}")

def visit(tab, url):
    # A new document also removes any earlier per-page test topic routing.
    tab.goto("about:blank")
    tab.goto(url)
    until(tab, "window.JialatUI && JialatUI.build==='26'", "game boot", 6)

def roomwars(host, guest, base):
    code = "qatest" + secrets.token_hex(12)
    path = base + "/roomwars/"
    visit(host, path)
    host.js("localStorage.setItem('rwh-'+arguments[0],'1'); localStorage.setItem('rwm-'+arguments[0],'0')", code)
    invite = path + "#" + code + "~d"
    visit(host, invite)
    visit(guest, invite)
    until(host, "roomHostActive() && on && document.querySelector('#ma')", "organiser open")
    until(guest, "on && document.querySelector('[data-i]')", "player open")
    guest.js("document.querySelector('[data-i=\"1\"]').click()")
    host.js("document.querySelector('#mg').value='tap'; document.querySelector('#mp').value='0'; document.querySelector('#mv').value='17'; document.querySelector('#ma').click()")
    until(guest, "S.sc.tap[0]===17 && document.querySelector('#app').innerText.includes('17')", "paired player received score")
    until(host, "out.length===0", "organiser queue acknowledged")
    visit(guest, invite)
    until(guest, "on && S.sc.tap[0]===17", "player kept score on reload")
    host.js("document.querySelector('#mv').value='19';document.querySelector('#ma').click()")
    until(guest, "S.sc.tap[0]===19", "player received correction after reload")

def scoreboard(host, tv, base):
    topic = "jialat-qa-board-" + secrets.token_hex(16)
    path = base + "/scoreboard/"
    for tab, role in [(tv,"tv"),(host,"host")]:
        visit(tab, path)
        tab.js("""
          if(ROLE) throw Error('Expected role chooser before network activity');
          const topic=arguments[0], role=arguments[1];
          const route=url=>{
            const u=new URL(url), parts=u.pathname.split('/');
            if(u.hostname!=='ntfy.sh'||parts[1]!==TOPIC)throw Error('Unexpected test destination');
            parts[1]=topic;u.pathname=parts.join('/');return u.href;
          };
          const original=window.relayFetch;
          window.relayFetch=(url,options)=>original(route(url),options);
          for(const key of ['EventSource','WebSocket']){
            const Native=window[key];
            window[key]=class extends Native{constructor(url,...args){super(route(url),...args)}};
          }
          enterRole(role);
        """, topic, role)
    until(host, "boardAuthorized && document.querySelector('#result0-0')", "TV grant")
    host.js("const el=document.querySelector('#result0-0');el.value='4.25';el.dispatchEvent(new Event('change',{bubbles:true}));")
    until(tv, "S.rs[0][0]===4.25", "TV received entered result")
    host.js("const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Show rules on TV');b.click()")
    until(tv, "S.m[0]==='rules' && document.querySelector('#msg h1')?.textContent==='Snow Blower'", "TV received screen selection")

def after18years(host, tv, base):
    alphabet = "abcdefghijklmnopqrstuvwxyz23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(8))
    assert code != 'jialat26'
    path = base + "/after18years/"
    visit(tv, path+"#tv="+code)
    visit(host, path+"#host="+code+"."+secrets.token_hex(8))
    until(host, "document.querySelector('#spin')?.disabled===false && document.querySelector('#sync')?.textContent==='TV connected'", "host and TV paired", 34)
    until(tv, "document.querySelector('#sync')?.textContent==='Connected to host'", "TV calibrated")
    host.js("document.querySelector('#spin').click()")
    key = "j18-v1-state-" + code
    until(host, f"JSON.parse(localStorage.getItem('{key}'))?.order?.length===1", "host saved draw")
    draw = host.js("const s=JSON.parse(localStorage.getItem(arguments[0]));return {id:s.draw.id,order:s.order,rev:s.rev}", key)
    until(tv, f"JSON.parse(localStorage.getItem('{key}'))?.draw?.id==={json.dumps(draw['id'])}", "TV adopted same draw")
    assert tv.js("const s=JSON.parse(localStorage.getItem(arguments[0]));return JSON.stringify(s.order)", key) == json.dumps(draw["order"],separators=(',',':'))

# A controlled comparison using the real ntfy service. Suppress only its initial
# metadata packet; native open, application messages and all other frames pass.
def opening_probe(tab, base, suppress):
    visit(tab, base + "/roomwars/")
    topic="jialat-qa-open-"+secrets.token_hex(16)
    tab.js("""
      const topic=arguments[0], suppress=arguments[1];
      const trace=window.probeTrace={native:0,metadata:0,callbacks:0,delivered:false,sent:0,kinds:[]};
      for(const key of ['EventSource','WebSocket']){
        const Native=window[key];
        window[key]=class extends Native{
          constructor(url,...args){
            super(url,...args);trace.kinds.push(key);
            this.addEventListener('open',e=>{if(typeof e.data!=='string')trace.native++});
            this.addEventListener(key==='EventSource'?'open':'message',e=>{
              if(typeof e.data==='string' && JSON.parse(e.data).event==='open'){
                trace.metadata++;if(suppress)e.stopImmediatePropagation();
              }
            });
          }
        };
      }
      const url='https://ntfy.sh/'+topic;
      const stream=window.probeStream=window.JialatUI.relayStream
        ? JialatUI.relayStream(url+'/sse',()=>0,()=>5000) : relayStream(url+'/sse');
      stream.onopen=()=>{trace.callbacks++;fetch(url+'?cache=no',{method:'POST',body:'relay-probe'}).then(r=>trace.sent=r.status)};
      stream.onmessage=e=>{let x=JSON.parse(e.data);if(x.event==='message'&&x.message==='relay-probe')trace.delivered=true};
    """,topic,suppress)
    end=time.monotonic()+18
    while time.monotonic()<end and not tab.js("return probeTrace.delivered"):
        time.sleep(.25)
    trace=tab.js("probeStream.close();return probeTrace")
    print("INITIAL METADATA", "suppressed" if suppress else "normal", json.dumps(trace), flush=True)
    return trace

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def main():
    with tempfile.TemporaryDirectory() as root, contextlib.ExitStack() as stack:
        root=Path(root)
        if LOCAL:
            from playwright.sync_api import sync_playwright
            runtime=stack.enter_context(sync_playwright())
            browser=runtime.chromium.launch(executable_path=shutil.which("chromium"),headless=True,proxy={"server":os.environ["HTTPS_PROXY"],"bypass":"localhost,127.0.0.1"})
            stack.callback(browser.close)
            clients=lambda:(LocalTab(browser),LocalTab(browser))
        else:
            chrome=shutil.which("chromedriver")
            if not chrome:
                raise RuntimeError("ChromeDriver peer is unavailable")
            proc=subprocess.Popen([chrome,"--port=9515"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            stack.callback(proc.terminate)
            for _ in range(30):
                try:
                    wd("http://127.0.0.1:9515/status")
                    break
                except OSError:
                    time.sleep(.3)
            def clients():
                safari=Driver("http://127.0.0.1:4444",{"browserName":"safari"})
                try:
                    chrome=Driver("http://127.0.0.1:9515",{"browserName":"chrome","goog:chromeOptions":{"args":["--headless=new","--disable-background-timer-throttling"]}})
                except Exception:
                    safari.close()
                    raise
                return safari,chrome

        versions=[("before",BEFORE),("rewrite",REWRITE),("published",None)]
        candidate=os.environ.get("RELAY_CANDIDATE")
        if candidate:
            versions=[("candidate",candidate)]
        if os.environ.get("RELAY_DEPLOYED_ONLY"):
            versions=[("published",None)]
        failures=0
        for tag,ref in versions:
            if ref or LOCAL:
                folder=root/tag
                folder.mkdir()
                if ref=="WORKTREE":
                    for path in ["assets","roomwars","scoreboard","after18years"]:
                        shutil.copytree(path,folder/path)
                elif ref:
                    with subprocess.Popen(["git","archive",ref],stdout=subprocess.PIPE) as p, tarfile.open(fileobj=p.stdout,mode="r|") as archive:
                        archive.extractall(folder,filter="data")
                else:
                    shutil.copytree(os.environ["PAGES_ARTIFACT"],folder,dirs_exist_ok=True)
                handler=functools.partial(QuietHandler,directory=folder)
                server=http.server.ThreadingHTTPServer(("127.0.0.1",0),handler)
                threading.Thread(target=server.serve_forever,daemon=True).start()
                stack.callback(server.server_close);stack.callback(server.shutdown)
                base="http://127.0.0.1:"+str(server.server_port)
            else:
                base=PAGES
            for i, action in enumerate([roomwars,scoreboard,after18years]):
                with contextlib.ExitStack() as sessions:
                    first,second=clients()
                    sessions.callback(first.close);sessions.callback(second.close)
                    host,guest=(second,first) if action==scoreboard else (first,second)
                    try:
                        action(host,guest,base)
                        print("PASS",tag,action.__name__,host.browser,"to",guest.browser,flush=True)
                    except Exception as error:
                        for client in [host,guest]:
                            try:
                                print("BROWSER",client.browser,client.js("return {s:document.querySelector('#sync,#stat')?.textContent, traffic:window.JialatUI?.traffic(),hidden:document.hidden}"),flush=True)
                            except Exception:
                                pass
                        failures+=1
                        print("FAIL",tag,action.__name__,str(error)[:520],flush=True)
            with contextlib.ExitStack() as sessions:
                primary,peer=clients();sessions.callback(primary.close);sessions.callback(peer.close)
                for suppress in [False,True]:
                    result=opening_probe(primary,base,suppress)
                    print("PROBE", tag, primary.browser, "suppressed" if suppress else "normal", result['delivered'],flush=True)
                    if not suppress and not result['delivered']: failures+=1
        if failures: raise SystemExit(f"{failures} game or control checks failed")

if __name__=="__main__":
    main()
