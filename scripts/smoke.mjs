import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const profile = await mkdtemp(join(tmpdir(), "pitter-e2e-"));
const evidence = resolve(process.env.PITTER_EVIDENCE_DIR || "evidence");
await mkdir(evidence, { recursive: true });
const report = {
  started: new Date().toISOString(),
  profile,
  executable: process.env.PITTER_EXECUTABLE || "development Electron",
  checks: [],
  consoleErrors: [],
  permissionMutation: false,
};
let app;
const check = (name) => {
  report.checks.push(name);
  console.log("PASS", name);
};
async function launch() {
  const env = { ...process.env, PITTER_TEST_MODE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.PITTER_EXECUTABLE;
  const args = executablePath
    ? [`--pitter-test-profile=${profile}`]
    : [resolve("."), `--pitter-test-profile=${profile}`];
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args,
    env,
    timeout: 20000,
  });
  assert.equal(await app.evaluate(({ app }) => app.getName()), "p.e.t");
  const pet = await app.firstWindow();
  pet.on("pageerror", (error) => report.consoleErrors.push(error.message));
  await pet.waitForFunction(
    () => window.pitter && document.querySelector("#sprite")?.naturalWidth > 0,
  );
  return pet;
}
async function openSettings(pet) {
  const opened = app.waitForEvent("window");
  await pet.evaluate(() => window.pitter.settings());
  const page = await opened;
  page.on("pageerror", (error) => report.consoleErrors.push(error.message));
  await page.waitForSelector("#add");
  assert.equal(await page.locator("h1").innerText(), "p.e.t");
  assert.equal(await page.title(), "p.e.t");
  await page.waitForFunction(
    () => document.querySelector("#sprite")?.naturalWidth > 0,
  );
  return page;
}
async function choose(paths) {
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, paths);
}
async function get(page) {
  return page.evaluate(() => window.pitter.get());
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!(await predicate())) {
    if (Date.now() > deadline)
      throw Error("Timed out waiting for persisted state");
    await new Promise((r) => setTimeout(r, 40));
  }
}
try {
  const pet = await launch();
  assert.equal((await app.windows()).length, 1);
  assert.equal((await get(pet)).status, "test");
  check("First launch: pet only; explicit temp profile; no native hook");
  const security = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0],
      p = w.webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      focusable: w.isFocusable(),
      top: w.isAlwaysOnTop(),
    };
  });
  assert.deepEqual(security, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    focusable: false,
    top: true,
  });
  assert.equal(await pet.evaluate(() => typeof window.require), "undefined");
  assert.ok(
    await pet.evaluate(() =>
      window.pitter.save({ fps: 3 }).then(
        () => false,
        () => true,
      ),
    ),
  );
  check("Sandbox/preload isolation; pet cannot invoke settings mutation");
  await pet.screenshot({
    path: join(evidence, "pet-idle.png"),
    omitBackground: true,
  });
  const idleFrame = await pet.locator("#sprite").getAttribute("src");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send(
      "pitter-event",
      "activity",
    ),
  );
  await pet.waitForFunction(() => {
    const matrix = new DOMMatrixReadOnly(
      document.querySelector("#sprite").style.transform,
    );
    return matrix.m42 === 0 && matrix.m22 < 1;
  });
  assert.notEqual(await pet.locator("#sprite").getAttribute("src"), idleFrame);
  await pet.screenshot({
    path: join(evidence, "pet-active.png"),
    omitBackground: true,
  });
  check("Anonymous activity signal animates the real pet window");
  const page = await openSettings(pet);
  await page.screenshot({
    path: join(evidence, "settings-default.png"),
    fullPage: true,
  });
  await page.locator("#simulate").click();
  await page.waitForFunction(() => {
    const matrix = new DOMMatrixReadOnly(
      document.querySelector("#sprite").style.transform,
    );
    return matrix.m42 === 0 && matrix.m22 < 1;
  });
  await page.screenshot({
    path: join(evidence, "settings-preview-active.png"),
    fullPage: true,
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#sprite").style.transform ===
      "translateY(0px) scale(1, 1)",
  );
  check("Preview animates without global permission and settles");
  const files = [];
  for (let i = 0; i < 6; i++) {
    const path = join(profile, `fixture-${i}.png`);
    await copyFile(resolve("assets", `default-${(i % 2) + 1}.png`), path);
    files.push(path);
  }
  const invalid = join(profile, "invalid.png");
  await writeFile(invalid, "not a png");
  await choose([invalid]);
  await page.locator("#add").click();
  await page
    .locator("#error")
    .filter({ hasText: "이미지를 읽을 수 없습니다" })
    .waitFor();
  assert.equal((await get(page)).settings.images.length, 0);
  await page.screenshot({
    path: join(evidence, "settings-import-error.png"),
    fullPage: true,
  });
  check("Invalid raster rejected by main; inline import error");
  await choose(files.slice(0, 2));
  await page.locator("#add").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".tile-actions").length === 2,
  );
  let state = await get(page);
  const originalIds = [...state.settings.images];
  assert.equal(originalIds.length, 2);
  await page
    .getByRole("button", { name: "1번 이미지 뒤로", exact: true })
    .click();
  await page.waitForFunction(
    (expected) => document.querySelector(".tile img")?.src === expected,
    state.frames[1],
  );
  assert.deepEqual((await get(page)).settings.images, [
    originalIds[1],
    originalIds[0],
  ]);
  check("Import copies decoded images; reorder persists actual IDs");
  await choose(files.slice(2, 5));
  await page.locator("#add").click();
  await page.waitForFunction(
    () => document.querySelector("#count").textContent === "5 / 5",
  );
  assert.ok(await page.locator("#add").isDisabled());
  await choose([files[5]]);
  assert.ok(
    await page.evaluate(() =>
      window.pitter.importImages().then(
        () => false,
        () => true,
      ),
    ),
  );
  await page.screenshot({
    path: join(evidence, "settings-five-images.png"),
    fullPage: true,
  });
  check("Five-image limit enforced in UI and main IPC");
  await page
    .getByRole("button", { name: "1번 이미지 삭제", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#count").textContent === "4 / 5",
  );
  const remaining = (await get(page)).settings.images;
  assert.equal(remaining[0], originalIds[0]);
  check("Delete updates order and stored files");
  assert.ok(
    await page.evaluate(() =>
      window.pitter.save({ fps: 31 }).then(
        () => false,
        () => true,
      ),
    ),
  );
  assert.ok(
    await page.evaluate(() =>
      window.pitter.save({ images: [] }).then(
        () => false,
        () => true,
      ),
    ),
  );
  assert.ok(
    await page.evaluate(() =>
      window.pitter.remove("../outside").then(
        () => false,
        () => true,
      ),
    ),
  );
  check("IPC rejects out-of-range, unknown settings and traversal IDs");
  await page.evaluate(() =>
    Promise.all([
      window.pitter.save({ fps: 12 }),
      window.pitter.save({ size: 200 }),
      window.pitter.save({ keyboard: false }),
    ]),
  );
  state = await get(page);
  assert.equal(state.settings.fps, 12);
  assert.equal(state.settings.size, 200);
  assert.equal(state.status, "off");
  await page.screenshot({
    path: join(evidence, "settings-off.png"),
    fullPage: true,
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("settings"))
      .setSize(420, 560),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator("#quit").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(evidence, "settings-minimum.png"),
    fullPage: true,
  });
  check(
    "420 px minimum width has no horizontal page overflow; footer reachable",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#simulate").click();
  await page.waitForTimeout(120);
  assert.equal(
    await page.locator("#sprite").evaluate((e) => e.style.transform),
    "translateY(0px) scale(1, 1)",
  );
  check("Reduced motion retains preview frame playback without bounce");
  // Screenshot-only states injected via the test driver's main-process context; no application test IPC or permission mutation.
  const actual = await get(page);
  for (const status of ["permission", "listening"]) {
    await app.evaluate(
      ({ BrowserWindow }, s) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("settings"))
          .webContents.send("pitter-event", "state", s),
      { ...actual, status, settings: { ...actual.settings, keyboard: true } },
    );
    await page.screenshot({
      path: join(evidence, `settings-${status}-simulated.png`),
      fullPage: true,
    });
  }
  await app.close();
  app = null;
  const relaunch = await launch();
  const restored = await get(relaunch);
  assert.deepEqual(restored.settings, state.settings);
  assert.equal(restored.status, "off");
  check("Settings and image order survive actual process relaunch");
  const second = await openSettings(relaunch);
  await second.locator("#defaults").click();
  await second.waitForFunction(
    () => document.querySelector("#count").textContent === "기본 2장",
  );
  assert.equal((await get(second)).settings.images.length, 0);
  check("Reset restores supplied default frames");
  assert.equal(report.consoleErrors.length, 0);
  check("No renderer page errors");
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = String(error.stack || error);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  await writeFile(
    join(evidence, "smoke-report.json"),
    JSON.stringify(report, null, 2),
  );
  await rm(profile, { recursive: true, force: true });
}
