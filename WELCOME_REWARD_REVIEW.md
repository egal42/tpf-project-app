# TPF Testnet Welcome Reward — v0.9.9 local recovery candidate

Status: implemented and tested locally; NOT deployed. Existing live v0.9.6 is unchanged.

## Behavior

- After existing Pi SDK login, the server checks Pi `/me`. Claiming requires an explicit button press; logging in never sends Pi automatically.
- Amount is fixed server-side at **0.2 Test Pi**. The client cannot choose an amount, recipient, wallet, payment identifier, campaign or network.
- One claim per verified app-specific Pi UID; a second guard based on the verified, normalized Pi username prevents an ordinary permission-revocation/new-UID repeat. Normal username changes still match the original UID.
- The round ends after **20 confirmed successful rewards**. The payout total is at most **4 Test Pi**, excluding transaction fees. A pending request does not count as successful, but reserves the active wallet slot until reconciled.
- Home shows eligibility, processing/retry state and exhaustion. My Forest has a separate welcome reward receipt with amount, payment ID, transaction ID, completion time, network and direction. Existing support-payment totals and real trees/CO₂ are never increased by rewards.
- Browser tokens and signing secrets are not persisted in client storage. No secret or signed XDR is returned in a reward status response.

## Official Pi A2U integration

Implements the official Pi Platform protocol: `POST /v2/payments` with `{payment: {amount, memo, metadata, uid}}`, read the official payment DTO, sign/submit to Pi Testnet, `POST /payments/{id}/complete`, then read Pi's final payment again. The payment must match the verified UID, campaign, claim ID, 0.2 amount, app-to-user direction, app wallet and Pi Testnet. Both transaction verification flags, developer completion and matching blockchain hash are required before success.

The official Stellar SDK (`@stellar/stellar-sdk` 17.2.1, pinned) builds the native-asset transfer using the `Pi Testnet` passphrase and payment ID as memo, as in Pi's own Node SDK. The signer checks its public key, both live accounts, chain network and base fee. There are no configurable Mainnet URLs or Mainnet execution path. Unlike a one-shot `submitPayment` call, signed XDR and its hash are saved **before broadcast**, so a serverless retry cannot accidentally build/pay a second transaction.

Sources inspected:

- https://github.com/pi-apps/pi-nodejs/blob/main/README.md
- https://github.com/pi-apps/pi-nodejs/blob/main/src/index.ts
- https://github.com/pi-apps/pi-sdk-integration-guide
- https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md
- https://docs.netlify.com/build/data-and-storage/netlify-blobs/

## Durable state and recovery

The bounded campaign journal lives at `welcome/campaign-v1` in the existing context-isolated Netlify Blobs store. It does not alter any user-to-app ledger keys. Atomic `onlyIfNew`/ETag `onlyIfMatch` operations plus strong readback guard every state change. Success count is derived from completed claim records, rather than an independently updated counter. The journal holds at most 20 claims, with at most one active payout across requests/instances to serialize app-wallet sequence numbers. This is a deliberately small pilot; a larger program should use a transactional store/queue instead of expanding the blob journal indefinitely.

Phases: reserved → creating → created → building → signed → completed.

- Reservation and `creating` are durable before Pi payment creation. If its response is lost, retries query Pi's incomplete A2U payments and match exact campaign/claim metadata. v0.9.9 permits one explicit recovery create only when the claim has no payment ID or signed XDR, has remained in creating for at least 120 seconds, and Pi returns no incomplete payments at all. The same claim ID and audit record are retained. Atomic create-owner fencing prevents late responses from selecting another payment or reaching signing. Known API rejections retain a retryable reserved claim and a whitelisted rejection code.
- The payment ID is durable before signing. Signing uses a fenced owner token: an interrupted signer cannot later overwrite another instance's signed transaction.
- Signed transaction bytes/hash are durable before broadcast. Retries look up the hash and, if needed and still valid, broadcast the **same bytes**. Blockchain sequence/hash rules prevent a second payment from that replay.
- If broadcast/completion succeeds but a response or final record write is lost, Check reward reconciles the same hash/payment and finalizes the existing claim.
- If the outcome cannot be established, a payment is cancelled, or the signed transaction expires without a confirmed chain result, the claim stays pending and the campaign pauses for review. It does not silently consume a successful-claim count or automatically substitute a new transfer. This favors avoiding duplicate payouts over automatic availability.
- Status GETs are read-only; they do not create, sign or broadcast. Check reward on a pending claim explicitly resumes the same pipeline.

### Operator review for an unresolved claim

Do not delete/reset the journal, remove its active claim, or create a replacement payment to get past a pending state. That can defeat duplicate protection. Inspect the private journal's phase, claim ID, official payment ID and saved transaction hash; compare Pi's payment/incomplete-payment API and Testnet transaction lookup. A known submitted transaction must be completed/reconciled, never replaced. If no safe outcome is provable, keep payouts paused. The bounded unsigned-creation recovery described above runs only on an explicit POST, never on a status read. No automatic rebuilding after submission is provided.

Pi UID is app-specific and can change when permissions are revoked. The additional username guard covers an unchanged verified username, but Pi's available identity fields cannot prove universal identity after **both** a rename and permission reset. Such identity changes require separate verified review; this app does not claim device/IP-based or human-identity guarantees.

## Deployment requirements — no deployment authorized yet

Use the existing app's Testnet developer wallet and API key, not TPF's public Mainnet treasury wallet. Configure the following only as server/Functions environment variables in the intended production deploy context:

