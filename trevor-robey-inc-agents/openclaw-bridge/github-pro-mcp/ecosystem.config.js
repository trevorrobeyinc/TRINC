module.exports = {
  apps: [
    {
      name: 'openclaw-mcp',
      cwd: __dirname,
      script: 'dist/server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        // Defaults; runtime env will override when the start script exports .env
        OPENCLAW_TRANSPORT: 'http',
        OPENCLAW_GATEWAY_BASE_URL: 'http://localhost:1234/v1',
        OPENCLAW_DEFAULT_MODEL: 'qwen2.5-coder-7b-instruct',
        OPENCLAW_BRIDGE_BASE_URL: 'http://127.0.0.1:8787',
        BIONICLINK_BASE_URL: 'https://127.0.0.1:8090'
      }
    }
  ]
};
