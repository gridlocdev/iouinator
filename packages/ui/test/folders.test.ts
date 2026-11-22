import { HandleFolder, MemoryFolder, NativeFolder, StoreError, type NativeReply } from '../src/index.ts';
import { FakeDirectory } from './fakeDirectory.ts';
import { folderContract } from './folderContract.ts';

folderContract('memory', () => Promise.resolve(new MemoryFolder()));
folderContract('file handle', () =>
  Promise.resolve(
    new HandleFolder(new FakeDirectory('Ledgers') as unknown as FileSystemDirectoryHandle, 'Ledgers'),
  ),
);

/** The desktop bridge, answered by a memory folder as the main process would answer. */
folderContract('desktop', () => {
  const disk = new MemoryFolder('disk');
  const call = async (op: string, args: readonly unknown[]): Promise<NativeReply> => {
    try {
      const [a, b, c] = args as [string, string, string | null];
      const value =
        op === 'list'
          ? await disk.list(a)
          : op === 'read'
            ? await disk.read(a)
            : op === 'write'
              ? await disk.write(a, b, c)
              : await disk.move(a, b);
      return { ok: true, value: value ?? null };
    } catch (e) {
      return { ok: false, kind: e instanceof StoreError ? e.kind : null, message: String(e) };
    }
  };
  return Promise.resolve(new NativeFolder(call, 'IOUinator'));
});
