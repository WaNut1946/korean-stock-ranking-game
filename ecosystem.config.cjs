module.exports = {
  apps: [
    {
      name: 'stock-ranking-api',
      script: 'server/src/index.js',
      cwd: __dirname,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
