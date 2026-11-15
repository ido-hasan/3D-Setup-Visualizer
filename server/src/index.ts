import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp, lanAddresses } from './app';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const port = Number(process.env.PORT ?? 4700);
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
const clientDir = path.join(root, 'client', 'dist');

const { app } = buildApp({ dataDir, clientDir, port });

app
  .listen({ port, host })
  .then(() => {
    console.log('');
    console.log('  3D Setup Visualizer is running.');
    console.log(`    On this computer:  http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`    On your network:   http://${ip}:${port}`);
    console.log(`    Data is stored in: ${dataDir}`);
    console.log('');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
