import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const browser = await chromium.connectOverCDP("http://127.0.0.1:19337");
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("view=pet"));
if (!page) throw new Error("Pet renderer not found");
await page.evaluate(() => {
  window.inputProbe = { activity: 0, changes: 0, samples: [] };
  window.inputProbeStop = window.pitter.subscribe((kind) => {
    if (kind === "activity") window.inputProbe.activity++;
  });
  window.inputProbeObserver = new MutationObserver(
    () => window.inputProbe.changes++,
  );
  window.inputProbeObserver.observe(document.querySelector("#sprite"), {
    attributes: true,
    attributeFilter: ["style", "src"],
  });
});
const pulse = () =>
  execFileSync("python3", [
    "-c",
    `import ctypes,time
c=ctypes.CDLL("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")
c.CGEventCreateKeyboardEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint16,ctypes.c_bool]
c.CGEventCreateKeyboardEvent.restype=ctypes.c_void_p
c.CGEventSetFlags.argtypes=[ctypes.c_void_p,ctypes.c_uint64]
c.CGEventPost.argtypes=[ctypes.c_uint32,ctypes.c_void_p]
c.CFRelease.argtypes=[ctypes.c_void_p]
for down in [True,False]:
 e=c.CGEventCreateKeyboardEvent(None,56,down)
 c.CGEventSetFlags(e,(1<<17) if down else 0)
 c.CGEventPost(0,e)
 c.CFRelease(e)
 time.sleep(.05)
`,
  ]);
const samples = [];
const foregroundApps = process.env.INPUT_SOAK_APPS?.split(",") ?? [];
try {
  for (let i = 0; i < 24; i++) {
    if (foregroundApps.length && i % 8 === 0) {
      execFileSync("open", [
        "-a",
        foregroundApps[(i / 8) % foregroundApps.length],
      ]);
      await new Promise((r) => setTimeout(r, 500));
    }
    const before = await page.evaluate(() => ({ ...window.inputProbe }));
    pulse();
    await new Promise((r) => setTimeout(r, 600));
    const after = await page.evaluate(async () => ({
      activity: window.inputProbe.activity,
      changes: window.inputProbe.changes,
      status: (await window.pitter.get()).status,
      visibility: document.visibilityState,
      transform: document.querySelector("#sprite").style.transform,
    }));
    const sample = {
      iteration: i,
      activity: after.activity - before.activity,
      changes: after.changes - before.changes,
      status: after.status,
      visibility: after.visibility,
    };
    samples.push(sample);
    console.log(sample);
    if (i === 7 || i === 15) await new Promise((r) => setTimeout(r, 15000));
    else await new Promise((r) => setTimeout(r, 800));
  }
} finally {
  await page.evaluate(() => {
    window.inputProbeStop();
    window.inputProbeObserver.disconnect();
  });
  await browser.close();
  await writeFile(
    "evidence/input-soak.json",
    JSON.stringify(
      {
        input:
          "synthetic OS Shift with explicit release flags; not physical typing",
        samples,
        foregroundApps,
      },
      null,
      2,
    ),
  );
}
if (samples.some((s) => !s.activity || !s.changes)) process.exitCode = 1;
