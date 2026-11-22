/** The desktop app's ledger folder, reached through the preload (PRD §8.2). The main process does the work. */
import { StoreError, type FileRead, type Folder, type StoreErrorKind } from './folder.ts';

/** One folder call's answer from the main process. */
export type NativeReply =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly kind: string | null; readonly message: string };

export type NativeFolderCall = (op: string, args: readonly unknown[]) => Promise<NativeReply>;

const KINDS: readonly string[] = ['conflict', 'exists', 'missing', 'name'] satisfies StoreErrorKind[];

export class NativeFolder implements Folder {
  readonly label: string;
  readonly #call: NativeFolderCall;

  constructor(call: NativeFolderCall, label: string) {
    this.#call = call;
    this.label = label;
  }

  async #run(op: string, args: readonly unknown[]): Promise<unknown> {
    const reply = await this.#call(op, args);
    if (reply.ok) return reply.value;
    if (reply.kind && KINDS.includes(reply.kind))
      throw new StoreError(reply.kind as StoreErrorKind, reply.message);
    throw new Error(reply.message);
  }

  async list(dir: string): Promise<string[]> {
    return (await this.#run('list', [dir])) as string[];
  }

  async read(path: string): Promise<FileRead | null> {
    return (await this.#run('read', [path])) as FileRead | null;
  }

  async write(path: string, text: string, expected: string | null): Promise<string> {
    return (await this.#run('write', [path, text, expected])) as string;
  }

  async move(from: string, to: string): Promise<void> {
    await this.#run('move', [from, to]);
  }
}
