// Environment-aware PayPal REST client.
//
// Two environments are supported side by side so the same deployment can serve
// a sandbox checkout page and a live one:
//
//   sandbox -> PAYPAL_CLIENT_ID      / PAYPAL_CLIENT_SECRET
//   live    -> PAYPAL_LIVE_CLIENT_ID / PAYPAL_LIVE_CLIENT_SECRET
//
// Secrets only ever live in the environment — never in the browser.

const ENVIRONMENTS = {
  sandbox: {
    apiBase: "https://api-m.sandbox.paypal.com",
    // Host that serves the JS SDK v6 core/brand bundles for this environment.
    sdkHost: "https://www.sandbox.paypal.com",
    clientIdVar: "PAYPAL_CLIENT_ID",
    clientSecretVar: "PAYPAL_CLIENT_SECRET",
  },
  live: {
    apiBase: "https://api-m.paypal.com",
    sdkHost: "https://www.paypal.com",
    clientIdVar: "PAYPAL_LIVE_CLIENT_ID",
    clientSecretVar: "PAYPAL_LIVE_CLIENT_SECRET",
  },
};

function resolveEnv(name) {
  const key = name === "live" || name === "production" ? "live" : "sandbox";
  const config = ENVIRONMENTS[key];

  // sandbox keeps honouring PAYPAL_API_BASE for backwards compatibility with
  // the original single-environment setup.
  const apiBase =
    key === "sandbox" ? process.env.PAYPAL_API_BASE || config.apiBase : config.apiBase;

  const clientId = process.env[config.clientIdVar];
  const clientSecret = process.env[config.clientSecretVar];

  if (!clientId || !clientSecret) {
    const err = new Error(
      `Missing credentials for the ${key} environment. Set ${config.clientIdVar} and ${config.clientSecretVar}.`
    );
    err.statusCode = 503;
    throw err;
  }

  return { key, apiBase, sdkHost: config.sdkHost, clientId, clientSecret };
}

function basicAuth({ clientId, clientSecret }) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function requestToken(env, body) {
  const response = await fetch(`${env.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(env)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal token request failed (${env.key}): ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Server-side token used for the Orders v2 API.
function getAccessToken(env) {
  return requestToken(env, "grant_type=client_credentials");
}

// Browser-safe token used by JS SDK v6's createInstance({ clientToken }).
function getClientToken(env) {
  return requestToken(
    env,
    "grant_type=client_credentials&response_type=client_token&intent=sdk_init"
  );
}

async function paypalFetch(env, path, options = {}) {
  const accessToken = await getAccessToken(env);
  const response = await fetch(`${env.apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`PayPal API error (${env.key}): ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

module.exports = { resolveEnv, paypalFetch, getClientToken, ENVIRONMENTS };
