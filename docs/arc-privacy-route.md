# Erebuz Arc Privacy Pool route

Erebuz supports two independent privacy providers. Railgun remains the default
and its existing routes are unchanged. Testnet users can select **Erebuz Pool**
to route USDC through the deployed `PrivacyPoolComplex` on Arc Testnet.

```text
source chain
  -> Circle CCTP
  -> per-route Nexus account on Arc
  -> Erebuz PrivacyPoolComplex
  -> zero-knowledge withdrawal to the Arc account
  -> Circle CCTP
  -> destination recipient
```

## Deployed Arc contracts

- Chain ID: `5042002`
- USDC: `0x3600000000000000000000000000000000000000`
- Entrypoint: `0x7fA6F4E71eacEA2646F9D0f7c9a1539Dd694b1c8`
- Pool: `0x7F8A2BB0cCb5402cd9986e1fcA010D5df9A539Cc`
- Scope: `14508043559420656070848409224091111501903008011015566451849387710630601499094`

The route uses Circle CCTP (Arc domain 26), not Chainlink CCIP. CCTP is already
the native-USDC bridge used by the Erebuz testnet flow.

## Required TEE configuration

```dotenv
ROUTE_ENCRYPTION_KEY=<32-byte hex>
ARC_PRIVACY_ASP_URL=https://<public-asp-host>
DEFAULT_PRIVACY_PROVIDER=railgun
```

`ROUTE_ENCRYPTION_KEY` is mandatory for Arc routes because the database stores
the note nullifier and secret. The API always removes this encrypted payload
from status responses.

Withdrawal artifacts can be mounted locally:

```dotenv
ARC_PRIVACY_ARTIFACTS_DIR=/run/arc-artifacts
```

The directory must contain `withdraw.wasm`, `withdraw.zkey`, and
`withdraw.vkey`. Without it, the TEE downloads the artifacts from the exact
privacy-pool deployment commit and verifies pinned SHA-256 hashes before proof
generation. `ARC_PRIVACY_ARTIFACTS_URL` can point at an internal mirror with the
same repository layout.

## ASP approval is an explicit route state

After the pool deposit, a route enters `POOL_DEPOSITED`. It stays there until
the ASP indexes the new commitment, reviews/approves its label, pins the updated
tree, and publishes the new root on Arc. The TEE never auto-approves a deposit or
bypasses the association-set policy.

On the privacy-pool host:

```bash
cd packages/asp
ARC_TESTNET_RPC=https://rpc.testnet.arc.network node src/cli.mjs sync
# Review the pending label and update config/arc-testnet-policy.json.
ARC_TESTNET_RPC=https://rpc.testnet.arc.network node src/cli.mjs sync
node src/cli.mjs pin
# Publish the generated root/CID with the guarded UpdateArcRoot flow.
```

Restart or reload the ASP service after publishing so it serves the newly
activated snapshot. The TEE then automatically generates and verifies the
Groth16 proof, withdraws to the route's Arc account, and completes the
destination CCTP leg.

## API

Quote and create requests accept:

```json
{ "privacyProvider": "arc" }
```

Omit it or use `"railgun"` for the existing route. The selected provider is
stored on every route so in-flight transfers resume through the same pool after
a restart.
