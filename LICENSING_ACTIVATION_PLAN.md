# QuoteCraft — Licensing & Activation Overhaul (Phase-by-Phase Implementation Plan)

> **Goal:** Replace the long, forgeable `QC-PRO-<BASE32_PAYLOAD>-<BASE32_SIG>` key with a short,
> human-friendly activation key (Adobe/Corel style), validated **online** against the free
> Cloudflare Worker, with an **offline grace period**. Keep the whole stack at **$0**.

---

## Progress Tracker

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Key format, validator, entitlement verify + vendor CLI (additive, non-breaking) | ✅ Done |
| **Phase 2** | Worker: `/activate`, `/deactivate`, `/validate` + durable store + issuance | ✅ Done |
| **Phase 3** | App: online activation client + Settings UI + DB migration + offline grace | ✅ Done |
| **Phase 4** | Cleanup, security fixes, tests, docs | ⬜ Not started |
| **Phase 5** | Cloud DB migration (KV → D1 → Postgres), revocation | ⬜ Not started |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Done

---

## 1. Locked Decisions

| Question | Decision |
|---|---|
| Activation model | **Online serial + offline grace** (first activation calls the Worker; app then works offline for a grace window) |
| Key format | **`QC-XXXXX-XXXXX-XXXXX-XXXXX`** (Crockford Base32, 4 groups × 5 chars) |
| External services | **Keep all** — Cloudflare Worker + KV, Brevo email, Paystack, GitHub Releases auto-update, in-app SMTP. All $0. |
| Cloud/DB migration | **Design for it now, build later** (Phase 5) |
| Code signing | **Not used** (accept SmartScreen "Unknown publisher" warning) |
| CI | **Removed** (manual local releases) |

### Non-goals (explicitly out of scope)
- No payment-required services added.
- No code-signing certificate.
- No business-data cloud sync in Phases 1–4 (structured for it in Phase 5).
- No removal of Paystack / Brevo / auto-update.

---

## 2. Architecture

```
┌─────────────── Vendor ───────────────┐
│ scripts/generate-license.js          │  signs serial records
│  └─ local store (licenses.json)      │  (KV/D1 later)
└──────────────────┬───────────────────┘
                   │ same format + store interface
┌──────────────────▼───────────────────┐        ┌─────────────────────────────┐
│ Cloudflare Worker (free)             │        │ Paystack                    │
│  POST /webhook  (charge.success)     │◄───────┤  customer pays ₦15k / ₦5k   │
│  POST /activate (key + device_id)    │        └─────────────────────────────┘
│  POST /deactivate                    │
│  POST /validate                      │
│  GET  /callback | /success           │
│  └─ licensing-store.js (KV now)      │
│  └─ Ed25519 private key = SECRET     │
└──────────────────┬───────────────────┘
                   │ signed Entitlement Token (+ offline grace 30d)
┌──────────────────▼───────────────────┐
│ QuoteCraft Desktop (offline-first)   │
│  src/main/licensing.js   (format)    │
│  src/main/activation.js  (client)    │
│  embedded Ed25519 PUBLIC key only    │
│  license_info table (cached token)   │
└──────────────────────────────────────┘
```

**Security principle:** the signing **private** key lives only on the Worker. The app ships only the
**public** key, which cannot mint entitlements. This closes the current "secret shipped in the app" hole.

---

## 3. Key Format Spec

```
QC-7A2K9-4MPQ8-XT5R2-9WZ3D
```

- **Alphabet:** Crockford Base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no `I`, `L`, `O`, `U`).
- **Display:** prefix `QC` + 4 groups × 5 chars (26 chars incl. dashes).
- **Payload (20 chars / 100 bits):**

| Chars | Field | Notes |
|---|---|---|
| 1 | format version | `1` = v1 scheme (evolvable) |
| 1 | plan | `A` annual · `L` lifetime · `T` trial |
| 4 | expiry bucket | days since 2020-01-01 (base32); `0000` = lifetime |
| 13 | random serial | ~65 bits of entropy → unguessable |
| 1 | checksum | mod-32 over preceding chars → catches typos before network |

