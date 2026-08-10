# AWS TEE deploy — session log

**Last updated:** 2026-08-10

**STATUS: 🟢 LIVE** — https://tee.erebuz.com (TLS) fronting the owner's full stack
(TEE + Railgun POI node + mongo), signer = the provided key, privacy leg ACTIVE.

## 2026-08-10 deployment: hosted Railgun + Erebuz Arc routes

The AWS backend now serves both privacy providers through the same API. Railgun
remains the default and uses Ethereum Sepolia as its privacy hub. The additional
`arc` quote uses Circle CCTP into the Erebuz Privacy Pool on Arc Testnet.

| Service | Container | Bind | Purpose |
| --- | --- | --- | --- |
| TEE | `stack-tee-1` | `127.0.0.1:3000` | quotes, route creation, monitoring and payouts |
| Railgun POI | `stack-poi-node-1` | `127.0.0.1:8080` | Ethereum Sepolia POI validation |
| Mongo | `stack-mongo-1` | internal | POI persistence |
| Arc ASP | `stack-asp-1` | `127.0.0.1:8787` | activated association-set proofs |
| Arc operator | `stack-asp-operator-1` | internal | automatic Wall8 pool approvals/publications |

Hosted non-secret routing configuration:

- `BRIDGE_PROVIDER=cctp`
- `DEFAULT_PRIVACY_PROVIDER=railgun`
- `PRIVACY_HUB_CHAIN_ID=11155111`
- `ARC_PRIVACY_ASP_URL=http://asp:8787`
- `PRIVATE_ROUTE_FEE_MIN_USD=0.1`
- ASP polling is 15 seconds with exponential failure backoff; idle traffic is
  one Arc pool-root request per interval.

The ASP operator only approves Arc deposits whose transaction hash belongs to a
`POOL_DEPOSITED` Arc route in the TEE SQLite database. Policy and snapshot data
are persistent Docker volumes. IPFS uploads are accepted only after the exact
expected CID is publicly gateway-verified, and the on-chain root plus CID are
both checked before the operator becomes idle.

Pre-deployment rollback material:

- EBS snapshot: `snap-092816d9b05f95d19` for volume
  `vol-018823994985a168d` (point in time: 2026-08-10 07:15 UTC).
- Application-consistent Mongo, SQLite, resolved Compose, Docker inspection,
  nginx and source backups:
  `/home/ubuntu/backups/pre-railgun-arc-20260810T0715Z/`.

Verification performed after deployment:

- `https://tee.erebuz.com/` returns `Hello World` over valid TLS;
- hosted Railgun and Arc quote requests both succeed for Base Sepolia → Arc;
- the persisted hosted database contains 24 completed Railgun routes;
- Arc ASP `/health` reports `ready` and the automatic operator is running;
- the AWS signer has native gas on Ethereum Sepolia, Base Sepolia and Arc.

---

## What's deployed (current, authoritative)

The live deployment is the **owner's docker-compose stack**, NOT the single-container
setup from the first night. It lives at `/home/ubuntu/erebuz-stack/infra/stack/`:

| Service | Container | Bind | State |
| --- | --- | --- | --- |
| tee | `stack-tee-1` (image `stack-tee`) | `127.0.0.1:3000` | up, `unless-stopped` |
| poi-node | `stack-poi-node-1` | `127.0.0.1:8080` | healthy, `unless-stopped` |
| mongo | `stack-mongo-1` | internal `27017` | healthy, `unless-stopped` |

- **Signer:** `0xc6377415Ee98A7b71161Ee963603eE52fF7750FC` (from the provided key).
  Owner's original key is backed up at `…/stack/.env.bak-ownerkey` (revert = restore that line, recreate `tee`).
  ⚠️ This signer must be **funded on Arbitrum** (+ any chain it signs on) for module txs to land.
- **Railgun privacy leg:** ACTIVE — engine started, groth16/snarkjs prover wired, shielded
  wallet `0zk1qy…` created (works because the POI node is reachable + real Railgun secrets set).
- **Config source:** compose variable-substitutes from `…/stack/.env` (chmod 600). All secrets
  (PRIVATE_KEY, RAILGUN_MNEMONIC/ENCRYPTION_KEY, RELAY_API_KEY, pkey/pubkey, MONGO_PASSWORD) live there.
- **Bridge provider:** `BRIDGE_PROVIDER=cctp` (Circle CCTP burn/mint, USDC 1:1 — stable quotes,
  ~0.90 net on 1 USDC). Added a passthrough to the compose `tee` env (backup `docker-compose.yml.bak-bridge`).
  Revert to Relay: set `BRIDGE_PROVIDER=relay` in `.env`, then `docker compose up -d tee`.
  Note: CCTP is USDC-only; discovery + quotes switch to CCTP chains automatically.

## Arc Testnet support synced from local (2026-07-22)
Pushed 6 files local→box + rebuilt (all additive, no regressions, no DB migration):
`arc-testnet.json` (chain 5042002, USDC-native-gas) + CCTP domain 26 in `cctp/index.ts`;
`chain.ts` (rate-limit-retrying RPC transport + `unifiedGasToken`); `aa/index.ts`
(unconditional gas top-up on unified-gas chains, hub-address cache, UserOp-revert
detection); `private-route.ts` (UTC timestamp parse fix); `test-route-e2e.ts`.
ChainManager now loads Arc; box-only fixes below all still intact.

