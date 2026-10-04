import { createApp } from './app.js';
import { config, validateProductionConfig } from './config.js';
import { closeDatabase } from './db.js';

validateProductionConfig();
const server = createApp().listen(config.port, '0.0.0.0', () => console.log('NEXUS API aktif.'));
function shutdown() {
  server.close(() => { void closeDatabase().then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
