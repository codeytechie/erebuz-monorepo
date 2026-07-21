# AWS TEE deploy — session log

**Last updated:** 2026-07-21

**STATUS: 🟢 LIVE** — https://tee.erebuz.com (TLS) fronting the owner's full stack
(TEE + Railgun POI node + mongo), signer = the provided key, privacy leg ACTIVE.

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
