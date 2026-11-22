// Just enough of FileSystemDirectoryHandle and FileSystemFileHandle for HandleFolder, in memory.

const notFound = () => new DOMException('Not found', 'NotFoundError');

class FakeFile {
  bytes = new Uint8Array();
  readonly kind = 'file';
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> {
    const copy = this.bytes.slice();
    return Promise.resolve({ arrayBuffer: () => Promise.resolve(copy.buffer) });
  }

  createWritable() {
    let pending = new Uint8Array();
    return Promise.resolve({
      write: (data: Uint8Array | ArrayBuffer) => {
        pending = new Uint8Array(data);
        return Promise.resolve();
      },
      close: () => {
        this.bytes = pending;
        return Promise.resolve();
      },
      abort: () => Promise.resolve(),
    });
  }
}

export class FakeDirectory {
  readonly kind = 'directory';
  readonly entries = new Map<string, FakeDirectory | FakeFile>();
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<FakeDirectory> {
    const entry = this.entries.get(name);
    if (entry instanceof FakeDirectory) return Promise.resolve(entry);
    if (entry || !options.create) return Promise.reject(notFound());
    const dir = new FakeDirectory(name);
    this.entries.set(name, dir);
    return Promise.resolve(dir);
  }

  getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFile> {
    const entry = this.entries.get(name);
    if (entry instanceof FakeFile) return Promise.resolve(entry);
    if (entry || !options.create) return Promise.reject(notFound());
    const file = new FakeFile(name);
    this.entries.set(name, file);
    return Promise.resolve(file);
  }

  removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name)) return Promise.reject(notFound());
    return Promise.resolve();
  }

  async *values(): AsyncGenerator<FakeDirectory | FakeFile> {
    await Promise.resolve();
    yield* this.entries.values();
  }
}
