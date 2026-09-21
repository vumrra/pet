import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  Menu,
  Tray,
  nativeImage,
  shell,
  systemPreferences,
  utilityProcess,
  session,
  type IpcMainInvokeEvent,
} from "electron";
import {
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
  realpath,
} from "node:fs/promises";
import { join, resolve, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import type { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { Store } from "./store.ts";
import {
  validatePatch,
  reorder,
  imageId,
  clampBounds,
  type Snapshot,
  type HookStatus,
} from "./model.ts";

// 표시 이름만 변경하고 기존 사용자 이미지와 설정 경로는 유지합니다.
const existingUserDataPath = app.getPath("userData");
app.setName("p.e.t");
app.setPath("userData", existingUserDataPath);

const testMode = process.env.PITTER_TEST_MODE === "1";
const root = app.getAppPath(),
  html = pathToFileURL(join(root, "dist/index.html")).href;
let pet: BrowserWindow,
  settings: BrowserWindow | null = null,
  tray: Tray | null = null,
  store: Store;
type KeyboardProcess = EventEmitter & {
  kill(): unknown;
  stdout: NodeJS.ReadableStream | null;
};
let status: HookStatus = "off",
  hook: KeyboardProcess | null = null,
  hookTimer: NodeJS.Timeout | undefined;
let frames: string[] = [],
  assetWarning = "",
  importing = false,
  quitting = false;
let dragging: {
  cursor: Electron.Point;
  x: number;
  y: number;
  started: number;
} | null = null;
let ignoring = true;
let mutationTail: Promise<unknown> = Promise.resolve();
function push(kind: string, value?: unknown) {
  for (const w of [pet, settings])
    if (w && !w.isDestroyed()) w.webContents.send("pitter-event", kind, value);
}
function snapshot(): Snapshot {
  return {
    settings: structuredClone(store.value),
    frames,
    status,
    warning: [store.warning, assetWarning].filter(Boolean).join(" "),
    platform: process.platform,
  };
}
async function refreshFrames() {
  assetWarning = "";
  try {
    frames = await Promise.all(
      (store.value.images.length
        ? store.value.images.map((id) => join(store.directory, "images", id))
        : [
            join(root, "assets/default-1.png"),
            join(root, "assets/default-2.png"),
          ]
      ).map(
        async (file) =>
          "data:image/png;base64," + (await readFile(file)).toString("base64"),
      ),
    );
  } catch {
    assetWarning =
      "저장한 이미지가 없습니다. 기본 캐릭터로 표시합니다. 이미지 목록에서 삭제하거나 다시 추가해 주세요.";
    frames = await Promise.all(
      [1, 2].map(
        async (n) =>
          "data:image/png;base64," +
          (await readFile(join(root, `assets/default-${n}.png`))).toString(
            "base64",
          ),
      ),
    );
  }
}
function setStatus(next: HookStatus) {
  status = next;
  push("state", snapshot());
}
function stopHook() {
  clearTimeout(hookTimer);
  const old = hook;
  hook = null;
  old?.kill();
}
function startHook() {
  stopHook();
  if (!store.value.keyboard) return setStatus("off");
  if (testMode) return setStatus("test");
  if (!["darwin", "win32"].includes(process.platform))
    return setStatus("unsupported");
  const helperPath = app.isPackaged
    ? join(process.resourcesPath, "app.asar.unpacked/dist/permission-check")
    : join(root, "dist/permission-check");
  if (process.platform === "darwin") {
    // Both checks are non-prompting; native preflight itself is isolated from main.
    if (!systemPreferences.isTrustedAccessibilityClient(false))
      return setStatus("permission");

    const result = spawnSync(helperPath, [], {
      timeout: 3000,
      stdio: "ignore",
    });
    if (result.status !== 0)
      return setStatus(result.error ? "error" : "permission");
  }
  setStatus("starting");
  try {
    // libuiohook blocks on macOS main-queue character conversion in a utility process.
    const child: KeyboardProcess =
      process.platform === "darwin"
        ? spawn(helperPath, ["--listen"], { stdio: ["pipe", "pipe", "ignore"] })
        : utilityProcess.fork(join(root, "dist/hook.cjs"), [], {
            serviceName: "p.e.t keyboard activity",
            stdio: "ignore",
          });
    if (process.platform === "darwin" && child.stdout) {
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => child.emit("message", line));
      child.once("exit", () => lines.close());
    }
    hook = child;
    child.once("error", () => {
      if (hook === child) {
        stopHook();
        setStatus("error");
      }
    });
    hookTimer = setTimeout(() => {
      if (hook === child) {
        stopHook();
        setStatus("error");
      }
    }, 5000);
    child.on("message", (message: unknown) => {
      if (hook !== child) return;
      if (message === "ready") {
        clearTimeout(hookTimer);
        setStatus("listening");
      } else if (message === "activity" && status === "listening")
        push("activity");
      else if (message === "failed") {
        stopHook();
        setStatus("error");
      }
    });
    child.on("exit", () => {
      if (hook === child) {
        hook = null;
        clearTimeout(hookTimer);
        setStatus("error");
      }
    });
  } catch {
    setStatus("error");
  }
}
function secureWindow(w: BrowserWindow) {
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("will-attach-webview", (e) => e.preventDefault());
}
const preferences = () => ({
  preload: join(root, "dist/preload.cjs"),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  devTools: testMode,
});
function openSettings() {
  if (settings && !settings.isDestroyed()) {
    settings.show();
    settings.focus();
    return;
  }
  settings = new BrowserWindow({
    width: 560,
    height: 740,
    minWidth: 420,
    minHeight: 480,
    title: "p.e.t 설정",
    backgroundColor: "#F5F6F8",
    autoHideMenuBar: true,
    webPreferences: preferences(),
    show: false,
  });
  secureWindow(settings);
  settings.loadURL(html + "?view=settings");
  settings.once("ready-to-show", () => settings?.show());
  settings.on("closed", () => {
    settings = null;
  });
}
function fitPet(first = false) {
  const previous = pet.getBounds(),
    width = store.value.size + 32,
    height = store.value.size + 48;
  const work = first
    ? screen.getPrimaryDisplay().workArea
    : screen.getDisplayMatching(previous).workArea;
  const position = first ? store.value.position : null;
  const candidate = {
    width,
    height,
    x:
      position?.x ??
      (first
        ? work.x + work.width - width - 32
        : previous.x + (previous.width - width) / 2),
    y:
      position?.y ??
      (first
        ? work.y + work.height - height - 24
        : previous.y + previous.height - height),
  };
  pet.setBounds(
    clampBounds(
      candidate,
      first && position
        ? screen.getDisplayNearestPoint(position).workArea
        : work,
    ),
  );
}
function ignore(value: boolean) {
  if (value !== ignoring) {
    ignoring = value;
    pet.setIgnoreMouseEvents(value, { forward: true });
  }
}
async function endDrag() {
  if (!dragging) return;
  dragging = null;
  const { x, y } = pet.getBounds();
  await store.update((s) => ({ ...s, position: { x, y } }));
  push("state", snapshot());
}
function trusted(event: IpcMainInvokeEvent): "pet" | "settings" {
  const role =
    event.sender === pet?.webContents
      ? "pet"
      : event.sender === settings?.webContents
        ? "settings"
        : null;
  if (
    !role ||
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame?.url !== html + "?view=" + role
  )
    throw Error("허용되지 않은 요청입니다.");
  return role;
}
async function importFiles(): Promise<void> {
  if (importing) throw Error("이미지를 가져오는 중입니다. 잠시 기다려 주세요.");
  if (store.value.images.length >= 5)
    throw Error(
      "이미지는 최대 5장까지 추가할 수 있습니다. 먼저 한 장을 삭제해 주세요.",
    );
  importing = true;
  const written: string[] = [];
  try {
    const picked = await dialog.showOpenDialog(settings!, {
      title: "펫 이미지 추가",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "이미지 · PNG, WebP, JPEG",
          extensions: ["png", "webp", "jpg", "jpeg"],
        },
      ],
    });
    if (picked.canceled || !picked.filePaths.length) return;
    await store.update(async (current) => {
      if (current.images.length + picked.filePaths.length > 5)
        throw Error(
          "이미지는 최대 5장입니다. 더 적은 수의 파일을 선택해 주세요.",
        );
      const ids: string[] = [];
      for (const path of picked.filePaths) {
        const info = await stat(path);
        if (
          !info.isFile() ||
          info.size > 8 * 1024 * 1024 ||
          ![".png", ".webp", ".jpg", ".jpeg"].includes(
            extname(path).toLowerCase(),
          )
        )
          throw Error("8 MB 이하의 PNG, WebP, JPEG 파일을 선택해 주세요.");
        const bytes = await readFile(path);
        const png = bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp =
          bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
        if (!png && !jpeg && !webp)
          throw Error(
            "이미지를 읽을 수 없습니다. PNG, WebP, JPEG 파일을 다시 선택해 주세요.",
          );
        let img = nativeImage.createFromBuffer(bytes);
        const size = img.getSize();
        if (
          img.isEmpty() ||
          size.width < 1 ||
          size.height < 1 ||
          size.width > 8192 ||
          size.height > 8192 ||
          size.width * size.height > 24_000_000
        )
          throw Error(
            "이미지가 손상되었거나 너무 큽니다. 24 MP 이하 이미지를 선택해 주세요.",
          );
        if (Math.max(size.width, size.height) > 768)
          img = img.resize(
            size.width >= size.height ? { width: 768 } : { height: 768 },
          );
        const id = randomBytes(16).toString("hex") + ".png",
          file = join(store.directory, "images", id);
        written.push(file + ".tmp", file);
        await writeFile(file + ".tmp", img.toPNG(), { mode: 0o600 });
        await rename(file + ".tmp", file);
        ids.push(id);
      }
      return { ...current, images: [...current.images, ...ids] };
    });
    written.length = 0;
  } finally {
    importing = false;
    await Promise.all(written.map((file) => unlink(file).catch(() => {})));
  }
}
async function removeUnused(ids: string[]) {
  await Promise.all(
    ids.map((id) =>
      unlink(join(store.directory, "images", id)).catch(() => {}),
    ),
  );
}
function installIPC() {
  const handle = async (
    event: IpcMainInvokeEvent,
    action: unknown,
    payload: unknown,
  ) => {
    const role = trusted(event);
    if (
      typeof action !== "string" ||
      ![
        "get",
        "save",
        "import",
        "reorder",
        "remove",
        "defaults",
        "permission",
        "retry",
        "settings",
        "drag",
        "quit",
      ].includes(action)
    )
      throw Error("알 수 없는 요청입니다.");
    if (role === "pet" && !["get", "settings", "drag"].includes(action))
      throw Error("설정 창에서만 사용할 수 있습니다.");
    if (["settings", "drag"].includes(action) && role !== "pet")
      throw Error("펫 창에서만 사용할 수 있습니다.");
    if (
      ["get", "import", "defaults", "retry", "settings", "quit"].includes(
        action,
      ) &&
      payload !== undefined
    )
      throw Error("잘못된 요청입니다.");
    switch (action) {
      case "get":
        return snapshot();
      case "settings":
        openSettings();
        return;
      case "quit":
        app.quit();
        return;
      case "drag": {
        if (payload !== "start" && payload !== "end")
          throw Error("잘못된 드래그입니다.");
        if (payload === "start") {
          const b = pet.getBounds();
          dragging = {
            cursor: screen.getCursorScreenPoint(),
            x: b.x,
            y: b.y,
            started: Date.now(),
          };
          ignore(false);
        } else await endDrag();
        return;
      }
      case "permission":
        if (
          process.platform !== "darwin" ||
          !["accessibility", "input"].includes(payload as string)
        )
          throw Error("macOS에서 사용할 수 있습니다.");
        if (testMode)
          throw Error("테스트 모드에서는 시스템 권한을 변경하지 않습니다.");
        await shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?" +
            (payload === "input"
              ? "Privacy_ListenEvent"
              : "Privacy_Accessibility"),
        );
        return;
      case "retry":
        startHook();
        return snapshot();
      case "save": {
        const patch = validatePatch(payload),
          old = store.value;
        await store.update((s) => ({ ...s, ...patch }));
        if (old.size !== store.value.size) fitPet();
        if (old.keyboard !== store.value.keyboard) startHook();
        break;
      }
      case "import":
        await importFiles();
        await refreshFrames();
        break;
      case "reorder": {
        if (
          !payload ||
          typeof payload !== "object" ||
          Object.keys(payload).sort().join(",") !== "from,to"
        )
          throw Error("잘못된 순서입니다.");
        const p = payload as { from: number; to: number };
        await store.update((s) => ({
          ...s,
          images: reorder(s.images, p.from, p.to),
        }));
        await refreshFrames();
        break;
      }
      case "remove": {
        if (typeof payload !== "string" || !imageId.test(payload))
          throw Error("잘못된 이미지입니다.");
        await store.update((s) => {
          if (!s.images.includes(payload))
            throw Error("이미지를 찾을 수 없습니다.");
          return { ...s, images: s.images.filter((id) => id !== payload) };
        });
        await removeUnused([payload]);
        await refreshFrames();
        break;
      }
      case "defaults": {
        const old = store.value.images;
        await store.update((s) => ({ ...s, images: [] }));
        await removeUnused(old);
        await refreshFrames();
        break;
      }
    }
    push("state", snapshot());
    return snapshot();
  };
  ipcMain.handle("pitter", (event, action: unknown, payload: unknown) => {
    trusted(event);
    if (["get", "settings", "drag", "permission"].includes(action as string))
      return handle(event, action, payload);
    const task = mutationTail.then(() => handle(event, action, payload));
    mutationTail = task.catch(() => {});
    return task;
  });
  ipcMain.on("pitter-hit", (event, value: unknown) => {
    try {
      if (trusted(event) === "pet" && typeof value === "boolean" && !dragging)
        ignore(!value);
    } catch {
      /* Untrusted sender cannot change hit testing. */
    }
  });
}
async function main() {
  if (testMode) {
    const flag = process.argv.find((a) =>
      a.startsWith("--pitter-test-profile="),
    );
    if (!flag) throw Error("Test mode requires a temporary profile.");
    const dir = await realpath(
        resolve(flag.slice("--pitter-test-profile=".length)),
      ),
      temp = await realpath(tmpdir());
    if (!dir.startsWith(temp + "/") || !basename(dir).startsWith("pitter-e2e-"))
      throw Error(
        "Test profile must be a pitter-e2e-* directory in the OS temp directory.",
      );
    app.setPath("userData", dir);
  }
  if (!testMode && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) =>
    done(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, done) =>
    done({
      cancel: !["file:", "data:", "devtools:"].some((s) =>
        details.url.startsWith(s),
      ),
    }),
  );
  store = new Store(app.getPath("userData"));
  await store.load();
  await refreshFrames();
  pet = new BrowserWindow({
    width: 192,
    height: 208,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: preferences(),
  });
  secureWindow(pet);
  pet.setAlwaysOnTop(true, "floating");
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pet.setIgnoreMouseEvents(true, { forward: true });
  fitPet(true);
  installIPC();
  await pet.loadURL(html + "?view=pet");
  pet.showInactive();
  const menu = Menu.buildFromTemplate([
    {
      label: "p.e.t",
      submenu: [
        { label: "설정 열기", click: openSettings },
        { type: "separator" },
        { label: "p.e.t 종료", click: () => app.quit() },
      ],
    },
    { role: "editMenu" },
  ]);
  Menu.setApplicationMenu(menu);
  const icon = nativeImage
    .createFromPath(join(root, "assets/default-1.png"))
    .resize({ width: 22 });
  tray = new Tray(icon);
  tray.setToolTip("p.e.t · 우클릭으로 설정 열기");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "p.e.t 설정", click: openSettings },
      { label: "종료", click: () => app.quit() },
    ]),
  );
  tray.on("click", openSettings);
  startHook();
  const cursorTimer = setInterval(() => {
    if (pet.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    if (dragging) {
      const b = pet.getBounds();
      pet.setBounds(
        clampBounds(
          {
            ...b,
            x: dragging.x + cursor.x - dragging.cursor.x,
            y: dragging.y + cursor.y - dragging.cursor.y,
          },
          screen.getDisplayNearestPoint(cursor).workArea,
        ),
      );
      if (Date.now() - dragging.started > 15000) void endDrag();
    }
    const b = pet.getBounds();
    pet.webContents.send("pitter-event", "cursor", {
      x: cursor.x - b.x,
      y: cursor.y - b.y,
    });
  }, 30);
  app.on("before-quit", (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    clearInterval(cursorTimer);
    stopHook();
    void mutationTail.then(() => store.flush()).finally(() => app.quit());
  });
  screen.on("display-metrics-changed", () => fitPet());
  screen.on("display-removed", () => fitPet());
  app.on("second-instance", openSettings);
  // Startup deliberately leaves settings closed. The dock/menu remains a recovery route.
  app.on("activate", () => {
    if (!pet.isDestroyed()) pet.showInactive();
  });
}
app.on("window-all-closed", () => {});
void main().catch(() => {
  dialog.showErrorBox(
    "p.e.t를 시작할 수 없습니다",
    "앱 파일 또는 저장 폴더를 확인한 뒤 다시 실행해 주세요.",
  );
  app.exit(1);
});