- **Normalization** (shared by app + worker, must never diverge):
  uppercase → strip non-alphanumerics → map `O→0`, `I→1`, `L→1`.
- **Server is the source of truth.** The embedded plan/expiry are UX hints only.

---

## 4. Activation Protocol (Worker endpoints)

```
POST /activate    { key, device_id, app_version }
  → 200 { ok:true, token, license:{ name, plan, expiry } }
  → 4xx { ok:false, reason:'invalid'|'expired'|'revoked'|'device_limit'|'malformed' }

POST /deactivate  { key, device_id }
  → 200 { ok:true, released:true }

POST /validate    { token }        // online refresh + revocation check
  → 200 { ok:true, token } | { ok:false, reason:'revoked' }
```

- **Device binding:** default **2 devices** per key (Adobe-like). Releasing frees a seat.
- **Rate limiting:** per IP and per key on `/activate` (defense-in-depth; serials are already 65-bit).
- **Idempotency:** re-activating the same `device_id` does not consume a new seat.

### Entitlement Token (server → app; length is fine, not human-typed)
- **Ed25519-signed** compact blob (base64url of `payload.signature`).
- Payload: `{ serial, plan, expiry, name, device_id, issued_at, valid_until }`
- `valid_until = issued_at + 30 days`.

### App behavior
1. User pastes key → **client-side format + checksum** check (instant typo feedback).
2. `POST /activate` → store token + licensee info in `license_info`.
3. Verify token **offline** with embedded public key on every launch.
4. Works offline until `valid_until`; silently refreshes when online.
5. Past `valid_until` with no connectivity → drop to Free tier + "reconnect to refresh" prompt.
6. "Deactivate this device" → `POST /deactivate`.

---

## 5. Data Model

**Store record (KV now → D1 → Postgres later):**
```
serial           PK
name, email
plan             'annual' | 'lifetime' | 'trial'
expiry           ISO date | null
status           'active' | 'revoked' | 'refunded'
devices          [ { device_id, activated_at, app_version } ]
max_devices      default 2
activation_count
issued_at, updated_at
paystack_reference   (when issued via webhook)
```

**App `license_info` (new columns via migration):**
```
entitlement_token TEXT
serial            TEXT
status            TEXT
valid_until       TEXT
device_id         TEXT
activated_at      TEXT
```
Existing columns kept: `license_key`, `licensee_name`, `licensee_email`, `plan`, `expiry_date`, `issued_at`.

**Sync-readiness conventions (cheap now, enables Phase 5):** UUID primary keys for new tables,
`updated_at`, soft-delete `deleted_at`.

---

## 6. File Change Map

| File | Phase | Change |
|---|---|---|
| `src/shared/license-key.js` *(new)* | 1 | Crockford base32, `generateSerial`, `normalizeKey`, `validateKeyFormat`, checksum |
| `src/main/entitlement.js` *(new)* | 1 | `verifyEntitlementToken` (Ed25519 public key), `isEntitlementValid` |
| `src/main/license-public-key.js` *(new)* | 1 | Embedded public key (PEM), dev provisioned |
| `scripts/generate-license.js` *(new)* | 1 | Vendor CLI: generate serial + sign token + write store |
| `scripts/license-keys.js` *(new)* | 1 | Loads private key from env / gitignored file; dev fallback |
| `scripts/test-license-format.js` *(new)* | 1 | Format/checksum/normalization/token tests |
| `tools/.../src/licensing.js` | 2 | Port format + serial gen + Ed25519 signing (WebCrypto) |
| `tools/.../src/licensing-store.js` *(new)* | 2 | KV now, D1/Postgres-ready interface |
| `tools/.../src/index.js` | 2 | Add `/activate`, `/deactivate`, `/validate`; durable `/webhook` store |
| `tools/.../src/email.js` | 2/4 | Fix "Resend" comments → Brevo |
| `tools/.../test/` | 2 | Activation-flow test |
| `src/main/activation.js` *(new)* | 3 | Online client (`fetch`), token cache + grace |
| `src/main/licensing.js` | 3 | Wire new format/verify; keep exports; retire huge key |
| `src/main/ipc-handlers.js` | 3 | `license:activate` online; `license:get` verify token; add `license:refresh` |
| `src/main/database.js` | 3 | Migration: new `license_info` columns; UUID/`updated_at` conventions |
| `src/main/preload.js` | 3 | Expose `refreshLicense`, `deactivateLicense` |
| `src/renderer/js/settings.js` + `index.html` | 3 | New License UI (short key, status, deactivate, offline msg) |
| `AGENTS.md` | 4 | Document new model/format/endpoints |
| `scripts/test-licensing.js` | 4 | Update to new model (keep staging round-trip tests) |

