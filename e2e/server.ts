// Where the scenarios find the app: the built web client served by `vite preview`. Each page starts with empty
// browser storage, so every scenario starts with an empty ledger.
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
/**
 * A port no other app's checks use, so two apps' checks can run at once (Cellestra uses 8791, Puffinote 8793,
 * Daybird 8795, Taskite 8797). An app that shares one stops the other's server or fails with EADDRINUSE.
 * `IOUINATOR_E2E_PORT` picks another when that one is busy.
 */
export const PORT = Number(process.env.IOUINATOR_E2E_PORT ?? 8798);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const SERVER_COMMAND = `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`;
export const SERVER_CWD = `${ROOT}apps/web`;
