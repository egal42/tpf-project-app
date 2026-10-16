# The Pioneer Forest Pi Testnet app — v0.9.4

Based on v0.9.1b (`d3db6d5`). Deployment of v0.9.4 approved on 16 October 2026. Local validation is complete; genuine Pi/hosted storage smoke checks follow deployment.

## Local preview

Requires Node.js **22.12 or later**. Double-click `START-PREVIEW.cmd` on Windows, or run `npm run preview`, then open http://127.0.0.1:4173/.

The preview simulates Pi login and Pi’s API. It runs the actual account/payment application service and saves its simulated account records to `.local-preview/` on this computer. Records survive browser clearing, another browser, and restarting the server. No Pi API or wallet transfer occurs. Preview data is not included in Git or the download package. The live impact reader uses the existing public TPF summary, cached without polling. The inline/chat preview is an independent UI simulation; it cannot connect to the account backend.

`npm start` serves the real SDK frontend for inspection but does not allow real local account/payment API requests. Real Pi integration uses the existing configured Pi Browser/Sandbox and Netlify environment. Developer Portal settings are unchanged.

## Persistent My Forest

- SDK setup remains `version: 2.0`, `sandbox: true`, with `username` and `payments` scopes. Existing memo, payment metadata and endpoint URLs are retained.
- The server validates the Bearer access token using Pi `/me` on every account/payment request. Tokens stay in frontend memory and are not logged or persisted.
- Account keys use the **verified app-specific Pi UID**, not an editable username. A normal username change does not detach the history.
- Before approval/completion the server reads Pi’s payment DTO and checks ownership, `Pi Testnet`, `user_to_app`, cancellation, amount and transaction match. Client-supplied username/amount never determine the record.
- A durable recovery receipt is saved **before** calling Pi `/complete`. A verified completed payment is then stored as an immutable record with its payment ID, transaction ID, amount, date, network and account key.
- If Pi completes but final storage fails or the process crashes, the next authenticated history request recovers the final record from the receipt and Pi’s authoritative status. If Pi has not yet completed it, the app presents a confirmation retry instead of requesting another payment.
- Conditional create + strong readback prevents duplicated records and detects storage failures. Different simultaneous payments never update a shared counter or overwrite each other.
- My Forest totals are derived from all account payment records, with integer arithmetic at seven decimal places. No floating-point accumulation and no 25-entry cap.
- After a successful completion, account history is refreshed. Login loads the record; reopening My Forest refreshes its data if the last successful read was over a minute ago. There is no background polling. A manual refresh is available. A failed read never silently becomes zero history; last-loaded figures are explicitly marked as potentially stale.
- There is no browser control that deletes the account ledger. Clearing browser data only removes optional local data; login retrieves the account records again.
- Legacy browser entries remain untouched. “Verify older saved payments” checks their payment ID and transaction with Pi and imports only those belonging to this account, on Testnet, completed and verified. Entries without enough identifiers cannot be reconstructed automatically. They never inflate account totals.
- Real planting/CO₂ remains global public website data, separate from the Testnet payment ledger. No personal real-world impact is inferred from Test Pi.

## In-app legal and ecosystem navigation

The approved Privacy Policy and Terms are embedded locally, with unchanged visible wording. They are readable before login and from every app section. Their cross-links and Transparency & Scope stay inside the app. The return button restores the prior app screen, selected amount, scroll position and session; browser Back also closes the legal view. Direct `#privacy-policy` and `#terms-of-service` routes work without Pi login. None of these views grants access to private account data.

Public website and mailto navigation has been removed. The only remaining outbound page links are to the Pi ecosystem: the official Fireside channel and Pi Block Explorer. They open in the same browsing context. Contact email remains plain, selectable text. The app still retrieves global impact data through its cached backend reader; no website or Ops Center change is required.

`tests/approved-legal-text.json` retains the text baseline used to verify the legal integration. `scripts/embed-legal.py` is a one-time import helper that expects the approved public source snapshot alongside this repository; normal running/building does not use it.

## Hosting and cost

Uses `@netlify/blobs` **11.1.4**, pinned in `package-lock.json`. Before packaging for hosted deployment: `npm ci`. There is no database compute, scheduler, background polling, or cross-project access.

Production records use the site-wide store `tpf-project-app-testnet-v1`, so they survive normal app redeploys. Deploy previews/branch deploys use the separate `tpf-project-app-testnet-preview-v1` namespace. They never read or change production account records. The modern Netlify Function adapter obtains the actual deploy context and the automatic Blobs credentials; unknown/missing deploy context fails closed. Functions use strong consistency and private/no-store responses. No storage tokens are sent to the browser.

The payment endpoints keep their existing URLs but now use modern `.mjs` handlers to support automatic strongly consistent Blobs access. The existing `PI_API_KEY` remains server-side. Pi Developer Portal settings are unchanged. The repository now pins Node 22, bundles functions with esbuild, and publishes only browser assets from `dist/` through `netlify.toml`.

Each confirmed payment uses two small objects (receipt and final record). Reads happen on login, explicit refresh, completion and manual legacy recovery. History derives totals from the per-user records rather than maintaining a transactional balance in object storage. Read work grows with the number of payments; pagination/materialized reporting can be introduced after real usage warrants it. The public impact reader retains its six-hour CDN/warm/browser caching with dated fallback.

## Verification

- `npm test`: account verification, owner/network isolation, immutable receipts, exact arithmetic, concurrent/duplicate callbacks, service restarts, write failures and recovery, legacy verification, context isolation, input limits and impact caching.
- `npm run test:browser`: installs no production dependencies; requires Playwright + a Chromium executable in the development environment. The harness launches its own local server and isolated temporary account store. Set `CHROMIUM_PATH` if needed.
- Browser tests include a payment, closing the browser context, clearing browser storage, restarting the preview server, and logging in again with the same history; another account sees no records.

## Release checks and limits

- Future deployments require explicit approval. This v0.9.4 deployment was approved on 16 October 2026.
- Local tests use simulated Pi responses and disk storage. A genuine Pi Browser login, small Test Pi payment, Blobs write/read, retry and second-device login remain hosted smoke checks after an approved deployment.
- Existing older completed payments cannot be discovered from Pi’s documented U2A API without payment identifiers. Legacy recovery is user-requested, verified and limited to available IDs.
- Pi may assign a new app-specific UID after the user revokes and re-grants app permissions. Old records remain retained under the former identity; do not automatically reassociate by username. This requires a separate verified recovery process if it occurs.
- Persistent hosting is not a substitute for backups. No automatic export/backup schedule has been added. Normal redeploys preserve the ledger; deletion of the Netlify project/store would require recovery from backups.
- The main TPF website, Operations Center, Pi Developer Portal, validation key, manifest, logo and SDK initialization are untouched.

## v0.9.4 mobile diagnosis

Entry HTML uses `no-store` response headers and script/style URLs contain content fingerprints. This prevents reuse after a client fetches the updated entry document; it cannot forcibly evict an old document already retained by Pi Browser or fix an unknown alternate launch URL. No browser history, tokens, or account records are cleared.

My Forest has a collapsed Connection details section containing the current app version, verified username, a short hash of the Pi UID, and the actual record environment. It excludes access tokens and raw account IDs. This allows comparison of direct mobile/emulator/Sandbox sessions without guessing or combining records by username. The phone’s zero-history cause remains unconfirmed until those sessions can be compared.