| Setting | Required value |
| --- | --- |
| `PI_API_KEY` | Existing Pi server API key for this app |
| `PI_A2U_NETWORK` | Exactly `Pi Testnet` |
| `PI_A2U_TESTNET_PUBLIC_KEY` | Public key of this app's Testnet A2U wallet |
| `PI_A2U_TESTNET_SEED` | Matching app-wallet signing seed, securely entered server-side |
| `TPF_WELCOME_REWARD_ENABLED` | `true` only when ready to enable the pilot; otherwise absent/`false` |

Never paste the seed/API key into chat, commit them, or add them to client/build assets. `.env.example` contains placeholders only; real `.env` files remain ignored. Public impact caching remains unchanged. No scheduled jobs, polling, always-running database, new portal configuration or website/Ops Center changes.

The function only enables real rewards in Netlify's **production deploy context**, with the complete explicit Testnet configuration. Branch deploys/previews cannot pay real rewards. An unset feature flag or missing configuration keeps the UI disabled. Turning the flag off also prevents pending claims from resuming transfers. Do not use another A2U worker against this same app wallet during this serialized pilot.

Fund the app's Testnet wallet sufficiently for 4 Test Pi of rewards, fees and its required account reserve. No live payout, real wallet signing or Netlify configuration was performed during local testing.

After approval, perform one controlled real A2U smoke check, repeat the same user's claim to verify no duplicate transfer, confirm the receipt from a second session, and ensure the existing support flow still works. This first real smoke claim counts toward the 20; do not reset the journal afterward.

## Local validation and preview

`npm ci`, then `npm run preview` (or `START-PREVIEW.cmd` on Windows). Open http://127.0.0.1:4173/. The visible simulation banner identifies the environment. Login, click Claim on Home, then inspect My Forest. The local fake Pi/chain and atomic file journal persist in ignored `.local-preview/`, survive browser clearing/restarts, and make **no real Pi transfers**. Local data never ships in the static publish bundle.

`npm test` covers server policy, cap/concurrency, identity protection, phase fencing, storage failures, wrong network/owner/amount/recipient, official API envelope, signatures/memo/hash and lost create/submit/complete responses. Browser tests cover explicit claiming, durable receipts across contexts/server restarts, separate contribution totals/impact, safe retry and reward-service outages alongside all v0.9.6 regression scenarios. Browser checks use the real application UI and a simulated Pi backend.

Local success is not a substitute for the first genuine Pi/Netlify A2U test. The existing approved legal text is unchanged; reward-specific coverage should be reviewed before broader rollout.

### Completed checks

- 48 unit/integration tests passed, including all prior account/history/impact checks.
- 22 browser scenarios passed, including all prior v0.9.6 regression scenarios and 4 reward flows.
- 6 additional signing/adapter checks passed against the function produced by Netlify's official packaging tool.
- Static production build passed; browser assets retain content fingerprints; server code, simulation data and signing configuration are excluded.
- `npm audit --omit=dev --audit-level=high`: 0 known vulnerabilities.
- Pi SDK initialization, original U2A server handlers, validation key, logo, manifest and embedded approved legal text were preserved. Login adds wallet_address consent for A2U. The server verifies this scope before reserving or recovering a claim.

## v0.9.9 investigation

Observed production claim: creating, no paymentId, no signed transaction; Pi lookup returns zero matches. Original create error was not retained, so its cause is not proven. Code inspection found login omitted wallet_address. Official SDK reference documents that scope and advanced A2U docs require recipient wallet-sharing consent. Fix requests consent, preflights server-verified scopes, preserves recognized rejection codes without bodies/secrets, and adds bounded recovery without deleting claim history. No claim is reset by deployment or GET.

Sources: https://github.com/pi-apps/pi-platform-docs/blob/master/SDK_reference.md ; https://github.com/pi-apps/pi-platform-docs/blob/master/payments_advanced.md ; https://github.com/pi-apps/pi-nodejs/blob/main/src/index.ts ; https://github.com/pi-apps/pi-nodejs/blob/main/src/types/errors.ts

## v0.9.9 hash fix and signed-claim migration

Production screenshot revealed signed.txid was a comma-separated byte list. Stellar SDK 17 returns Uint8Array for hash(); toString('hex') does not hex-encode that type. All transport hash conversion now explicitly uses Buffer.from(hash).toString('hex'). Tests require 64 lowercase hexadecimal characters, independently of mock hash generation.

repair validates the stored envelope's sender, recipient, amount, memo, signature and time bounds. A legacy byte-list ID must exactly equal the envelope hash bytes before canonicalization. An unexpired envelope keeps identical bytes. If expired, only this legacy migration may renew once, on explicit POST, for the same Pi payment ID. It requires a closed ledger past the old expiry, fully indexed through Core's latest ledger, and an original canonical hash lookup returning 404 after that proof. Existing successful original transactions are reconciled without renewal; linked, failed or uncertain outcomes pause. Both original signed data and replacement are journaled atomically before submission. Ordinary expired transactions remain paused. No claim/payment record is deleted, and the campaign cap is unchanged.

Horizon errors expose only a fixed allowlist of result codes; no raw response, envelope or secret is returned. Existing support payment handlers and account ledger are unchanged. Tests cover legacy migration, expiry/indexing/lookup failures, no renewal of confirmed originals, one-time renewal and journal-write failure before submission.
