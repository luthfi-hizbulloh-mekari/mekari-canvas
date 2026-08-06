import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve("public/setup/skill/scripts/mekari-canvas.sh");
const temporaryHomes: string[] = [];

async function makeHome(config?: Record<string, unknown>) {
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

async function readConfig(home: string) {
  return JSON.parse(await readFile(path.join(home, ".canvas", "config.json"), "utf8"));
}

async function runSetup(home: string, manifestUrl: string) {
  return execFileAsync("bash", [SCRIPT, "setup", "fresh-code", manifestUrl], {
    env: { ...process.env, HOME: home },
  });
}

async function withServer(
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

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true })));
});

describe("mekari-canvas setup", () => {
  it("exchanges the Setup code when config is missing", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        if (request.url === "/api/setup/exchange" && request.method === "POST") {
          exchangeCalls += 1;
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ token: "new-token", apiBase: `http://${address}` }));
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome();

        await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(exchangeCalls).toBe(1);
        expect(await readConfig(home)).toEqual({ apiBase: baseUrl, token: "new-token" });
        expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
          0o600
        );
        await expect(stat(path.join(home, ".cursor", "skills"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    );
  });

  it("reuses a valid token without exchanging the new Setup code", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/api/shares") {
          expect(request.headers.authorization).toBe("Bearer existing-token");
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"shares":[]}');
          return;
        }
        exchangeCalls += 1;
        response.writeHead(500).end();
      },
      async (baseUrl) => {
        const home = await makeHome({
          apiBase: baseUrl,
          token: "existing-token",
          unrelated: { keep: true },
        });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stdout).toContain("Existing Publisher API token is valid");
        expect(exchangeCalls).toBe(0);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "existing-token",
          unrelated: { keep: true },
        });
        expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
          0o600
        );
      }
    );
  });

  it("exchanges a rejected token and preserves unrelated config fields", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/api/shares") {
          response.writeHead(401, { "content-type": "application/json" });
          response.end('{"error":"rejected"}');
          return;
        }
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        if (request.url === "/api/setup/exchange" && request.method === "POST") {
          exchangeCalls += 1;
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({ token: "replacement-token", apiBase: `http://${address}` })
          );
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({
          apiBase: baseUrl,
          token: "rejected-token",
          theme: "dark",
        });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stderr).toContain("token was rejected");
        expect(exchangeCalls).toBe(1);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "replacement-token",
          theme: "dark",
        });
        expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
          0o600
        );
      }
    );
  });

  it("preserves a token when validation fails in transport", async () => {
    const home = await makeHome({
      apiBase: "http://127.0.0.1:1",
      token: "possibly-valid-token",
      custom: "preserve-me",
    });

    const result = await runSetup(home, "http://127.0.0.1:1/setup/manifest.json");

    expect(result.stderr).toContain("Could not validate");
    expect(result.stderr).toContain("Setup code was not exchanged");
    expect(await readConfig(home)).toEqual({
      apiBase: "http://127.0.0.1:1",
      token: "possibly-valid-token",
      custom: "preserve-me",
    });
    expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
      0o600
    );
  });

  it("preserves a token when validation returns a transient server error", async () => {
    let requests = 0;
    await withServer(
      (request, response) => {
        requests += 1;
        expect(request.url).toBe("/api/shares");
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":"temporarily unavailable"}');
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "existing-token" });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stderr).toContain("Could not validate");
        expect(requests).toBe(1);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "existing-token",
        });
      }
    );
  });

  it("repairs an invalid saved API base by exchanging the Setup code", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        if (request.url === "/api/setup/exchange") {
          exchangeCalls += 1;
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ token: "repaired-token", apiBase: `http://${address}` }));
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({
          apiBase: "not-a-url",
          token: "stranded-token",
          unrelated: true,
        });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stderr).toContain("invalid API base");
        expect(exchangeCalls).toBe(1);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "repaired-token",
          unrelated: true,
        });
      }
    );
  });

  it("reports a stable error when the exchange response is not JSON", async () => {
    await withServer(
      (request, response) => {
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        response.writeHead(502, { "content-type": "text/plain" });
        response.end("upstream failed");
      },
      async (baseUrl) => {
        const home = await makeHome();

        await expect(
          runSetup(home, `${baseUrl}/setup/manifest.json`)
        ).rejects.toMatchObject({
          stderr: expect.stringContaining("setup exchange failed (HTTP 502)"),
        });
      }
    );
  });
});
