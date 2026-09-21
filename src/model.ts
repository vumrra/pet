export interface Settings {
  version: 1;
  images: string[];
  fps: number;
  size: number;
  keyboard: boolean;
  position: { x: number; y: number } | null;
}
export type Patch = Partial<Pick<Settings, "fps" | "size" | "keyboard">>;
export type HookStatus =
  | "off"
  | "permission"
  | "starting"
  | "listening"
  | "error"
  | "test"
  | "unsupported";
export interface Snapshot {
  settings: Settings;
  frames: string[];
  status: HookStatus;
  warning: string;
  platform: string;
}
export const defaults: Settings = {
  version: 1,
  images: [],
  fps: 8,
  size: 160,
  keyboard: true,
  position: null,
};
export const imageId = /^[a-f0-9]{32}\.png$/;
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("설정 형식이 올바르지 않습니다.");
  return v as Record<string, unknown>;
}
export function validatePatch(v: unknown): Patch {
  const p = object(v);
  if (Object.keys(p).some((k) => !["fps", "size", "keyboard"].includes(k)))
    throw Error("허용되지 않은 설정입니다.");
  if (
    "fps" in p &&
    (!Number.isInteger(p.fps) ||
      (p.fps as number) < 1 ||
      (p.fps as number) > 30)
  )
    throw Error("프레임 속도는 1–30 FPS입니다.");
  if (
    "size" in p &&
    (!Number.isInteger(p.size) ||
      (p.size as number) < 80 ||
      (p.size as number) > 280)
  )
    throw Error("펫 크기는 80–280 px입니다.");
  if ("keyboard" in p && typeof p.keyboard !== "boolean")
    throw Error("키보드 반응 설정이 올바르지 않습니다.");
  return { ...p } as Patch;
}
export function validateSettings(v: unknown): Settings {
  const s = object(v);
  if (
    Object.keys(s).sort().join(",") !==
      "fps,images,keyboard,position,size,version" ||
    s.version !== 1
  )
    throw Error("지원하지 않는 설정입니다.");
  validatePatch({ fps: s.fps, size: s.size, keyboard: s.keyboard });
  if (
    !Array.isArray(s.images) ||
    s.images.length > 5 ||
    new Set(s.images).size !== s.images.length ||
    s.images.some((id) => typeof id !== "string" || !imageId.test(id))
  )
    throw Error("이미지는 최대 5장까지 사용할 수 있습니다.");
  if (s.position !== null) {
    const p = object(s.position);
    if (
      Object.keys(p).sort().join(",") !== "x,y" ||
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      Math.abs(p.x as number) > 100000 ||
      Math.abs(p.y as number) > 100000
    )
      throw Error("잘못된 창 위치입니다.");
  }
  return structuredClone(s) as unknown as Settings;
}
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  )
    throw Error("이미지 순서를 다시 확인해 주세요.");
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function clampBounds(b: Bounds, work: Bounds): Bounds {
  const width = Math.min(b.width, work.width),
    height = Math.min(b.height, work.height);
  return {
    x: Math.round(Math.max(work.x, Math.min(b.x, work.x + work.width - width))),
    y: Math.round(
      Math.max(work.y, Math.min(b.y, work.y + work.height - height)),
    ),
    width,
    height,
  };
}
