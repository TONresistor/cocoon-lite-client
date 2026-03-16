# cocoon-client

COCOON Lite Client — Node.js CLI and WebUI for decentralized AI inference on the TON blockchain. Exposes an OpenAI-compatible API on localhost.

## Quick Start

**Install**

```bash
git clone https://github.com/TONresistor/cocoon-lite-client.git && cd cocoon-lite-client
npm install

# Download pre-built C++ binaries (Linux x86_64 only)
curl -sL https://github.com/TONresistor/cocoon-lite-client/releases/latest/download/cocoon-lite-client-linux-x64.tar.gz | tar xz -C build/
```

**CLI usage**

```bash
npx cocoon setup    # Interactive setup wizard (wallet, config, funding)
npx cocoon start    # Launch client
npx cocoon status   # Show status and balances
```

**WebUI usage**

```bash
npx cocoon ui       # Open management UI at http://127.0.0.1:3000
```

**Test the API**

```bash
curl http://127.0.0.1:10000/v1/models
curl http://127.0.0.1:10000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen3-32B","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

> To disable Qwen3 thinking mode, add `{"role":"system","content":"/no_think"}` to messages.

## Requirements

- Node.js 18+
- Linux x86_64, GLIBC 2.38+ (Debian 13+, Ubuntu 24.04+, Fedora 39+)
- 20 TON for staking (15 deposit + 5 gas/operating)

## Commands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `setup` | Interactive 7-step wizard (wallet, config, funding) | — |
| `start` | Launch client (router + client-runner) | `--verbosity <0-5>`, `--router-policy <tdx\|any>` |
| `status` | Show status, balance, proxy info | `-p, --port` |
| `models` | List available AI models | `-p, --port` |
| `withdraw [amount]` | Withdraw TON from cocoon to owner wallet | — |
| `unstake` | Close proxy contract, withdraw all funds (3-step) | `-p, --port` |
| `cashout <amount> <address>` | Send TON from owner wallet to external address | — |
| `ui` | Launch web management UI | `-p, --port` (default: 3000) |

## Web UI

React SPA served at `http://127.0.0.1:3000`. Pages: Setup Wizard, Dashboard (status/balances/proxy/models/events), Chat, Wallet (withdraw/unstake/cashout).

Real-time client events via SSE. State-changing API routes require Bearer token auth.

```bash
npx cocoon ui
npx cocoon ui --port 8080
```

Stack: React 19, TypeScript, Vite 6, TailwindCSS 4, TanStack Query v5, Zustand.

## API Reference

### OpenAI-Compatible API (port 10000)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/models` | List available models |
| `POST` | `/v1/chat/completions` | Chat completion (streaming supported) |
| `GET` | `/jsonstats` | Client stats (balance, proxy, sync) |

### Management API (port 3000)

All `POST`/`PUT`/`DELETE` routes require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/setup/status` | Setup state |
| `POST` | `/api/setup/generate-wallet` | Generate new wallets |
| `POST` | `/api/setup/import-wallet` | Import existing wallet |
| `POST` | `/api/setup/write-config` | Write client.conf |
| `GET` | `/api/setup/balance/:address` | Check on-chain balance |
| `POST` | `/api/setup/transfer` | Fund node wallet |
| `GET` | `/api/client/status` | Client process status |
| `POST` | `/api/client/start` | Start client |
| `POST` | `/api/client/stop` | Stop client |
| `GET` | `/api/client/events` | SSE stream (client lifecycle) |
| `GET` | `/api/jsonstats` | Cached proxy to client-runner stats |
| `GET` | `/api/v1/models` | Cached proxy to client-runner models |
| `POST` | `/api/v1/chat/completions` | Streaming proxy to client-runner |
| `GET` | `/api/wallet/info` | Wallet balances |
| `POST` | `/api/wallet/withdraw` | Withdraw from cocoon to owner wallet |
| `GET` | `/api/wallet/unstake/status` | Unstake progress |
| `POST` | `/api/wallet/unstake` | Initiate unstake |
| `POST` | `/api/wallet/cashout` | Send TON to external address |

## How It Works

The `client-runner` (C++ binary) connects to the TON blockchain, discovers inference proxies via smart contracts, manages staking deposits, and forwards API requests to GPU workers running in TDX (Trusted Domain Extensions) enclaves. The `router` binary provides encrypted SOCKS5 tunneling to the proxy network. The Node.js CLI orchestrates both binaries, manages config and wallet files, and serves the management API and WebUI.

## Configuration

`setup` generates two files in the working directory:

**`client.conf`** (INI format)
- `owner_address`, `node_wallet_key`, `instance`, `root_contract_address`, `toncenter_api_key`

**`.wallet.json`** (JSON, chmod 600)
- `owner_wallet`: address, seed phrase, private key (base64)
- `node_wallet`: address, private key (base64)

Do not commit `.wallet.json` to version control.

## Docker

```bash
docker-compose up -d
```

The provided `docker-compose.yml` mounts `build/`, `client.conf`, and `.wallet.json` into the container, exposes port 3000, and includes a healthcheck on `/api/client/status`. The `Dockerfile` uses a multi-stage build: Node 20 slim builds the frontend, the runtime stage serves the SPA and API.

## Development

```bash
npm run build   # Build WebUI (Vite)
npm run dev     # Vite dev server for WebUI
npm test        # Run unit tests (21 tests: config, format, template)
```

CI runs on push and PR via GitHub Actions: typecheck, build, test, audit.

## Security Notes

- The API binds to `127.0.0.1` only. Do not expose port 10000 or 3000 publicly.
- `.wallet.json` is written with `chmod 600`. Keep it out of version control.
- `--router-policy tdx` restricts routing to verified TDX enclave proxies. `any` allows unverified workers — use only for testing.
- The Bearer token for the management API is generated at startup and printed to the console.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot connect to client on port 10000` | Run `npx cocoon start` or start from WebUI |
| `GLIBC_2.38 not found` | Use Debian 13+, Ubuntu 24.04+, or Fedora 39+ |
| Proxy shows `not ready` | Wait 30-60s after start for handshake |
| Qwen3 outputs `<think>` tags | Add `/no_think` system message |
| `ptrace: Operation not permitted` in crash logs | Cosmetic gdb message (`ptrace_scope=2`). Not the actual crash cause — lower with `sysctl -w kernel.yama.ptrace_scope=0` to see the real backtrace. |

## License

Apache 2.0. Built on [COCOON by Telegram](https://github.com/TelegramMessenger/cocoon) (Copyright 2025 Telegram FZ-LLC) and [TON](https://ton.org).
