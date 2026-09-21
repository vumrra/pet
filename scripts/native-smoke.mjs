import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const executablePath = process.env.PITTER_EXECUTABLE;
if (!executablePath) throw new Error("PITTER_EXECUTABLE is required.");
const profile = await mkdtemp(join(tmpdir(), "pitter-e2e-"));
const env = { ...process.env, PITTER_TEST_MODE: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let application;
const report = {
  executablePath,
  permissionChanges: false,
  keyContentRecorded: false,
};
try {
  application = await electron.launch({
    executablePath,
    args: [`--pitter-test-profile=${profile}`],
    env,
  });
  const pet = await application.firstWindow();
  await pet.waitForFunction(
    () => document.querySelector("#sprite")?.naturalWidth > 0,
  );
  const opened = application.waitForEvent("window");
  await pet.locator("#sprite").click({ button: "right" });
  const settings = await opened;
  await settings.waitForSelector("#keyboard");
  assert.equal(await settings.locator("#keyboard").isChecked(), true);
  report.rightClickSettings = true;

  const appPath = await application.evaluate(({ app }) => app.getAppPath());
  const nativeModule = join(appPath, "node_modules/uiohook-napi");
  const probePath = join(profile, "native-import.cjs");
  await writeFile(
    probePath,
    `try { const { uIOhook } = require(${JSON.stringify(nativeModule)}); process.parentPort.postMessage({ loaded: typeof uIOhook.start === 'function' }); } catch (e) { process.parentPort.postMessage({ error: e.message }); } setTimeout(() => process.exit(0), 50);`,
  );
  report.nativeModule = await application.evaluate(
    ({ utilityProcess }, file) =>
      new Promise((resolve, reject) => {
        const child = utilityProcess.fork(file, [], {
          stdio: "ignore",
          serviceName: "p.e.t package verification",
        });
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Native import probe timed out"));
        }, 5000);
        child.once("message", (value) => {
          clearTimeout(timer);
          resolve(value);
        });
        child.once("exit", (code) => {
          if (code !== 0) {
            clearTimeout(timer);
            reject(new Error(`Native probe exit ${code}`));
          }
        });
      }),
    probePath,
  );
  assert.equal(
    report.nativeModule.loaded,
    true,
    JSON.stringify(report.nativeModule),
  );

  report.permissionPreflight = await application.evaluate(
    ({ app, systemPreferences }) => {
      const { spawnSync } = process.getBuiltinModule("node:child_process");
      const { existsSync } = process.getBuiltinModule("node:fs");
      const { join } = process.getBuiltinModule("node:path");
      const helper = join(
        process.resourcesPath,
        "app.asar.unpacked/dist/permission-check",
      );
      const result = spawnSync(helper, [], { timeout: 3000, stdio: "ignore" });
      return {
        packaged: app.isPackaged,
        helperExists: existsSync(helper),
        helperExit: result.status,
        error: result.error?.code ?? null,
        accessibility: systemPreferences.isTrustedAccessibilityClient(false),
      };
    },
  );
  assert.equal(report.permissionPreflight.packaged, true);
  assert.equal(report.permissionPreflight.helperExists, true);
  assert.equal(report.permissionPreflight.error, null);
  assert.ok([0, 1].includes(report.permissionPreflight.helperExit));
  if (
    report.permissionPreflight.accessibility &&
    report.permissionPreflight.helperExit === 0
  ) {
    report.nativeHook = await application.evaluate(
      ({ utilityProcess }, file) =>
        new Promise((resolve) => {
          const { spawn } = process.getBuiltinModule("node:child_process");
          const { createInterface } = process.getBuiltinModule("node:readline");
          const { join } = process.getBuiltinModule("node:path");
          const child =
            process.platform === "darwin"
              ? spawn(
                  join(
                    process.resourcesPath,
                    "app.asar.unpacked/dist/permission-check",
                  ),
                  ["--listen"],
                  { stdio: ["pipe", "pipe", "ignore"] },
                )
              : utilityProcess.fork(file, [], {
                  stdio: "ignore",
                  serviceName: "p.e.t bounded keyboard verification",
                });
          if (process.platform === "darwin") {
            const lines = createInterface({ input: child.stdout });
            lines.on("line", (line) => child.emit("message", line));
            child.once("exit", () => lines.close());
          }
          let ready = false,
            activitySignals = 0;
          const timer = setTimeout(() => {
            child.kill();
            resolve({ ready, activitySignals });
          }, 1200);
          child.on("message", (message) => {
            if (message === "ready") ready = true;
            else if (message === "activity") activitySignals += 1;
          });
          child.once("exit", (code) => {
            clearTimeout(timer);
            resolve({ ready, activitySignals, exit: code });
          });
        }),
      join(appPath, "dist/hook.cjs"),
    );
    assert.equal(report.nativeHook.ready, true);
  } else {
    report.nativeHook = {
      skipped:
        "User permission required. No permission request or setting change performed.",
    };
  }
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  if (application) await application.close();
  await mkdir("evidence", { recursive: true });
  await writeFile(
    resolve("evidence/native-package-report.json"),
    JSON.stringify(report, null, 2),
  );
  await rm(profile, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}
