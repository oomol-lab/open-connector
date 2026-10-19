import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { setImmediate } from "node:timers/promises";
import { expect, vi } from "vitest";

export interface PGliteTestServer {
  database: PGlite;
  url: string;
  close(): Promise<void>;
}

export async function startPGliteTestServer(): Promise<PGliteTestServer> {
  const database = await PGlite.create();
  // PGlite sends ReadyForQuery before Sync after extended-query errors: https://github.com/electric-sql/pglite/issues/958
  database.execProtocolRawStream = async (message, { syncToFs, onRawData }) => {
    const response = Buffer.from(await database.execProtocolRaw(message, { syncToFs }));
    if (message[0] === 0 || message[0] === "Q".charCodeAt(0) || message[0] === "S".charCodeAt(0)) {
      onRawData(response);
      return;
    }
    for (let offset = 0; offset < response.length;) {
      const end = offset + response.readUInt32BE(offset + 1) + 1;
      if (response[offset] !== "Z".charCodeAt(0)) onRawData(response.subarray(offset, end));
      offset = end;
    }
  };
  const server = new PGLiteSocketServer({
    db: database,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await server.start();
  return {
    database,
    async close() {
      // stop() does not await deferred socket close handlers or their transaction rollback.
      // Callers must end their pg clients/pools before disposing the database.
      try {
        await vi.waitFor(
          () => {
            expect(server.getStats().activeConnections).toBe(0);
            expect(database.isInTransaction()).toBe(false);
          },
          { timeout: 5_000 },
        );
      } finally {
        await server.stop();
        // stop() can leave setImmediate close callbacks and detached transactions pending.
        await setImmediate();
        await vi.waitFor(() => expect(database.isInTransaction()).toBe(false), { timeout: 5_000 });
        await database.close();
      }
    },
    url: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`,
  };
}
