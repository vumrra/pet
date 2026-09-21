import { Motion } from "./motion.ts";
import type { Snapshot, Patch } from "./model.ts";
interface API {
  get(): Promise<Snapshot>;
  save(p: Patch): Promise<Snapshot>;
  importImages(): Promise<Snapshot>;
  reorder(from: number, to: number): Promise<Snapshot>;
  remove(id: string): Promise<Snapshot>;
  defaults(): Promise<Snapshot>;
  permission(p: "accessibility" | "input"): Promise<void>;
  retry(): Promise<Snapshot>;
  settings(): Promise<void>;
  drag(p: "start" | "end"): Promise<void>;
  quit(): Promise<void>;
  hit(b: boolean): void;
  subscribe(fn: (kind: string, value: unknown) => void): () => void;
}
declare global {
  interface Window {
    pitter: API;
  }
}
const api = window.pitter,
  petView = new URLSearchParams(location.search).get("view") === "pet",
  app = document.querySelector<HTMLElement>("#app")!;
const motion = new Motion(),
  reduced = matchMedia("(prefers-reduced-motion: reduce)");
let state: Snapshot,
  images: HTMLImageElement[] = [],
  pixels: (ImageData | null)[] = [],
  imageVersion = 0,
  frame = -1,
  busy = false,
  dragging = false,
  raf = 0;
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
if (petView) {
  document.body.className = "pet-page";
  app.innerHTML =
    '<img id="sprite" class="pet-sprite" alt="p.e.t 펫 · 우클릭으로 설정" draggable="false">';
} else {
  app.className = "settings";
  app.innerHTML = `<header class="header"><img src="../assets/default-1.png" alt=""><div><h1>p.e.t</h1><p class="subtitle">타닥타닥, 당신의 작은 데스크톱 친구</p></div></header>
 <section aria-label="애니메이션 미리보기"><div class="preview"><span class="preview-label">미리보기</span><img id="sprite" class="pet-image" alt="캐릭터 미리보기"><button id="simulate">움직여 보기 ↗</button></div><p class="preview-hint">펫을 드래그해 옮기고, 우클릭해 설정을 열어요.</p></section>
 <section class="section" aria-labelledby="frames-title"><div class="section-heading"><div class="title-group"><h2 id="frames-title">캐릭터 이미지</h2><span id="count" class="count"></span></div><button id="add" class="primary">＋ 이미지 추가</button></div><div id="frames" class="frames" aria-label="재생 순서"></div><div class="frame-note"><span id="frame-note">PNG · WebP · JPEG / 최대 5장</span><button id="defaults">기본 캐릭터로</button></div></section>
 <section class="sliders" aria-label="움직임 설정"><div class="slider-row"><label for="fps">프레임 속도</label><input id="fps" type="range" min="1" max="30" step="1"><output id="fps-value" for="fps"></output></div><div class="slider-row"><label for="size">펫 크기</label><input id="size" type="range" min="80" max="280" step="1"><output id="size-value" for="size"></output></div></section>
 <section class="section" aria-label="키보드 반응"><label class="checkbox-label"><input id="keyboard" type="checkbox">키보드 입력에 반응하기</label><p class="privacy">입력한 키의 내용은 저장하거나 전송하지 않아요.</p><div id="status" class="status" role="status"><div class="status-title"><span class="dot"></span><span id="status-title"></span></div><p id="status-description" class="status-description"></p><div id="permission-actions" class="permission-actions"><button id="accessibility">손쉬운 사용 설정</button><button id="input-permission">입력 모니터링 설정</button><button id="retry">권한 다시 확인</button></div></div></section>
 <p id="error" class="error" role="alert"></p><footer class="footer"><span id="saved" class="save-status" role="status">변경 사항은 자동으로 저장돼요</span><button id="quit" class="quiet">p.e.t 종료</button></footer>`;
}
const sprite = element<HTMLImageElement>("sprite");
function wake() {
  if (!raf) raf = requestAnimationFrame(animate);
}
function animate(now: number) {
  raf = 0;
  if (!state || !images.length) return;
  const sample = motion.sample(
    now,
    state.settings.fps,
    images.length,
    reduced.matches,
  );
  if (frame !== sample.frame) {
    frame = sample.frame;
    sprite.src = images[frame].src;
  }
  sprite.style.transform = `translateY(${sample.y}px) scale(${sample.scaleX},${sample.scaleY})`;
  if (sample.active) wake();
}
async function loadImages(urls: string[]) {
  const version = ++imageVersion;
  const loaded = await Promise.all(
    urls.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () =>
            reject(Error("이미지를 표시할 수 없습니다. 다시 추가해 주세요."));
          img.src = src;
        }),
    ),
  );
  if (version !== imageVersion) return;
  images = loaded;
  pixels = loaded.map((img) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  });
  frame = -1;
  wake();
}
function showError(error: unknown) {
  if (!petView) {
    element("error").textContent =
      error instanceof Error
        ? error.message.replace(
            /^Error invoking remote method '[^']+': Error: /,
            "",
          )
        : "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
    element("saved").textContent = "저장하지 못했어요";
  }
}
async function action(task: () => Promise<Snapshot | void>, saved = true) {
  if (busy) return;
  busy = true;
  if (!petView) {
    element("error").textContent = "";
    element("saved").textContent = "처리 중…";
    setBusy(true);
  }
  try {
    const next = await task();
    if (next) apply(next);
    if (!petView)
      element("saved").textContent = saved ? "저장했어요" : "확인했어요";
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
    if (!petView) setBusy(false);
  }
}
function setBusy(value: boolean) {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "#frames button,#add,#defaults,#keyboard,#fps,#size",
  ))
    button.disabled = value;
  element<HTMLButtonElement>("add").disabled =
    value || state?.settings.images.length >= 5;
  element<HTMLButtonElement>("defaults").disabled =
    value || !state?.settings.images.length;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-edge=true]",
  ))
    button.disabled = true;
}
function renderTiles() {
  const container = element("frames");
  container.replaceChildren();
  const custom = state.settings.images.length > 0;
  state.frames.forEach((src, i) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    const num = document.createElement("span");
    num.className = "number";
    num.textContent = String(i + 1);
    const img = new Image();
    img.src = src;
    img.alt = `${custom ? "사용자" : "기본"} 프레임 ${i + 1}`;
    tile.append(img, num);
    const actions = document.createElement("div");
    actions.className = custom ? "tile-actions" : "default-tag";
    if (custom) {
      for (const [label, text, fn, disabled] of [
        [`${i + 1}번 이미지 앞으로`, "←", () => api.reorder(i, i - 1), i === 0],
        [
          `${i + 1}번 이미지 뒤로`,
          "→",
          () => api.reorder(i, i + 1),
          i === state.frames.length - 1,
        ],
        [
          `${i + 1}번 이미지 삭제`,
          "×",
          () => api.remove(state.settings.images[i]),
          false,
        ],
      ] as const) {
        const b = document.createElement("button");
        b.textContent = text;
        b.setAttribute("aria-label", label);
        b.title = label;
        b.disabled = disabled;
        b.dataset.edge = String(disabled);
        if (text === "×") b.className = "danger";
        b.addEventListener("click", () => void action(fn));
        actions.append(b);
      }
    } else actions.textContent = "기본";
    tile.append(actions);
    container.append(tile);
  });
  element("count").textContent = custom
    ? `${state.settings.images.length} / 5`
    : "기본 2장";
  element("frame-note").textContent = custom
    ? "왼쪽부터 순서대로 재생돼요"
    : "PNG · WebP · JPEG / 최대 5장";
  setBusy(busy);
}
function renderStatus() {
  const messages: Record<string, [string, string]> = {
    off: [
      "키보드 반응 꺼짐",
      "펫이 조용히 쉬고 있어요. 미리보기는 계속 사용할 수 있어요.",
    ],
    permission: [
      "키보드 권한이 필요해요",
      "시스템 설정에서 p.e.t의 손쉬운 사용 및 입력 모니터링을 허용한 후 다시 확인해 주세요. 필요하면 앱을 다시 실행해 주세요.",
    ],
    starting: ["키보드 연결 중", "잠시만 기다려 주세요."],
    listening: ["키보드 반응 중", "어떤 앱에서든 입력하면 펫이 움직여요."],
    error: [
      "키보드 연결을 시작하지 못했어요",
      "권한을 확인한 뒤 다시 시도해 주세요. 계속 실패하면 앱을 다시 실행해 주세요.",
    ],
    test: [
      "안전한 테스트 모드",
      "전역 키보드 연결이 비활성화되어 있어요. 움직여 보기로 확인할 수 있어요.",
    ],
    unsupported: [
      "지원되지 않는 운영체제",
      "키보드 반응은 macOS와 Windows에서 지원해요.",
    ],
  };
  const [title, description] = messages[state.status];
  element("status-title").textContent = title;
  element("status-description").textContent = description;
  element("status").dataset.status = state.status;
  const visible = ["permission", "error"].includes(state.status);
  element("permission-actions").hidden = !visible;
  element("accessibility").hidden = state.platform !== "darwin";
  element("input-permission").hidden = state.platform !== "darwin";
}
function apply(next: Snapshot) {
  const changed = !state || state.frames.join() !== next.frames.join();
  state = next;
  if (changed) {
    motion.stop();
    void loadImages(state.frames).catch(showError);
  }
  if (!state.settings.keyboard) motion.stop();
  if (petView) {
    sprite.style.width = `${state.settings.size}px`;
    sprite.style.height = `${state.settings.size}px`;
  } else {
    for (const key of ["fps", "size"] as const) {
      element<HTMLInputElement>(key).value = String(state.settings[key]);
      element(`${key}-value`).textContent =
        `${state.settings[key]} ${key === "fps" ? "FPS" : "px"}`;
    }
    element<HTMLInputElement>("keyboard").checked = state.settings.keyboard;
    renderTiles();
    renderStatus();
    if (state.warning) element("error").textContent = state.warning;
  }
  wake();
}
function hitTest(x: number, y: number) {
  if (dragging) {
    api.hit(true);
    return;
  }
  const rect = sprite.getBoundingClientRect(),
    img = images[Math.max(frame, 0)],
    pixel = pixels[Math.max(frame, 0)];
  if (!img || !pixel) {
    api.hit(false);
    return;
  }
  const ratio = Math.min(
      rect.width / img.naturalWidth,
      rect.height / img.naturalHeight,
    ),
    w = img.naturalWidth * ratio,
    h = img.naturalHeight * ratio;
  const px = Math.floor((x - rect.left - (rect.width - w) / 2) / ratio),
    py = Math.floor((y - rect.bottom + h) / ratio);
  api.hit(
    px >= 0 &&
      py >= 0 &&
      px < pixel.width &&
      py < pixel.height &&
      pixel.data[(py * pixel.width + px) * 4 + 3] > 24,
  );
}
if (petView) {
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    void api.settings().catch(showError);
  });
  sprite.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    sprite.setPointerCapture(e.pointerId);
    void api.drag("start").catch(() => {
      dragging = false;
    });
  });
  const end = () => {
    if (dragging) {
      dragging = false;
      void api.drag("end").catch(showError);
    }
  };
  sprite.addEventListener("pointerup", end);
  sprite.addEventListener("pointercancel", end);
  sprite.addEventListener("lostpointercapture", end);
  document.addEventListener("pointermove", (e) =>
    hitTest(e.clientX, e.clientY),
  );
} else {
  element("simulate").addEventListener("click", () => {
    motion.trigger(performance.now());
    wake();
  });
  element("add").addEventListener(
    "click",
    () => void action(() => api.importImages()),
  );
  element("defaults").addEventListener(
    "click",
    () => void action(() => api.defaults()),
  );
  for (const key of ["fps", "size"] as const) {
    const input = element<HTMLInputElement>(key);
    input.addEventListener("input", () => {
      element(`${key}-value`).textContent =
        `${input.value} ${key === "fps" ? "FPS" : "px"}`;
    });
    input.addEventListener(
      "change",
      () => void action(() => api.save({ [key]: Number(input.value) })),
    );
  }
  element("keyboard").addEventListener(
    "change",
    () =>
      void action(() =>
        api.save({ keyboard: element<HTMLInputElement>("keyboard").checked }),
      ),
  );
  element("accessibility").addEventListener(
    "click",
    () => void action(() => api.permission("accessibility"), false),
  );
  element("input-permission").addEventListener(
    "click",
    () => void action(() => api.permission("input"), false),
  );
  element("retry").addEventListener(
    "click",
    () => void action(() => api.retry(), false),
  );
  element("quit").addEventListener("click", () => void api.quit());
}
api.subscribe((kind, value) => {
  if (kind === "state") apply(value as Snapshot);
  else if (kind === "activity" && state?.settings.keyboard) {
    motion.trigger(performance.now());
    wake();
  } else if (kind === "cursor" && petView) {
    const p = value as { x: number; y: number };
    hitTest(p.x, p.y);
  }
});
void api.get().then(apply).catch(showError);