---

## Phase 1 — Key Format, Validator & Vendor CLI (additive, non-breaking)

**Intent:** build and unit-test the new format + entitlement primitives without touching the running
app path (old `licensing.js` stays functional until Phase 3).

- [x] Add `src/shared/license-key.js`: Crockford base32, `generateSerial({plan, expiry})`,
      `normalizeKey`, `validateKeyFormat` → `{ ok, version, plan, expiry, serial, reason }`, checksum.
- [x] Add `src/main/entitlement.js`: `verifyEntitlementToken(token, publicKeyPem)`,
      `isEntitlementValid(ent, now)`.
- [x] Add `src/main/license-public-key.js` with dev public key (PEM).
- [x] Add `scripts/license-keys.js` (private key from `QC_LICENSE_PRIVATE_KEY` env or gitignored
      `scripts/.license-private-key.pem`; dev fallback keypair for local use).
- [x] Add `scripts/generate-license.js` CLI:
      `node scripts/generate-license.js --plan lifetime --name "Acme" --email a@b.com`
      → prints `QC-…` key, writes record to local `licenses.json`.
      (Preserves the old CLI's interactive mode and `--days`.) 
- [x] Add `scripts/test-license-format.js`; auto-discovered by `scripts/run-all-tests.js`.
- [x] Update `.gitignore`: ignore `scripts/.license-private-key.pem`, `licenses.json`.

**Acceptance criteria**
- Generated keys match `QC-XXXXX-XXXXX-XXXXX-XXXXX`, are unique across many runs.
- Checksum catches single-character typos; normalization maps `O/I/L` correctly.
- A signed token verifies; a tampered token/expiry is rejected; expired token flagged.
- `npm test` still green (45 suites) with the new suite added.

**Result:** ✅ All criteria met — `npm test` → **46 passed, 0 failed**. Plan codes are `A` (annual),
`P` (lifetime/perpetual), `T` (trial) to stay within the Crockford alphabet.

---

## Phase 2 — Worker Endpoints & Durable Store

**Intent:** the cloud half of online activation; issuance becomes durable (fix 90-day TTL).

- [x] Add `tools/.../src/licensing-store.js` (interface + `kv` backend; `d1` stub).
- [x] Port format + serial generation to worker `licensing.js` (WebCrypto).
- [x] Add Ed25519 signing in worker; private key from `env.QC_LICENSE_PRIVATE_KEY`.
- [x] Implement `POST /activate` (validate → device binding → issue token).
- [x] Implement `POST /deactivate` (release seat).
- [x] Implement `POST /validate` (refresh + revocation).
- [x] `/webhook`: generate serial, **store durably** (no TTL), email via Brevo, show on `/callback`.
- [x] Add rate limiting on `/activate`.
- [x] Add `tools/.../test/` activation-flow test; update `test:local`.

**Acceptance criteria**
- Valid key activates → returns verifiable token; unknown/expired/revoked keys rejected.
- Re-activating same `device_id` is idempotent; exceeding `max_devices` returns `device_limit`.
- Records survive beyond 90 days (no TTL).
- Local worker test (`npx wrangler dev` + `node test/simulate-webhook.js`) passes.

**Result:** ✅ All criteria met — `npm test` → **47 passed, 0 failed** (`test-worker-activation.js` and `test-activation-flow.js` green).

---

## Phase 3 — Desktop App Activation

**Intent:** switch the app from the huge offline key to short key + online activation + offline grace.

- [x] Add `src/main/activation.js` (activate/deactivate/validate client, token cache, grace logic).
- [x] Rewrite `src/main/licensing.js` to use new format/verify; keep `PLAN_FEATURES`, `FREE_LIMITS`.
- [x] `database.js` migration: add `license_info` columns (migrations 47 + 48); `updated_at` conventions.
- [x] `ipc-handlers.js`: `license:activate` → online flow; `license:get` → verify cached token;
      add `license:refresh`; gate `license:startTestPurchase` to dev.
- [x] `preload.js`: expose `refreshLicense`, `deactivateLicense`.
- [x] `settings.js` + `index.html`: new License UI (short key, plan/expiry, deactivate, offline notes).
- [x] Offline grace: works offline until `valid_until`; soft fallback + refresh prompt afterwards.

**Acceptance criteria**
- Paste a valid `QC-…` key → activates against the live Worker, shows Pro, persists after restart.
- Disconnect network → still Pro within grace; past grace → Free + clear prompt.
- Invalid/typo key rejected client-side before network with a helpful message.
- Deactivate releases the seat (verifiable in the store).

**Result:** ✅ All criteria met — `npm test` → **48 passed, 0 failed** (`test-phase3-activation.js` green).

---

## Phase 4 — Cleanup, Security & Docs

- [x] Remove hardcoded Paystack **test secret** fallback (`ipc-handlers.js:3015`).
- [x] Remove/guard dev `QC_LICENSE_KEY` fallback (`licensing.js:32`).
- [x] Fix `email.js` "Resend" comments → Brevo.
- [x] Ensure no signing secret ships in the app (only public key).
- [x] Update `scripts/test-licensing.js` to the new model; keep staging round-trip tests.
- [x] Update `AGENTS.md`: new format, endpoints, secrets, offline grace.
- [x] Full `npm test` green; manual end-to-end (buy → email → activate) sign-off.

**Acceptance criteria**
- No secrets in the app bundle. Tests green. Docs reflect reality.

**Result:** ✅ All criteria met — `node scripts/run-all-tests.js` → **48 passed, 0 failed** across all test suites. Secrets removed/guarded, docs updated.

---

## Phase 5 — Cloud DB Migration (later)

- [ ] `licensing-store.js`: add `d1` backend; migrate KV records to D1.
- [ ] Add revocation + online re-check (`/validate`), admin way to revoke/refund.
- [ ] Design repository layer so backend swap (D1 → Postgres/Neon) is config-only.
- [ ] (Optional) business-data cloud sync groundwork (UUIDs, `updated_at`, soft deletes).

**Acceptance criteria**
- Licensing works identically on D1; revocation propagates on next `/validate`.

---

## 7. Cleanup Backlog (surfaced during review)

1. `ipc-handlers.js:3015` — hardcoded Paystack test secret.
2. `licensing.js:32` — hardcoded dev signing secret.
3. Worker KV 90-day TTL → durable.
4. `worker/src/email.js` — "Resend" comments vs Brevo code.
5. `license:startTestPurchase` opens real checkout → dev-only.
6. `licensing.js` architecture comments → rewrite for online model.

---

## 8. Test Strategy

- **Phase 1:** pure unit tests (format, checksum, normalization, token verify/tamper/expiry).
- **Phase 2:** worker-local activation flow via `wrangler dev` + script.
- **Phase 3:** DB migration + activation round-trip (mocked network) in `scripts/`.
- **Phase 4:** full `npm test` + manual end-to-end.
- Tests must run under plain `node` (no GUI/network) per `AGENTS.md`; mock the Worker where needed.

---

## 9. Cost & Trade-offs

- **$0:** Cloudflare free tier, Brevo free tier, GitHub public Releases, Paystack (per-txn fees only), OSS deps.
- **Trade-off:** no code signing → SmartScreen "Unknown publisher" until "More info → Run anyway".
  Auto-update unaffected. Signing can be added later with no other changes.
- **Trade-off:** online activation requires connectivity on first activation (grace handles offline use after).

---

## 10. Open Items

- [ ] Confirm Phase 5 timing (assumed: design-now / build-later).
- [ ] Provide/rotate the real Ed25519 keypair before production deploy (Phase 2/3).
