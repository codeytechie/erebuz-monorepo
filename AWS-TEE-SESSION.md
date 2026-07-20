# AWS TEE deploy — session handoff

**Last updated:** 2026-07-21 (session paused overnight, waiting on domain owner + real env)

**One-line status:** TEE is fully built + deployed on a fresh EC2 box behind nginx/TLS for
`tee.erebuz.com`, verified working end-to-end locally, then **everything stopped so nothing is
live**. Two things are needed in the morning to go live: (1) point DNS, (2) drop in real secrets.

---

## ⏸️ Current state (as of pause)

| Thing | State |
| --- | --- |
| EC2 instance `erebuz-tee` (`i-077b3ddf4ef59958f`) | **stopped** (VM shut down overnight to save compute) |
| TEE Docker container `erebuz-tee` | **stopped** (`docker stop`; won't auto-restart) |
| nginx | **stopped + disabled** (won't start on boot) |
| Public reachability (ports 80/443/3000) | **nothing serving** — verified `000` from outside |
| Docker image `erebuz-tee:latest` (2.12 GB) | **built & preserved** |
| TLS cert | **self-signed placeholder** only (real cert = morning step) |
| DNS `tee.erebuz.com` | **not created yet** (domain owner asleep) |
| Runtime secrets in `/home/ubuntu/tee.env` | **placeholder** (random throwaway PRIVATE_KEY, no Railgun keys) |

Nothing is live. Safe to leave overnight.

---

## 🔑 Access / infra facts

- **Region:** `ap-south-1` (Mumbai)
- **Instance:** `i-077b3ddf4ef59958f` — t3.medium (4 GB), Ubuntu 24.04, 30 GB gp3, +2 GB swap
- **Elastic IP (stable):** `65.2.110.145`
- **SSH:** `ssh -i ~/.ssh/erebuz-tee.pem ubuntu@65.2.110.145`
  - key pair name: `erebuz-tee`; private key saved locally at `~/.ssh/erebuz-tee.pem`
- **Security group:** `sg-014bd641a30d08b90` (`erebuz-tee-sg`)
  - inbound: `22` from `103.203.38.149/32` (operator), `80` + `443` from `0.0.0.0/0`
  - port `3000` is **NOT** public — container binds `127.0.0.1:3000`, only nginx reaches it
  - ⚠️ SSH is locked to IP `103.203.38.149`. If your IP changed, re-open 22:
    `aws ec2 authorize-security-group-ingress --region ap-south-1 --group-id sg-014bd641a30d08b90 --protocol tcp --port 22 --cidr <NEW_IP>/32`
- **Chosen subdomain:** `tee.erebuz.com` (change everywhere if you want a different one)

### Files on the box (`/home/ubuntu/`)
- `tee/` — TEE source (extracted from tarball); `tee.tgz` — the source tarball
- `tee.env` — runtime env (**placeholder secrets** — replace in the morning)
- `tee-data/` — persisted volume (SQLite DB, Railgun artifacts) → mounted at `/app/data`
- `start-tee.sh` — (re)create + run container, localhost-only bind, re-reads `tee.env`
- `stop-tee.sh` — stop container
- `setup-nginx.sh` — (already run) installs/configures nginx + self-signed cert
- `issue-cert.sh` — MORNING: issues real Let's Encrypt cert (`bash issue-cert.sh <email>`)
- nginx site: `/etc/nginx/sites-available/erebuz-tee.conf` (443→127.0.0.1:3000, 80→redirect)

---

## 🌅 MORNING RUNBOOK (go-live)

**0. Start the VM** (it was stopped overnight). The Elastic IP is static, so the
public IP stays `65.2.110.145` after boot:
```
aws ec2 start-instances --region ap-south-1 --instance-ids i-077b3ddf4ef59958f
aws ec2 wait instance-running --region ap-south-1 --instance-ids i-077b3ddf4ef59958f
```
(Container + nginx are stopped/disabled, so nothing auto-serves on boot — good.)

**1. Point DNS** (domain owner) — add an A record:
```
tee.erebuz.com.   A   65.2.110.145
```
Wait for it to resolve: `dig +short tee.erebuz.com` → `65.2.110.145`.

**2. Add real secrets** — edit `/home/ubuntu/tee.env` on the box, set:
```
PRIVATE_KEY=<real TEE signer key>
RAILGUN_MNEMONIC=<...>
RAILGUN_ENCRYPTION_KEY=<...>
RAILGUN_POI_NODE_URL=<... if running POI node>
```
(Everything else — module addresses, RPCs, fees — is already set to prod-ish values.)

**3. Start the container** (re-reads tee.env):
```
ssh -i ~/.ssh/erebuz-tee.pem ubuntu@65.2.110.145
bash /home/ubuntu/start-tee.sh
```

**4. Start nginx + issue the real cert** (needs DNS live + port 80 open, both true now):
```
bash /home/ubuntu/issue-cert.sh vivek@inco.network
```
This runs `certbot --nginx -d tee.erebuz.com --redirect`, swaps the self-signed cert for the
real one, reloads nginx, and curls `https://tee.erebuz.com/`.

**5. Verify:**
```
curl https://tee.erebuz.com/                       # -> Hello World
curl https://tee.erebuz.com/api/user/get/foo.eth   # -> {"error":"ENS username not found"}
```

**6. (optional) survive-reboot:** `sudo systemctl enable nginx` (container already `unless-stopped`).

**7. (optional) cut over prod:** `tee.wall8.xyz` still points at the OLD GCP box
(`34.82.60.191`). Repoint it to `65.2.110.145` if this box replaces it.

---

## ✅ What was verified working (before stopping)
- `curl -k https://127.0.0.1/ -H "Host: tee.erebuz.com"` → `Hello World`
- API route returns JSON; HTTP `301`→ `https://tee.erebuz.com/`
- Container boots clean: server on :3000, 12 chains loaded, monitors started
  (Railgun privacy leg auto-disabled — expected until real Railgun keys added)
- Port 3000 not reachable from outside (localhost bind + SG rule removed)

## 🛠️ Local repo changes (NOT committed yet — ask before pushing)
Needed to make the Docker build work (local dev uses pnpm which is lenient on peers; npm is strict):
- `packages/tee/Dockerfile` — `npm install ... --legacy-peer-deps`
  (Railgun `shared-models` peers `ethers@6.14.3` vs pinned `6.13.1`)
- `packages/tee/package.json` — added `"hono": "^4.12.28"`
  (peer of `@hono/node-server`, hoisted locally but missing in a standalone npm install)
- this file: `AWS-TEE-SESSION.md` (untracked; delete or gitignore when done)

## 📋 Earlier in this session: AWS was wiped clean (per request)
Deleted everything that was in the account (all `ap-south-1`): `piker-backend` + `binance-bot`
instances, the `piker-db-prod` Postgres RDS (+ subnet group), 2 EIPs, 2 volumes, 4 key pairs,
11 security groups, and 2 leftover `elasticbeanstalk-*` S3 buckets. Only the new TEE resources
+ the default VPC/SG remain.
