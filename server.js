const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");
const { resolveEnv, paypalFetch, getClientToken } = require("./paypal-client");

loadEnv(".env");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Every order on this demo is the same T-shirt, priced by the buyer on the
// landing page. The bounds are enforced here as well as in the browser — the
// amount arrives from the client and must never be trusted as-is.
const CURRENCY = "SGD";
const COUNTRY_CODE = "SG";
const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 10.0;
const DEFAULT_AMOUNT = "0.10";
const PRODUCT_NAME = "Classic Cotton Tee";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e5) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Returns a normalised "0.00" string, or throws a 400-tagged error.
function normaliseAmount(raw) {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    const err = new Error(`Amount must be a number between ${MIN_AMOUNT} and ${MAX_AMOUNT}.`);
    err.statusCode = 400;
    throw err;
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded < MIN_AMOUNT || rounded > MAX_AMOUNT) {
    const err = new Error(
      `Amount must be between ${MIN_AMOUNT.toFixed(2)} and ${MAX_AMOUNT.toFixed(2)} ${CURRENCY}.`
    );
    err.statusCode = 400;
    throw err;
  }
  return rounded.toFixed(2);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const envName = url.searchParams.get("env");

  try {
    // Client ID + SDK host for the requested environment. The v5 SDK takes the
    // client ID in its script URL; v6 needs to load core/brand from the host
    // matching the environment.
    if (pathname === "/api/config" && req.method === "GET") {
      const env = resolveEnv(envName);
      return sendJson(res, 200, {
        env: env.key,
        clientId: env.clientId,
        sdkHost: env.sdkHost,
        currency: CURRENCY,
        countryCode: COUNTRY_CODE,
        minAmount: MIN_AMOUNT.toFixed(2),
        maxAmount: MAX_AMOUNT.toFixed(2),
        defaultAmount: DEFAULT_AMOUNT,
        productName: PRODUCT_NAME,
      });
    }

    // Step 2 of the Basic Apple Pay guide: browser-safe client token
    // (grant_type=client_credentials&response_type=client_token&intent=sdk_init).
    if (pathname === "/api/client-token" && req.method === "GET") {
      const env = resolveEnv(envName);
      const accessToken = await getClientToken(env);
      return sendJson(res, 200, { access_token: accessToken });
    }

    if (pathname === "/api/orders" && req.method === "POST") {
      const env = resolveEnv(envName);
      const body = await readBody(req);
      const parsed = body ? JSON.parse(body) : {};
      // The legacy comparison pages post no body; they get the default amount.
      const requested =
        parsed.amount === undefined || parsed.amount === null || parsed.amount === ""
          ? DEFAULT_AMOUNT
          : parsed.amount;
      const amount = normaliseAmount(requested);

      const order = await paypalFetch(env, "/v2/checkout/orders", {
        method: "POST",
        body: JSON.stringify({
          // Basic Apple Pay only supports CAPTURE.
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: { currency_code: CURRENCY, value: amount },
              description: PRODUCT_NAME,
            },
          ],
        }),
      });
      return sendJson(res, 200, order);
    }

    const captureMatch = pathname.match(/^\/api\/orders\/([^/]+)\/capture$/);
    if (captureMatch && req.method === "POST") {
      const env = resolveEnv(envName);
      const capture = await paypalFetch(env, `/v2/checkout/orders/${captureMatch[1]}/capture`, {
        method: "POST",
      });
      return sendJson(res, 200, capture);
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err.details || err);
    return sendJson(res, err.statusCode || 500, {
      error: err.message,
      details: err.details,
    });
  }
});

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`PayPal checkout demo running at http://localhost:${PORT}`);
});
