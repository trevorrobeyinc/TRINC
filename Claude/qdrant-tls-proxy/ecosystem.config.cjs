module.exports = {
  apps: [
    {
      name: "qdrant-tls-proxy",
      script: "server.mjs",
      cwd: __dirname,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        QDRANT_TLS_HOST: "127.0.0.1",
        QDRANT_TLS_PORT: "6433",
        QDRANT_UPSTREAM_HOST: "127.0.0.1",
        QDRANT_UPSTREAM_PORT: "6333",
      },
    },
  ],
};
