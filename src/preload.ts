import { contextBridge, ipcRenderer } from "electron";
import type { Patch, Snapshot } from "./model.ts";
const invoke = (action: string, payload?: unknown) =>
  ipcRenderer.invoke("pitter", action, payload);
contextBridge.exposeInMainWorld(
  "pitter",
  Object.freeze({
    get: (): Promise<Snapshot> => invoke("get"),
    save: (patch: Patch): Promise<Snapshot> => invoke("save", patch),
    importImages: (): Promise<Snapshot> => invoke("import"),
    reorder: (from: number, to: number): Promise<Snapshot> =>
      invoke("reorder", { from, to }),
    remove: (id: string): Promise<Snapshot> => invoke("remove", id),
    defaults: (): Promise<Snapshot> => invoke("defaults"),
    permission: (pane: "accessibility" | "input"): Promise<void> =>
      invoke("permission", pane),
    retry: (): Promise<Snapshot> => invoke("retry"),
    settings: (): Promise<void> => invoke("settings"),
    drag: (phase: "start" | "end"): Promise<void> => invoke("drag", phase),
    quit: (): Promise<void> => invoke("quit"),
    hit: (hit: boolean) => ipcRenderer.send("pitter-hit", hit),
    subscribe: (
      listener: (kind: "state" | "activity" | "cursor", value: unknown) => void,
    ) => {
      const handler = (
        _: unknown,
        kind: "state" | "activity" | "cursor",
        value: unknown,
      ) => listener(kind, value);
      ipcRenderer.on("pitter-event", handler);
      return () => ipcRenderer.removeListener("pitter-event", handler);
    },
  }),
);
