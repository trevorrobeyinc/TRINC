# qdrant-tls-proxy

TLS-terminating reverse proxy for Miyo's bundled Qdrant.

- Listens: `https://127.0.0.1:6433` (mkcert localhost cert).
- Forwards: `http://127.0.0.1:6333` (Qdrant child process spawned by the Miyo desktop app).
- Owned by: PM2 (`qdrant-tls-proxy`).

Exists so the `trevorobeyinc-research-memory` MCP can speak HTTPS without forcing Miyo's bundled Qdrant or the `obsidian-vault-zettelkasten` plugin off plain `:6333`. Per the monorepo `CLAUDE.md`, Qdrant on `:6333` itself stays plain HTTP — those are third-party clients we don't own.

## HTTPS-only invariant

`server.mjs` reads the cert/key at module top via `fs.readFileSync` and constructs an `https.Server`. There is no `http.createServer` fallback path, no `tls ? https : http` ternary, and no env var that disables TLS. If the cert files are missing, the process throws on startup and refuses to listen.

## Operate

```
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs qdrant-tls-proxy
pm2 restart qdrant-tls-proxy
```

## Verify

```
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/collections
```

## Env overrides

| Var | Default |
|---|---|
| `QDRANT_TLS_HOST` | `127.0.0.1` |
| `QDRANT_TLS_PORT` | `6433` |
| `QDRANT_UPSTREAM_HOST` | `127.0.0.1` |
| `QDRANT_UPSTREAM_PORT` | `6333` |
| `QDRANT_TLS_CERT` | `~/.local/share/mkcert/localhost.pem` |
| `QDRANT_TLS_KEY` | `~/.local/share/mkcert/localhost-key.pem` |
