# PayPal Standard Checkout — v5 vs v6

A sandbox comparison app for a single $10 USD product ("Classic Cotton Tee"), rendered
side by side across every combination of PayPal's JS SDK v5 and v6, with and without
Card Fields, radio-based method selection, and Basic Apple Pay.

The landing page (`public/index.html`) embeds ten variations, each in its own `<iframe>`
and numbered 01–10 for easy reference:

| # | File | What it demonstrates |
|---|------|----------------------|
| 01 | `v5.html` | JS SDK v5 — Buttons only (PayPal + Card) |
| 02 | `v6.html` | JS SDK v6 — Web Components |
| 03 | `v6-card-fields.html` | JS SDK v6 — PayPal Button + Card Fields |
| 04 | `v6-radio.html` | JS SDK v6 — Radio: PayPal or Card (custom icons) |
| 05 | `v6-apple-pay.html` | JS SDK v6 — Basic Apple Pay |
| 06 | `v5-applepay.html` | JS SDK v5 Radio (PayPal + Card) + Basic Apple Pay (v6), with real Marks |
| 07 | `v6-radio-applepay.html` | JS SDK v6 Radio (PayPal + Card) + Basic Apple Pay |
| 08 | `v5-applepay-buttons.html` | JS SDK v5 Buttons (PayPal + Card) + Basic Apple Pay (v6) |
| 09 | `v6-applepay.html` | JS SDK v6 Web Components + Basic Apple Pay |
| 10 | `v6-card-fields-applepay.html` | JS SDK v6 PayPal Button + Card Fields + Basic Apple Pay |

Each page loads its SDK independently and reports its own height to the parent page via
`postMessage`, so the iframes can be viewed and compared without one variation's script
errors affecting another.

## Setup

1. Install dependencies (none beyond Node itself — no `node_modules` required):
   ```
   npm install
   ```
2. Create a `.env` file in the project root with your PayPal sandbox credentials:
   ```
   PAYPAL_CLIENT_ID=your-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-sandbox-client-secret
   PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
   PORT=3000
   ```
   `PAYPAL_API_BASE` and `PORT` are optional and fall back to the sandbox API and `3000`
   respectively. `.env` is gitignored — never commit real credentials.
3. Start the server:
   ```
   npm start
   ```
4. Open `http://localhost:3000`.

## How it works

`server.js` is a dependency-free Node `http` server that does two things:

- Serves static files from `public/`.
- Exposes a small JSON API that each demo page calls into:
  - `GET /api/config` — returns the sandbox client ID (for JS SDK v5, which takes it in
    the script URL).
  - `GET /api/client-token` — returns a browser-safe client token (for JS SDK v6, which
    authenticates via `createInstance({ clientToken })`).
  - `POST /api/orders` — creates a $10 USD order via the Orders v2 API.
  - `POST /api/orders/:id/capture` — captures a previously created order.

`paypal-client.js` handles OAuth (client-credentials grant) and wraps calls to the
PayPal REST API. `load-env.js` is a minimal `.env` parser (no third-party dependency).

## Notes

- **Apple Pay requires HTTPS.** `ApplePaySession` refuses to run on an insecure document,
  and Safari does not exempt `localhost` for this API — every Apple Pay iframe (05–10)
  will show a graceful "not available" note rather than opening a payment sheet when run
  locally over plain HTTP. Test Apple Pay against a deployed HTTPS URL (e.g. the Render
  deployment this repo is configured for).
- **v6 has no SDK-provided brand mark for PayPal or Card**, unlike v5's `paypal.Marks()`.
  Iframes 04, 07, 09, and 10 use custom-drawn SVG placeholders for those two marks; only
  Apple Pay has a real brand mark element (`<apple-pay-mark>`) in v6, via the separate
  `web-sdk/v6/brand` bundle.
- Iframes 03/04/07/10 use v6's **Advanced Card Payments** (`card-fields` component,
  `advanced_cards` eligibility) — not the `paypal-guest-payments` / `card` eligibility
  path used in 01/02/06/08/09, which is PayPal's own hosted card-entry overlay.

## Deployment

`package.json` is set up for a plain Node deployment (e.g. Render): `npm start` runs
`node server.js`, which reads `PORT` from the environment.
