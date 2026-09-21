import { extractFile } from "@electron/asar";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const checks = [],
  failures = [];
const targets = [
  [
    "mac-arm64",
    "release/mac-arm64/p.e.t.app/Contents/Resources",
    "darwin-arm64",
  ],
  ["mac-x64", "release/mac/p.e.t.app/Contents/Resources", "darwin-x64"],
  ["win-x64", "release/win-unpacked/resources", "win32-x64"],
];
for (const [target, resources, native] of targets) {
  try {
    const asar = resolve(resources, "app.asar");
    for (const file of [
      "dist/main.cjs",
      "dist/preload.cjs",
      "dist/hook.cjs",
      "dist/renderer.js",
      "dist/index.html",
      "dist/style.css",
      "assets/default-1.png",
      "assets/default-2.png",
    ]) {
      if (!extractFile(asar, file).equals(await readFile(file)))
        throw Error(`${file} differs from current build`);
    }
    const nativeFile = join(
      resources,
      "app.asar.unpacked/node_modules/uiohook-napi/prebuilds",
      native,
      "uiohook-napi.node",
    );
    if (!(await stat(nativeFile)).isFile()) throw Error("Missing native hook");
    if (target.startsWith("mac")) {
      const helper = join(resources, "app.asar.unpacked/dist/permission-check");
      if (!((await stat(helper)).mode & 0o111))
        throw Error("Permission helper is not executable");
      if (
        !(await readFile(helper)).equals(
          await readFile("dist/permission-check"),
        )
      )
        throw Error("Permission helper differs");
    }
    checks.push(
      `${target}: bundled source/assets match latest build; expected unpacked native executable exists`,
    );
  } catch (error) {
    failures.push(`${target}: ${error.message}`);
  }
}
const artifacts = [];
for (const name of [
  "mac-arm64.zip",
  "mac-arm64.dmg",
  "mac-x64.zip",
  "mac-x64.dmg",
  "win-x64.exe",
]) {
  const path = `release/p.e.t-1.0.0-${name}`;
  try {
    const data = await readFile(path);
    if (data.length < 1_000_000) throw Error("Artifact unexpectedly small");
    artifacts.push({
      path,
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}
const result = {
  date: new Date().toISOString(),
  result: failures.length ? "FAIL" : "PASS",
  checks,
  failures,
  artifacts,
};
await writeFile(
  "evidence/artifact-integrity.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
