/** A folder in memory: for tests, and where a browser has no storage to give. */
import { Serial, StoreError, pathParts, versionOf, type FileRead, type Folder } from './folder.ts';

export class MemoryFolder implements Folder {
  readonly files = new Map<string, string>();
  readonly #serial = new Serial();

  readonly label: string;

  constructor(label = 'memory', files: Readonly<Record<string, string>> = {}) {
    this.label = label;
    for (const [path, text] of Object.entries(files)) this.files.set(path, text);
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir ? `${pathParts(dir).join('/')}/` : '';
    const names = [...this.files.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => p.slice(prefix.length));
    return names;
  }

  async read(path: string): Promise<FileRead | null> {
    const text = this.files.get(pathParts(path).join('/'));
    return text === undefined ? null : { text, version: await versionOf(text) };
  }

  async write(path: string, text: string, expected: string | null): Promise<string> {
    const key = pathParts(path).join('/');
    return this.#serial.run(async () => {
      const now = this.files.get(key);
      const version = now === undefined ? null : await versionOf(now);
      if (version !== expected) throw new StoreError('conflict', `“${path}” changed somewhere else.`);
      this.files.set(key, text);
      return versionOf(text);
    });
  }

  async move(from: string, to: string): Promise<void> {
    const a = pathParts(from).join('/');
    const b = pathParts(to).join('/');
    return this.#serial.run(() => {
      const text = this.files.get(a);
      if (text === undefined) throw new StoreError('missing', `“${from}” isn’t there any more.`);
      if (this.files.has(b)) throw new StoreError('exists', `“${to}” is taken.`);
      this.files.delete(a);
      this.files.set(b, text);
      return Promise.resolve();
    });
  }
}
