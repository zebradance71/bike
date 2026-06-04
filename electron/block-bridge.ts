import { randomBytes, timingSafeEqual } from "crypto";
import { createServer, type IncomingMessage, type Server } from "http";
import { readSettings, writeSettings } from "./settings-store";

const DEFAULT_PORT = 7727;
const MAX_BODY_BYTES = 4096;
const DEV_PORT_FALLBACK_ATTEMPTS = 12;

export type BlockBridgeHandlers = {
  onSetBlockMode: (on: boolean) => void;
  getBlockMode: () => boolean;
};

let server: Server | null = null;
let listeningPort: number | null = null;
let token: string | null = null;

export function getBlockBridgeListeningPort(): number | null {
  return listeningPort;
}

export function resolveBlockHttpPort(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_PORT);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    console.warn(
      "[companion][block-http] invalid port; falling back to",
      DEFAULT_PORT
    );
    return DEFAULT_PORT;
  }
  return n;
}

/** Persisted loopback token — required for POST state changes. */
export function ensureBlockBridgeToken(): string {
  if (token) return token;
  const settings = readSettings();
  if (settings.blockBridgeToken) {
    token = settings.blockBridgeToken;
    return token;
  }
  const next = randomBytes(32).toString("hex");
  writeSettings({ blockBridgeToken: next });
  token = next;
  return token;
}

function tokensMatch(provided: unknown): boolean {
  if (typeof provided !== "string" || !provided) return false;
  const expected = ensureBlockBridgeToken();
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer | string) => {
      data += chunk.toString();
      if (data.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: import("http").ServerResponse,
  status: number,
  body: unknown
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function attachBlockRoutes(srv: Server, handlers: BlockBridgeHandlers): void {
  srv.on("request", (req, res) => {
    if (req.method === "OPTIONS") {
      res.statusCode = 405;
      res.end();
      return;
    }
    if (!req.url) {
      sendJson(res, 400, { ok: false, error: "bad request" });
      return;
    }

    const url = new URL(req.url, "http://127.0.0.1");
    const path = url.pathname;

    if (path === "/block" && req.method === "GET") {
      sendJson(res, 200, { ok: true, blockMode: handlers.getBlockMode() });
      return;
    }

    if (path === "/block/on" || path === "/block/off") {
      sendJson(res, 405, {
        ok: false,
        error: "use POST /block with JSON { on, token }",
      });
      return;
    }

    if (path === "/block" && req.method === "POST") {
      void (async () => {
        try {
          const body = (await readJsonBody(req)) as {
            on?: unknown;
            token?: unknown;
          };
          if (!tokensMatch(body.token)) {
            sendJson(res, 401, { ok: false, error: "unauthorized" });
            return;
          }
          if (typeof body.on !== "boolean") {
            sendJson(res, 400, { ok: false, error: "on must be boolean" });
            return;
          }
          handlers.onSetBlockMode(body.on);
          sendJson(res, 200, { ok: true, blockMode: body.on });
        } catch {
          sendJson(res, 400, { ok: false, error: "bad request" });
        }
      })();
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  });
}

function bindBlockBridge(
  preferredPort: number,
  handlers: BlockBridgeHandlers,
  isDev: boolean,
  attemptsLeft: number
): void {
  const port = preferredPort;
  const srv = createServer();
  attachBlockRoutes(srv, handlers);

  srv.once("error", (err: NodeJS.ErrnoException) => {
    srv.close();
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.warn(
        `[companion][block-http] 127.0.0.1:${port} is in use — trying ${port + 1}`
      );
      bindBlockBridge(port + 1, handlers, isDev, attemptsLeft - 1);
      return;
    }
    console.error(
      `[companion][block-http] cannot listen on 127.0.0.1:${port} (${err.code ?? err.message}). ` +
        "Another Bike instance may still be running (check the tray). " +
        "Quit it, or in PowerShell: Get-NetTCPConnection -LocalPort " +
        port +
        " | Select OwningProcess"
    );
  });

  srv.listen(port, "127.0.0.1", () => {
    server = srv;
    listeningPort = port;
    if (port !== preferredPort) {
      console.warn(
        `[companion][block-http] using 127.0.0.1:${port} (configured ${preferredPort} was busy). ` +
          "Set the browser extension port to match."
      );
    }
    console.info("[companion][block-http] listening on 127.0.0.1:" + port);
  });
}

export function startBlockBridge(
  port: number,
  handlers: BlockBridgeHandlers,
  isDev: boolean
): void {
  if (server) return;
  ensureBlockBridgeToken();
  bindBlockBridge(
    port,
    handlers,
    isDev,
    isDev ? DEV_PORT_FALLBACK_ATTEMPTS : 0
  );
}

export function stopBlockBridge(): void {
  if (!server) return;
  server.close();
  server = null;
  listeningPort = null;
}
