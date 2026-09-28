import "./env";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app";
import { createStore, type Store } from "../src/domain/store";

const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

const created: string[] = [];
// Every test creates throw-away data directories; remove them when the test process ends.
process.on("exit", () => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ddd-studio-test-"));
  created.push(dir);
  return dir;
}

export function tempStore(opts: { dir?: string; seedSample?: boolean } = {}): Store {
  return createStore({ dataDir: opts.dir ?? tempDir(), seedSample: opts.seedSample, log: quiet });
}

export type TestServer = {
  store: Store;
  url: string;
  call: (method: string, route: string, body?: unknown) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
};

/** Boots the real Express app on an ephemeral port against a throw-away data directory. */
export async function startServer(opts: { seedSample?: boolean } = {}): Promise<TestServer> {
  const store = tempStore({ seedSample: opts.seedSample ?? false });
  const server = createApp(store).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    store,
    url,
    async call(method, route, body) {
      const res = await fetch(url + route, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON body */
      }
      return { status: res.status, body: parsed };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