## Owner-stack code changes made on the box (NOT in owner's git — tell them)
Edited under `/home/ubuntu/erebuz-stack/packages/tee/` (backups kept alongside):
- **`index.ts`** — added `process.on('unhandledRejection'|'uncaughtException')` log-and-continue
  handlers. The Railgun engine's *background* POI refresh throws async rejections that Node
  treats as fatal; without this the TEE was **crash-looping** (RestartCount climbing) whenever a
  shielded note needed POI. Now stable (RestartCount=0). Backup: `index.ts.bak-guard`.
  **This is a genuine fix the owner should commit.**
- **`src/services/railgun/index.ts`** — added a `POI_DEBUG`-gated balance log line in
  `waitForShieldedBalance` (diagnostic; harmless, only logs when `POI_DEBUG` set).
- **compose + .env** — `POI_DEBUG=1` passthrough (turn off with `POI_DEBUG=0` + `up -d tee`).

### Auto-cancel stale AWAITING_DEPOSIT routes — `state-machine.ts`
Synced from local (commit "feat(tee): auto-cancel a route still AWAITING_DEPOSIT
after 5 minutes"). A route with no deposit after `PRIVATE_ROUTE_DEPOSIT_EXPIRY_MS`
(default 5 min) is marked FAILED. Now on the box + local, alongside the same-chain fix.

### Same-chain (dest == hub) delivery fix — `state-machine.ts`
CCTP leg-2 unconditionally burned hub→dest. When the destination IS the hub chain
(e.g. Base Sepolia → Sepolia with the Sepolia hub), that's a same-domain CCTP burn,
which is invalid — the route wedged in `BRIDGING_OUT` waiting for an attestation that
never comes (funds sat safe in the hub SA). Added a `route.destChainId === hubChainId`
short-circuit that skips CCTP and transfers the unshielded USDC straight from the hub
smart account to the recipient. Recovered the wedged route (recipient received funds)
and covers future same-chain-destination transfers. Backup: `state-machine.ts.bak-samechain`.
**Owner should commit this too.**

### POI works; the earlier "stuck payout" was NOT a POI failure
Once the crash-loop was guarded, POI generation succeeds (`[poi] Valid:17`). Two routes were
stuck only because they were **orphaned by switching `BRIDGE_PROVIDER` Relay→CCTP mid-flight**
(a Relay route half-bridged, and a route whose shielded balance 0.487 < the CCTP payout 0.9).
Both marked `FAILED` in the DB. **Lesson: don't flip `BRIDGE_PROVIDER` while routes are in
flight.** Fresh routes created entirely under CCTP complete normally. Funds from the dead routes
remain spendable in the TEE's Railgun shielded wallet (not lost).

## SSL / edge
- **nginx** (system service, `active` + `enabled`) — site `/etc/nginx/sites-available/erebuz-tee.conf`
  proxies `tee.erebuz.com` → `127.0.0.1:3000`, redirects :80 → :443.
- **Cert:** Let's Encrypt `/etc/letsencrypt/live/tee.erebuz.com/`, expires **2026-10-19**, auto-renew on.
- Port 3000 is NOT public (localhost bind + SG rule removed) — only reachable via nginx TLS.

## Infra / access
- **Region:** ap-south-1 · **Instance:** `i-077b3ddf4ef59958f` (t3.medium, Ubuntu 24.04)
- **Elastic IP:** `65.2.110.145` · **DNS:** `tee.erebuz.com A → 65.2.110.145` (live)
- **SSH:** `ssh -i ~/.ssh/erebuz-tee.pem ubuntu@65.2.110.145`
- **SG `sg-014bd641a30d08b90`:** in = 22 (from `103.203.38.149/32`), 80, 443. (No public 3000.)

## Managing the stack
```bash
cd /home/ubuntu/erebuz-stack/infra/stack
sudo docker compose ps                 # status
sudo docker compose logs -f tee        # tee logs
sudo docker compose restart tee        # restart one service
sudo docker compose up -d --build      # recreate all (after editing .env / source)
sudo docker compose down               # stop+remove containers (volumes kept)
```
To change the signer again: edit `PRIVATE_KEY=` in `…/stack/.env`, then `docker compose up -d tee`.

## Known cosmetic issue
The owner's source contains macOS `._*` AppleDouble files in the chain-config dir; the loader
tries to parse them as JSON and logs `SyntaxError` for each, then skips them. **No functional
impact** — all 12 real chains load fine. To silence: `find /home/ubuntu/erebuz-stack -name '._*' -delete`
then `docker compose up -d --build tee`.

## Verified live (2026-07-21)
- `curl https://tee.erebuz.com/` → `Hello World` (valid Let's Encrypt cert)
- `curl https://tee.erebuz.com/api/user/get/foo.eth` → `{"error":"ENS username not found"}`
- http → 301 https · nginx enabled on boot · all containers `unless-stopped`

---

## Leftovers from night 1 (unused, harmless)
- Single-container path superseded by the owner's stack: image `erebuz-tee:latest`, `tee.env`,
  and `/home/ubuntu/{start,stop,setup-nginx,issue-cert}.sh`. `issue-cert.sh` was reused for the cert;
  the rest are idle. Safe to delete if you want a tidy box.
- Local repo edits (for the night-1 container, NOT needed by the owner's stack; uncommitted):
  `packages/tee/Dockerfile` (`--legacy-peer-deps`), `packages/tee/package.json` (`hono` dep).
- This file `AWS-TEE-SESSION.md` is untracked — delete/gitignore when done.

## Earlier: AWS was wiped clean (per request, night 1)
Deleted all prior account resources (ap-south-1): `piker-backend` + `binance-bot` instances,
`piker-db-prod` Postgres RDS (+ subnet group), 2 EIPs, 2 volumes, 4 key pairs, 11 SGs, 2 leftover
`elasticbeanstalk-*` S3 buckets. Only the TEE resources + default VPC/SG remain.
