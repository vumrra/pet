import { uIOhook } from "uiohook-napi";
// Native callbacks intentionally never receive/inspect keyboard event objects.
const port = (
  process as unknown as { parentPort: { postMessage: (m: string) => void } }
).parentPort;
let last = 0;
const pulse = () => {
  const now = Date.now();
  if (now - last >= 24) {
    last = now;
    port.postMessage("activity");
  }
};
// OS key repeat supplies activity; a missed keyup must never keep the pet moving.
uIOhook.on("keydown", pulse);
try {
  uIOhook.start();
  port.postMessage("ready");
} catch {
  port.postMessage("failed");
  process.exit(1);
}
