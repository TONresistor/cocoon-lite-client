import { getHttpPort } from '../lib/config.js';
import { printBanner, separator, handleClientError, BRAND, DIM, GREEN, YELLOW, WHITE } from '../lib/ui.js';

export async function modelsCommand(opts) {
  const port = opts.port || String(getHttpPort());
  const url = `http://localhost:${port}/v1/models`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const body = await res.json();

    const models = body.data || body.models || body;

    printBanner();

    if (!Array.isArray(models) || models.length === 0) {
      console.log(YELLOW('\n  No models available.\n'));
      return;
    }

    console.log(`  ${WHITE.bold(`${models.length} model(s) available`)}\n`);
    for (const model of models) {
      const id = model.id || model.name || model;
      const owned = model.owned_by ? DIM(` · ${model.owned_by}`) : '';
      console.log(`  ${GREEN('●')} ${BRAND(id)}${owned}`);
    }
    console.log();
    separator();
    console.log(DIM(`  localhost:${port} | ${new Date().toLocaleTimeString()}\n`));

  } catch (err) {
    handleClientError(err, port);
  }
}
