const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');

function cloudConfig() {
  const config = parseEnv(readFileSync(resolve(__dirname, '../.env.cloud'), 'utf8'));
  if (!config.DATABASE_URL) throw new Error('Definí DATABASE_URL en backend/.env.cloud.');
  const url = new URL(config.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('La URL de destino debe apuntar a PostgreSQL en la nube.');
  }
  return config;
}

module.exports = { cloudConfig };
