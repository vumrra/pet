import { build } from "esbuild";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/main.ts", "src/preload.ts", "src/hook.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  external: ["electron", "uiohook-napi"],
  target: "node22",
});
await build({
  entryPoints: ["src/renderer.ts"],
  outfile: "dist/renderer.js",
  bundle: true,
  platform: "browser",
  target: "chrome134",
});
for (const name of ["index.html", "style.css"])
  await copyFile(`src/${name}`, `dist/${name}`);
if (process.platform === "darwin") {
  await mkdir(".tmp/clang-cache", { recursive: true });
  execFileSync(
    "/usr/bin/clang",
    [
      "scripts/permission.c",
      "-framework",
      "CoreGraphics",
      "-framework",
      "CoreFoundation",
      "-mmacosx-version-min=11.0",
      "-arch",
      "arm64",
      "-arch",
      "x86_64",
      "-o",
      "dist/permission-check",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CLANG_MODULE_CACHE_PATH: `${process.cwd()}/.tmp/clang-cache`,
      },
    },
  );
  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--sign", "-", "dist/permission-check"],
    { stdio: "inherit" },
  );
  execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--strict", "--all-architectures", "dist/permission-check"],
    { stdio: "inherit" },
  );
}
console.log("Built:", (await readdir("dist")).join(", "));
