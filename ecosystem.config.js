module.exports = {
  apps: [
    {
      name: 'qrispay-web',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'qrispay-worker',
      script: 'worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        WORKER_INTERVAL_MS: 12000,
      },
    },
  ],
};
