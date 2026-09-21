import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  open,
} from "node:fs/promises";
import { join } from "node:path";
import { defaults, validateSettings, type Settings } from "./model.ts";
export class Store {
  value: Settings = structuredClone(defaults);
  warning = "";
  private tail: Promise<unknown> = Promise.resolve();
  readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
  }
  async load() {
    await mkdir(join(this.directory, "images"), { recursive: true });
    try {
      this.value = validateSettings(
        JSON.parse(
          await readFile(join(this.directory, "settings.json"), "utf8"),
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        this.warning =
          "설정 파일을 읽을 수 없어 기본값으로 열었습니다. 기존 파일은 다음 저장 시 백업합니다.";
    }
  }
  update(
    change: (current: Settings) => Settings | Promise<Settings>,
  ): Promise<Settings> {
    const task = this.tail.then(async () => {
      const next = validateSettings(await change(structuredClone(this.value)));
      const file = join(this.directory, "settings.json"),
        temp = file + ".tmp";
      if (this.warning)
        await copyFile(
          file,
          join(this.directory, `settings.corrupt-${Date.now()}.json`),
        );
      await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
      const handle = await open(temp, "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, file);
      this.value = next;
      this.warning = "";
      return structuredClone(next);
    });
    this.tail = task.catch(() => {});
    return task;
  }
  flush() {
    return this.tail;
  }
}
