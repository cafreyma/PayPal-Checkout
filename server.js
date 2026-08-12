const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");
const { paypalFetch, getClientToken } = require("./paypal-client");

loadEnv(".env");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function serveStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
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

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (pathname === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, { clientId: process.env.PAYPAL_CLIENT_ID });
    }

    if (pathname === "/api/client-token" && req.method === "GET") {
      const accessToken = await getClientToken();
      return sendJson(res, 200, { access_token: accessToken });
    }

    if (pathname === "/api/orders" && req.method === "POST") {
      const order = await paypalFetch("/v2/checkout/orders", {
        method: "POST",
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "10.00" },
              description: "Classic Cotton Tee",
            },
          ],
        }),
      });
      return sendJson(res, 200, order);
    }

    const captureMatch = pathname.match(/^\/api\/orders\/([^/]+)\/capture$/);
    if (captureMatch && req.method === "POST") {
      const orderID = captureMatch[1];
      const capture = await paypalFetch(`/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
      });
      return sendJson(res, 200, capture);
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err.details || err);
    return sendJson(res, 500, { error: err.message, details: err.details });
  }
});

server.listen(PORT, () => {
  console.log(`PayPal sandbox checkout server running at http://localhost:${PORT}`);
});
