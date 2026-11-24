const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const rootDir = __dirname;
const dataFile = path.join(rootDir, "names.json");
const port = Number(process.env.PORT) || 5173;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sanitizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
}

async function ensureDataFile() {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]\n", "utf8");
  }
}

async function readNames() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw || "[]");

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => {
      if (typeof entry === "string") {
        return { id: crypto.randomUUID(), value: sanitizeName(entry) };
      }

      return {
        id: String(entry?.id || crypto.randomUUID()),
        value: sanitizeName(entry?.value),
      };
    })
    .filter((entry) => entry.value);
}

async function writeNames(names) {
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(names, null, 2)}\n`, "utf8");
  await fs.rename(tempFile, dataFile);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 100_000) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/names") {
    sendJson(response, 200, await readNames());
    return;
  }

  if (request.method === "POST" && pathname === "/api/names") {
    const body = await readBody(request);
    const payload = JSON.parse(body || "{}");
    const value = sanitizeName(payload.value);

    if (!value) {
      sendJson(response, 400, { error: "Name is required" });
      return;
    }

    const names = await readNames();
    const name = { id: crypto.randomUUID(), value };
    names.push(name);
    await writeNames(names);
    sendJson(response, 201, name);
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/names/")) {
    const id = decodeURIComponent(pathname.replace("/api/names/", ""));
    const names = await readNames();
    const nextNames = names.filter((name) => name.id !== id);

    if (nextNames.length === names.length) {
      sendJson(response, 404, { error: "Name not found" });
      return;
    }

    await writeNames(nextNames);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function serveStatic(request, response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(rootDir, safePath));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }

    await serveStatic(request, response, pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`Spin Picker running at http://localhost:${port}`);
});
