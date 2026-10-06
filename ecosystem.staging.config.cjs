// PM2 config for the STAGING instance only. Lives in the staging checkout
// (/var/www/snapie-io-staging); production's PM2 entry is managed separately
// and is intentionally not defined here.
//
//   pm2 start ecosystem.staging.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'snapie-io-staging',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3311',
      env: { NODE_ENV: 'production' },
    },
  ],
};
