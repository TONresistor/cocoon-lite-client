# COCOON Lite Client

Minimal CLI to access the [COCOON](https://github.com/TelegramMessenger/cocoon) decentralized AI inference network on TON. Exposes an **OpenAI-compatible API** on localhost.

## Quick Start

```bash
# Download binaries (required — Linux x86_64 only)
curl -sL https://github.com/TONresistor/cocoon-lite-client/releases/latest/download/cocoon-lite-client-linux-x64.tar.gz | tar xz -C build/

npm install
npx cocoon setup    # wallet + config wizard
npx cocoon start    # launch client
```

Then query the API:

```bash
curl http://localhost:10000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen3-32B","messages":[{"role":"user","content":"Hello"}]}'
```

## Requirements

- **Node.js** 18+
- **Linux x86_64** with GLIBC 2.38+ (Debian 13+, Ubuntu 24.04+, Fedora 39+)
- **20 TON** for staking (15 TON deposit + 5 TON gas/operating balance)

## Commands

| Command | Description |
|---------|-------------|
| `npx cocoon setup` | Interactive setup wizard (wallet, config, funding) |
| `npx cocoon start` | Start the client (router + client-runner) |
| `npx cocoon status` | Show status, balance, and proxy info |
| `npx cocoon models` | List available AI models |
| `npx cocoon withdraw [amount]` | Withdraw TON from cocoon wallet to owner wallet |
| `npx cocoon unstake` | Close proxy contract and withdraw all funds |
| `npx cocoon cashout <amount> <address>` | Send TON from owner wallet to an external address |

## API

The client exposes an OpenAI-compatible HTTP API.

```bash
# Chat completion
curl http://localhost:10000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen3-32B","messages":[{"role":"user","content":"Hello"}]}'

# List models
curl http://localhost:10000/v1/models

# Client stats (balance, proxy, sync)
curl http://localhost:10000/jsonstats
```

> To disable Qwen3 thinking mode, add `{"role":"system","content":"/no_think"}` to messages.

## How It Works

The **client-runner** connects to TON, discovers proxies via smart contracts, manages deposits, and forwards your API requests to GPU workers running in TDX enclaves. The **router** handles encrypted tunneling to the proxy network.

## Configuration

`npx cocoon setup` generates two files:

- **`client.conf`** -- INI config with owner address, node key, instance number, and optional Toncenter API key
- **`.wallet.json`** -- Private keys and seed phrase (written with `chmod 600`)

> **Warning**: `.wallet.json` contains your private keys. Never commit it to version control.

## Security Notes

- The API binds to `0.0.0.0` with **no authentication**. Use a firewall or reverse proxy to restrict access.
- Client-side TDX verification is disabled by default (`--router-policy any`). Workers still run inside Intel TDX enclaves. Use `--router-policy tdx` on TDX-capable hardware for full verification.

## Troubleshooting

| Issue                                    | Solution                                                   |
| ---------------------------------------- | ---------------------------------------------------------- |
| `Cannot connect to client on port 10000` | Run `npx cocoon start`                                     |
| `GLIBC_2.38 not found`                   | Use a newer distro (Debian 13+, Ubuntu 24.04+, Fedora 39+) |
| Proxy shows `not ready`                  | Wait 30-60s after start for handshake                      |
| Qwen3 outputs `<think>` tags             | Add `/no_think` system message                             |

## License

Apache 2.0 -- Built on top of [COCOON](https://github.com/TelegramMessenger/cocoon) by Telegram (Copyright 2025 Telegram FZ-LLC) and [TON](https://ton.org).
