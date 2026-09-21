import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";

test("missing keyup does not manufacture continuous keyboard activity", () => {
  const source = buildSync({
    entryPoints: ["src/hook.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["uiohook-napi"],
    write: false,
  }).outputFiles[0].text;
  const hook = Object.assign(new EventEmitter(), { start() {} });
  const messages: string[] = [];
  const timers: (() => void)[] = [];
  let now = 1000;
  runInNewContext(source, {
    require: () => ({ uIOhook: hook }),
    process: { parentPort: { postMessage: (m: string) => messages.push(m) } },
    Date: { now: () => now },
    setInterval: (fn: () => void) => timers.push(fn),
  });
  hook.emit("keydown");
  for (let i = 0; i < 20; i++) {
    now += 100;
    timers.forEach((fn) => fn());
  }
  assert.deepEqual(messages, ["ready", "activity"]);
  hook.emit("keydown");
  assert.deepEqual(messages, ["ready", "activity", "activity"]);
});
