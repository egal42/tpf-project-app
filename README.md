# The Pioneer Forest — Pi Network App

[![Pi Network](https://img.shields.io/badge/Pi%20Network-Ecosystem-blue)](https://minepi.com)
[![Tree-Nation](https://img.shields.io/badge/Reforestation-Tree--Nation-forestgreen)](https://tree-nation.com)
[![Status](https://img.shields.io/badge/Status-Testnet%20Preview-brightgreen)](https://thepioneerforest.org)

**The Pioneer Forest (TPF)** is an independent, community-driven environmental initiative built for the Pi Network ecosystem. This repository contains the official Pi Browser application, allowing Pioneers to explore reforestation milestones, track verified tree planting, participate in ecological support journeys, and claim community welcome rewards.

---

## 🌲 Key Features

* **Pi Network Authentication:** Native sign-in through Pi SDK 2.0 with app-specific UID validation and secure session handling.
* **Persistent "My Forest" Dashboard:** Cross-device activity ledger tracking contributions and certificates with seven-decimal exact arithmetic.
* **Testnet Welcome Reward:** Integrated App-to-User (A2U) reward distribution distributing Test Pi directly to verified Pioneer wallets.
* **Verified Global Impact:** Real-time visibility into trees planted and estimated CO₂ capture backed by independent planting providers like **Tree-Nation**.
* **Durable Payment Flow:** Resilient serverless architecture with pre-completion recovery receipts, duplicate protection, and transaction verification against the Pi Platform API.
* **Security & Privacy by Design:** 
  * Strict zero-knowledge wallet policy — **TPF never asks for, logs, or stores wallet passphrases or private keys.**
  * All access tokens are validated server-side and kept strictly in memory.

---

## 🛠 Tech Stack & Architecture

* **Frontend:** Responsive client optimized for the Pi Browser (HTML5, modern CSS, modular JavaScript) with content fingerprinting to prevent mobile caching issues.
* **Serverless Backend:** Netlify Functions (`.mjs`) for payment approval, completion, and reward processing.
* **Durable Storage:** `@netlify/blobs` for strongly-consistent, atomic serverless state and receipt journals without heavy database overhead.
* **Blockchain Integration:** `@stellar/stellar-sdk` for constructing and signing native Pi blockchain A2U transactions.

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) `>= 22.12`
* npm `>= 10`

### Installation

```bash
# Clone the repository
git clone https://github.com/egal42/tpf-project-app.git
cd tpf-project-app

# Install dependencies
npm ci
```

### Local Preview

Launch the local development preview with a simulated Pi environment:

```bash
npm run preview
```

Open `http://127.0.0.1:4173/` in your browser. The simulation environment allows testing the UI, login state, and payment flows without requiring live blockchain funds.

### Running Tests

```bash
# Run unit and integration tests
npm test

# Run browser automated tests (requires Playwright)
npm run test:browser
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` for local configuration:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `PI_API_KEY` | Server-side API key from the Pi Developer Portal |
| `PI_A2U_NETWORK` | Target Pi network (e.g., `Pi Testnet`) |
| `PI_A2U_TESTNET_PUBLIC_KEY` | Public key of the app's A2U wallet |
| `PI_A2U_TESTNET_SEED` | App wallet signing seed (server-side only) |
| `TPF_WELCOME_REWARD_ENABLED` | Feature flag to enable/disable the welcome reward |

> **Security Note:** Never commit your `.env` file, API keys, or wallet seeds to version control.

---

## 📜 Legal & Transparency

The Pioneer Forest operates with complete transparency:
* **Independence:** TPF is an independent initiative developed by `egal42` and is not officially affiliated with or endorsed by the Pi Core Team.
* **Terms & Privacy:** In-app terms and privacy policies are embedded directly within the application and accessible at all times without requiring sign-in.
* **Verification:** Tree planting records, certificates, and CO₂ metrics are independently audited and published via Tree-Nation.

---

## 🌐 Community & Links

* **Official Website:** [thepioneerforest.org](https://thepioneerforest.org)
* **Pi Fireside Channel:** [#ThePioneerForest](https://fireside.pinet.com/channels/ThePioneerForest)
* **Developer / Operator:** [egal42](https://github.com/egal42)
* **Contact:** `egal42.pi@gmail.com`
