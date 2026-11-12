# The Pioneer Forest — Pi Network App

[![Pi Network](https://img.shields.io/badge/Pi%20Network-Community%20App-blue)](https://minepi.com)
[![Tree-Nation](https://img.shields.io/badge/Reforestation-Tree--Nation-forestgreen)](https://tree-nation.com)
[![Website](https://img.shields.io/badge/Website-thepioneerforest.org-brightgreen)](https://thepioneerforest.org)
[![Environment](https://img.shields.io/badge/Environment-Pi%20Testnet-orange)](https://thepioneerforest.org)

**The Pioneer Forest (TPF)** is an independent, community-driven environmental initiative built for the Pi Network ecosystem.

This repository hosts the source code for the official **Pi Browser application**, maintained and published in the open to provide full transparency, verifiable security, and open accounting for Pioneers and the broader community.

---

## 🌲 About The App

The app runs natively within the **Pi Browser** mobile environment, connecting community participation on the Pi Network with real-world ecological restoration.

* **Pi Authentication (SDK 2.0):** Native Pioneer sign-in using verified, app-specific Pi UIDs and requested scopes (`username`, `payments`, `wallet_address`).
* **Persistent "My Forest" Ledger:** A tamper-resistant personal activity record tracking community support with exact 7-decimal accounting, accessible across devices.
* **Testnet Welcome Reward:** An automated App-to-User (A2U) token distribution mechanism built with native Pi blockchain transaction signing (`@stellar/stellar-sdk`) to reward participating Pioneers directly to their non-custodial wallet.
* **Real-World Impact Sync:** Real-time visibility into global planting totals and estimated CO₂ capture, linked to verified planting records from independent providers like **Tree-Nation**.

---

## 🛡️ Security & Privacy Guarantees

Trust and safety are foundational to The Pioneer Forest:

* **Non-Custodial:** The app **never** asks for, accesses, logs, or stores your 24-word Pi Wallet passphrase or private keys. All transaction authorizations happen strictly within the official Pi Wallet interface.
* **Server-Verified Sessions:** User authentication tokens are validated directly against the official Pi Platform API (`/v2/me`) and kept strictly in memory.
* **Durable Payment Protection:** Serverless payment verification utilizes pre-completion recovery receipts and duplicate-payment fences to protect against lost network requests or double-spends.
* **Privacy-First:** Zero invasive third-party trackers or cross-site tracking scripts.

---

## 📱 How Pioneers Access The App

Because this is a dedicated Web3 application integrated with the Pi blockchain, **it is designed to run exclusively inside the Pi Browser mobile app**:

1. Open the **Pi Browser** application on your mobile device.
2. Navigate to the registered TPF app URL (or access it directly through the Pi Developer Portal / Ecosystem directory).
3. Sign in with your Pi account when prompted.

*(Opening the application outside the Pi Browser in a standard desktop or mobile browser will prompt you to reopen it within the Pi Browser to access wallet and authentication features.)*

---

## 📜 Independence & Notice

* **Independent Project:** The Pioneer Forest is an independent community initiative created and operated by **egal42**. It is not officially affiliated with or endorsed by the Pi Core Team.
* **Participation Notice:** Testnet features, Test Pi transactions, and community rewards are for testing participation flows and do not represent financial investments or real-world monetary value.
* **Legal & Transparency:** Full terms of service, privacy disclosures, and transparency methodology are embedded directly within the app and accessible at all times.

---

## 🌐 Project Links & Community

* **Official Website:** [thepioneerforest.org](https://thepioneerforest.org)
* **Pi Fireside Forum:** [#ThePioneerForest](https://fireside.pinet.com/channels/ThePioneerForest)
* **Creator / Developer:** [egal42](https://github.com/egal42)
* **Enquiries:** `egal42.pi@gmail.com`
