"""Smoke-test the Copilot Plus relay with exactly what Raycast will send.

Reads base_url, the api key and the model list out of
~/.config/raycast/ai/providers.yaml, so the test exercises the real file. The
key is never printed, and any server text that echoes it is scrubbed before
display. For each model: one streamed /chat/completions call. Then one
tool-call probe on the first model, and an image probe on every model whose
`vision` ability is set to supported. Stdlib only, so run it as `python3 -I`.

Doc: Copilot-Everything/docs/RAYCAST_COPILOT_PLUS_PROVIDER.md
"""
import base64, json, re, struct, sys, urllib.error, urllib.request, zlib
from pathlib import Path

CFG = Path.home() / ".config/raycast/ai/providers.yaml"
PLACEHOLDER = "PASTE_COPILOT_PLUS_LICENSE_KEY_HERE"

text = CFG.read_text()
base = re.search(r"base_url:\s*(\S+)", text).group(1).rstrip("/")
key = re.search(r"api_keys:\s*\n\s+copilot-plus:\s*(\S+)", text).group(1).strip("'\"")
model_block = text[text.index("models:"):]
models = re.findall(r"^\s+- id:\s*(\S+)", model_block, re.M)
vision = [m for m in models if re.search(
    rf"- id:\s*{re.escape(m)}\n(?:(?!- id:).)*?vision:\s*\n\s+supported:\s*true", model_block, re.S)]

if key == PLACEHOLDER or len(key) < 8:
    sys.exit("providers.yaml still has the placeholder key — paste your license key first.")

def scrub(s):
    return s.replace(key, "<KEY>")

def post(body, stream=False, timeout=90):
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Accept": "text/event-stream" if stream else "application/json"},
        method="POST")
    return urllib.request.urlopen(req, timeout=timeout)

def red_png(n=16):
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * n for _ in range(n))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    return "data:image/png;base64," + base64.b64encode(png).decode()

def report(label, fn):
    try:
        status, detail = fn()
        print(f"  {'OK ' if status == 200 else 'BAD'} {label:32} {status}  {scrub(detail)[:70]!r}")
    except urllib.error.HTTPError as e:
        print(f"  BAD {label:32} {e.code}  {scrub(e.read().decode(errors='replace'))[:120]!r}")
    except Exception as e:
        print(f"  ERR {label:32} {type(e).__name__}: {scrub(str(e))[:120]}")

def chat_stream(model):
    body = {"model": model, "stream": True, "max_tokens": 400, "temperature": 0.2,
            "messages": [{"role": "system", "content": "Answer in one short line."},
                         {"role": "user", "content": "Reply with exactly the word: pong"}]}
    with post(body, stream=True) as r:
        out = []
        for line in r:
            line = line.decode(errors="replace").strip()
            if not line.startswith("data:") or line == "data: [DONE]":
                continue
            try:
                delta = json.loads(line[5:])["choices"][0].get("delta", {})
            except (ValueError, KeyError, IndexError):
                continue
            out.append(delta.get("content") or "")
        return r.status, "".join(out).strip() or "(no content deltas)"

def tool_probe(model):
    body = {"model": model, "max_tokens": 400,
            "tools": [{"type": "function", "function": {
                "name": "get_time", "description": "Returns the current time.",
                "parameters": {"type": "object", "properties": {}}}}],
            "messages": [{"role": "user", "content": "What time is it? Use the get_time tool."}]}
    with post(body) as r:
        msg = json.load(r)["choices"][0]["message"]
        calls = [c["function"]["name"] for c in (msg.get("tool_calls") or [])]
        return r.status, f"tool_calls={calls}" if calls else f"NO tool call: {msg.get('content')}"

def image_probe(model):
    body = {"model": model, "max_tokens": 400,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": "What single color fills this image? One word."},
                {"type": "image_url", "image_url": {"url": red_png()}}]}]}
    with post(body) as r:
        return r.status, json.load(r)["choices"][0]["message"].get("content") or "(empty)"

print(f"relay {base}  models={len(models)}  vision={vision}\n-- streaming chat")
for m in models:
    report(m, lambda m=m: chat_stream(m))
print("-- tool call")
report(models[0], lambda: tool_probe(models[0]))
print("-- image input")
for m in vision:
    report(m, lambda m=m: image_probe(m))
