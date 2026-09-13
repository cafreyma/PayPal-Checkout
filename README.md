# PayPal Checkout — PayPal, Card & Basic Apple Pay (sandbox + production)

A small Node app that sells one T-shirt ("Classic Cotton Tee") in **SGD** and offers
**PayPal**, **Credit / Debit Card** and **Basic Apple Pay** through two independent
integrations of the same order:

| Variant | PayPal | Card | Apple Pay |
|---|---|---|---|
| **A — JS SDK v5 + v6** | v5 `Buttons({ fundingSource: PAYPAL })` | v5 `Buttons({ fundingSource: CARD })` | v6 `applepay-payments` |
| **B — JS SDK v6 only** | v6 `paypal-payments` | v6 `paypal-guest-payments` | v6 `applepay-payments` |

Both variants render on the same checkout page, so a full test is two payments — one
through each variant.

Apple Pay follows **Basic Apple Pay — Integration Guide v1.2**; where that guide differs
from the older pages in this repo, the guide wins. In particular: the SDK-provided
`<apple-pay-mark>` is display-only and checkout is triggered by a separate button, and the
mark is rendered only after **both** `isEligible("basic_apple_pay")` and
`canMakePayments()` pass.

## Pages

| Path | What it is |
|---|---|
| `/` | Landing page — choose **Sandbox** or **Production**, and set the amount (S$0.01–S$10.00) |
| `/checkout.html?env=…&amount=…` | The checkout page, showing Variant A and Variant B side by side |
| `/compare.html` | The older 10-iframe v5-vs-v6 comparison page (now S$0.10 SGD) |

The landing page just builds the query string; `/checkout.html` can be linked directly:

```
/checkout.html?env=sandbox&amount=2.50
/checkout.html?env=live&amount=0.01
```

Add `&force=1` to render the Apple Pay mark and button even when the eligibility or
device checks fail — useful for diagnosing why Apple Pay is hidden. Without it the page
follows the guide and hides Apple Pay, showing the reason instead.

## Environments

Both environments are served by the same deployment; the `env` query parameter selects
which credentials, Orders API host and JS SDK host are used.

| | Sandbox | Production |
|---|---|---|
| Credentials | `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | `PAYPAL_LIVE_CLIENT_ID` / `PAYPAL_LIVE_CLIENT_SECRET` |
| Orders API | `https://api-m.sandbox.paypal.com` | `https://api-m.paypal.com` |
| JS SDK v6 host | `https://www.sandbox.paypal.com` | `https://www.paypal.com` |
| JS SDK v5 host | `https://www.paypal.com/sdk/js` (environment comes from the client ID) | same |

> **Production captures real money.** The checkout page shows a red banner in that mode.
> Keep test amounts at S$0.01 unless you mean it.

## Setup

1. No dependencies to install — the server uses only Node built-ins (Node 18+ for `fetch`).
2. Create `.env` in the project root (it is gitignored — never commit credentials):
   ```
   PAYPAL_CLIENT_ID=your-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-sandbox-client-secret
   PAYPAL_LIVE_CLIENT_ID=your-live-client-id
   PAYPAL_LIVE_CLIENT_SECRET=your-live-client-secret
   PORT=3000
   ```
   `PAYPAL_API_BASE` is still honoured as an override for the sandbox API host.
   If the live pair is missing, `/` still works and the sandbox page still works — the
   production page returns a clear 503 explaining which variables to set.
3. `npm start`, then open `http://localhost:3000`.

## Deployment (Render)

This is a **Node web service**, not a static site — it cannot be a static page, because
the client secret, the `intent=sdk_init` client token, order creation and capture all have
to happen server side. Because there is a server, the amount selector works: the chosen
amount travels to `POST /api/orders` and is re-validated there.

`npm start` runs `node server.js`, which reads `PORT` from the environment. Set these
environment variables in the Render dashboard:

```
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_LIVE_CLIENT_ID        <- add this
PAYPAL_LIVE_CLIENT_SECRET    <- add this
```

## API

All endpoints take `?env=sandbox` (default) or `?env=live`.

| Endpoint | Purpose |
|---|---|
| `GET /api/config` | Client ID, SDK host, currency, country and amount bounds for the environment |
| `GET /api/client-token` | Browser-safe token (`response_type=client_token&intent=sdk_init`) for v6 `createInstance` |
| `POST /api/orders` | Creates a `CAPTURE` order. Body `{ "amount": "1.25" }`; amount is clamped to S$0.01–S$10.00 server side and defaults to S$0.10 when omitted |
| `POST /api/orders/:id/capture` | Captures the order |

`paypal-client.js` resolves the environment and handles OAuth; `load-env.js` is a minimal
`.env` parser (no third-party dependency).

## Notes

- **Apple Pay requires HTTPS and Safari.** `canMakePayments()` throws on an insecure
  origin, and Safari does not exempt `localhost`, so Apple Pay will be hidden with an
  explanatory note when you run locally over plain HTTP. Test it on the deployed HTTPS URL,
  in Safari, on a Mac or iOS device with a card in Wallet.
- **No Apple domain registration is needed.** Basic Apple Pay runs in a PayPal-hosted
  popup on PayPal's own already-registered domain.
- **Apple Pay eligibility is per merchant and region.** If `isEligible("basic_apple_pay")`
  is false, the merchant account is not enabled for Basic Apple Pay in SGD/SG — that is an
  account setting, not a code problem. Use `&force=1` to confirm what the SDK is reporting.
- **v6 ships no PayPal or Card brand mark**, unlike v5's `paypal.Marks()`. Variant B draws
  those two marks locally; only `<apple-pay-mark>` is a real SDK element (from the `brand`
  bundle).
- Variant A loads v5 and v6 on the same page using `data-namespace` (`paypalV5` /
  `paypalV6`) so the two SDKs don't collide on `window.paypal`, per guide §1.1.
