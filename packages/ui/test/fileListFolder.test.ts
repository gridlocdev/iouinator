import { describe, expect, it } from 'vitest';
import { FileListFolder, LedgerLibrary, READ_ONLY_REASON, StoreError, versionOf } from '../src/index.ts';

/** A file as `<input webkitdirectory>` gives it, with its path under the picked folder. */
function picked(path: string, text: string): File {
  const file = new File([text], path.split('/').at(-1)!);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

describe('a folder picked with the file input (PRD §8.2)', () => {
  const folder = new FileListFolder([
    picked('Ledgers/Trip.iou.json', '{"a":1}'),
    picked('Ledgers/House.iou.json', ''),
    picked('Ledgers/notes.txt', 'x'),
    picked('Ledgers/.iouinator/trash/Old.iou.json', ''),
    picked('Ledgers/Archive/2024.iou.json', ''),
    picked('Ledgers/.git/HEAD', 'ref'),
  ]);

  it('is named after the folder and lists its files without the folder name', async () => {
    expect(folder.label).toBe('Ledgers');
    expect((await folder.list('')).sort()).toEqual(['House.iou.json', 'Trip.iou.json', 'notes.txt']);
    expect(await new LedgerLibrary(folder).names()).toEqual(['House', 'Trip']);
    expect(await new LedgerLibrary(folder).trashed()).toEqual(['Old']);
  });

  it('keeps no subfolders but the trash', async () => {
    expect(await folder.list('Archive')).toEqual([]);
    expect(await folder.read('.git/HEAD')).toBe(null);
  });

  it('reads a file with the same version as any other folder', async () => {
    expect(await folder.read('Trip.iou.json')).toEqual({
      text: '{"a":1}',
      version: await versionOf('{"a":1}'),
    });
  });

  it('a missing file reads as null and a bad path rejects, never throws', async () => {
    expect(await folder.read('Gone.iou.json')).toBe(null);
    await expect(folder.read('../x')).rejects.toBeInstanceOf(StoreError);
  });

  it('is read-only: every write and move rejects and changes nothing', async () => {
    expect(folder.readOnly).toBe(READ_ONLY_REASON);
    await expect(folder.write('Trip.iou.json', 'new', null)).rejects.toMatchObject({ kind: 'readOnly' });
    await expect(folder.move('Trip.iou.json', 'Moved.iou.json')).rejects.toMatchObject({ kind: 'readOnly' });
    expect((await folder.read('Trip.iou.json'))?.text).toBe('{"a":1}');
  });
});
