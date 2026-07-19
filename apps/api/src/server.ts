// SPDX-License-Identifier: GPL-3.0-only
import { buildApi } from './app.js';
import { readApiConfig } from './config.js';

async function start(): Promise<void> {
  try {
    const config = readApiConfig(process.env);
    const app = await buildApi({ config });
    await app.listen({ host: config.host, port: config.port });
  } catch {
    process.stderr.write('Reimbursd API failed to start. Check the server configuration.\n');
    process.exitCode = 1;
  }
}

await start();
