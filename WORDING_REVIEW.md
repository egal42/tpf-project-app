# App wording review — v0.9.10 (local, not deployed)

Reviewed the active app entry page, all four sections, login/sign-out, amount selection, payment approval/completion/cancellation/retry, account history and older-record recovery, reward states and recovery errors, public impact loading, and embedded legal navigation.

## Changes prepared

- Reward actions now distinguish **Claim 0.2 Test Pi**, **Continue reward transfer**, and **Refresh status**. Refresh only reads; continuing resumes the existing reward.
- Pending messages explain what happened and the next action. Cases needing operator review ask the Pioneer to contact TPF rather than repeatedly retry.
- Reward stage, HTTP and blockchain codes remain available under expandable help instead of appearing in the main status message. They clear on sign-out.
- Loading labels distinguish reading status from sending a reward.
- My Forest identifies Test Pi **sent to TPF** separately from the welcome reward **received from TPF**. Records are described as stored by TPF and linked to the Pi account, rather than stored inside the Pi account itself.
- Support explains that it sends Test Pi to the app. Confirmation messages and the retry button use matching wording.
- Sign-in instructions explain the permissions Pi may ask for. Startup, empty-history and sign-out messages use plain language.

## Existing issues for a separate decision

1. Sign-in times out after 12 seconds, including time spent on Pi’s permission screen. This was observed during live testing. A longer allowance deserves a separate change and a delayed-consent test.
2. The embedded transparency document mentions an Impact page “on this site”, and contains several plain-text references where the website has links. Review app-specific navigation and links separately; the approved legal text was left unchanged.
3. No automatic version/update checker exists. Fingerprinted asset URLs help after the entry page reloads, but do not refresh an already-open app.
4. Blockchain explorer labels and Pi-owned wallet/permission dialogs are outside this app’s control. The explorer screenshot confirms an outgoing 0.2 Test Pi payment from the app wallet; its “Pay…” wording cannot be rewritten here.

## Scope and validation

Payment validation, signing, duplicate protection, journals, amounts, reward limits, network settings and storage namespaces are unchanged. No new dependency, background polling or Netlify invocation was added. Only local mock/synthetic tests were used; no new live payment was sent.

Validation completed: 63 backend tests and 23 browser scenarios passed. Static build, JavaScript syntax checks and whitespace checks passed. Mobile screenshots for login, Home, Support, My Forest and About were inspected. Live Pi/Netlify behavior was not retested for this local wording update.
