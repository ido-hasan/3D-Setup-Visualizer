// Copies the STEP importer (a WebAssembly build of Open CASCADE) into public/ so the app
// can load it from its own server, with no internet connection.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const src = path.dirname(require.resolve('occt-import-js'));
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'occt');
mkdirSync(dest, { recursive: true });
for (const file of [
  'occt-import-js.js',
  'occt-import-js.wasm',
  'occt-import-js-worker.js',
  'license.occt-import-js.txt',
  'license.occt.txt',
]) {
  copyFileSync(path.join(src, file), path.join(dest, file));
}
