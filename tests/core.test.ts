import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaults,
  validateSettings,
  validatePatch,
  reorder,
  clampBounds,
} from "../src/model.ts";
import { Motion } from "../src/motion.ts";
import { Store } from "../src/store.ts";

test("strict settings and max five validated IDs", () => {
  assert.equal(defaults.keyboard, true);
  assert.deepEqual(validateSettings(defaults), defaults);
  for (const patch of [
    { fps: 0 },
    { fps: 31 },
    { size: NaN },
    { keyboard: "yes" },
    { extra: 1 },
    { fps: 2.2 },
  ])
    assert.throws(() => validatePatch(patch));
  assert.throws(() =>
    validateSettings({
      ...defaults,
      images: Array(6).fill("a".repeat(32) + ".png"),
    }),
  );
  assert.throws(() =>
    validateSettings({ ...defaults, images: ["../secret.png"] }),
  );
  assert.throws(() =>
    validateSettings({
      ...defaults,
      images: ["a".repeat(32) + ".png", "a".repeat(32) + ".png"],
    }),
  );
  assert.deepEqual(reorder(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.throws(() => reorder(["a"], 0, 1));
});
test("each input immediately advances one frame and presses once without bouncing", () => {
  const m = new Motion();
  assert.equal(m.sample(0, 8, 2, false).frame, 0);
  m.trigger(0);
  const pressed = m.sample(0, 8, 2, false);
  assert.equal(pressed.frame, 1);
  assert.equal(pressed.y, 0);
  assert.ok(pressed.scaleY < 1);
  assert.ok(m.sample(60, 8, 2, false).scaleY > pressed.scaleY);
  assert.deepEqual(m.sample(125, 8, 2, false), {
    frame: 1,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    active: false,
  });
  assert.equal(m.sample(1000, 8, 2, false).frame, 1);
  m.trigger(1100);
  assert.equal(m.sample(1100, 8, 2, false).frame, 0);
  assert.equal(m.sample(1100, 8, 2, true).scaleY, 1);
  m.stop();
  assert.equal(m.sample(1110, 8, 2, false).active, false);
});
test("bounds fit even small or negative-coordinate displays", () => {
  assert.deepEqual(
    clampBounds(
      { x: -999, y: 999, width: 200, height: 180 },
      { x: -500, y: 0, width: 400, height: 300 },
    ),
    { x: -500, y: 120, width: 200, height: 180 },
  );
});
test("queued writes preserve updates, persist on relaunch, reject corrupt input without replacement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pitter-unit-"));
  try {
    const store = new Store(dir);
    await store.load();
    await Promise.all([
      store.update((s) => ({ ...s, fps: 12 })),
      store.update((s) => ({ ...s, size: 180 })),
      store.update((s) => ({ ...s, keyboard: false })),
    ]);
    const next = new Store(dir);
    await next.load();
    assert.equal(next.value.fps, 12);
    assert.equal(next.value.size, 180);
    assert.equal(next.value.keyboard, false);
    await assert.rejects(store.update((s) => ({ ...s, fps: 100 })));
    await store.update((s) => ({ ...s, fps: 5 }));
    assert.equal(store.value.fps, 5);
    assert.equal(
      JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).fps,
      5,
    );
    await writeFile(join(dir, "settings.json"), "{broken");
    const corrupt = new Store(dir);
    await corrupt.load();
    assert.ok(corrupt.warning);
    assert.equal(corrupt.value.fps, 8);
    assert.equal(await readFile(join(dir, "settings.json"), "utf8"), "{broken");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("five distinct frames are accepted; sixth is rejected; no clamping at trust boundary", () => {
  const ids = Array.from(
    { length: 6 },
    (_, i) => i.toString(16).padStart(32, "0") + ".png",
  );
  assert.equal(
    validateSettings({ ...defaults, images: ids.slice(0, 5) }).images.length,
    5,
  );
  assert.throws(() => validateSettings({ ...defaults, images: ids }));
  for (const size of [79, 281, Infinity, "160"])
    assert.throws(() => validatePatch({ size }));
});
test("rapid input advances once per trigger; one-frame presses stay grounded", () => {
  const m = new Motion();
  m.trigger(100);
  for (let now = 110; now < 3000; now += 10) {
    m.trigger(now);
    const s = m.sample(now, 30, 1, false);
    assert.ok(s.active);
    assert.equal(s.frame, 0);
    assert.equal(s.y, 0);
    assert.ok(s.scaleX <= 1.06);
    assert.ok(s.scaleY >= 0.88 && s.scaleY < 1);
  }
  assert.equal(m.sample(4500, 30, 1, false).active, false);
  const f = new Motion();
  f.trigger(0);
  f.trigger(249);
  assert.equal(f.sample(250, 4, 5, false).frame, 2);
});
test("atomic write failure retains last committed settings and queue recovers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pitter-unit-"));
  try {
    const store = new Store(dir);
    await store.load();
    await store.update((s) => ({ ...s, fps: 9 }));
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "settings.json.tmp"));
    await assert.rejects(store.update((s) => ({ ...s, fps: 10 })));
    assert.equal(store.value.fps, 9);
    assert.equal(
      JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).fps,
      9,
    );
    await rm(join(dir, "settings.json.tmp"), { recursive: true });
    await store.update((s) => ({ ...s, fps: 11 }));
    assert.equal(store.value.fps, 11);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
