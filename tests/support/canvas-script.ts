import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);
export const SCRIPT = path.resolve("public/setup/skill/scripts/mekari-canvas.sh");
const temporaryHomes: string[] = [];

export async function makeHome(config?: Record<string, unknown>) {
  const home = await mkdtemp(path.join(tmpdir(), "mekari-canvas-setup-"));
  temporaryHomes.push(home);
  if (config) {
    await mkdir(path.join(home, ".canvas"), { recursive: true });
    await writeFile(
      path.join(home, ".canvas", "config.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      { mode: 0o644 }
    );
  }
  return home;
}

/** Register with afterEach in each script test file. */
export async function removeTemporaryHomes() {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true })));
}

export async function runCanvas(home: string, ...args: string[]) {
  return runCanvasWith(home, {}, ...args);
}

/** Like runCanvas, with a working directory and extra environment (for example TMPDIR). */
export async function runCanvasWith(
  home: string,
  options: { cwd?: string; env?: Record<string, string> },
  ...args: string[]
) {
  return execFileAsync("bash", [SCRIPT, ...args], {
    cwd: options.cwd,
    env: { ...process.env, HOME: home, ...options.env },
  });
}

export function readRequestBody(request: IncomingMessage, done: (body: string) => void) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => done(body));
}

export async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
) {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
