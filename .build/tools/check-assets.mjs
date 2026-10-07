// Verify linked AMD source maps and their exact source contents after rebuilding.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const plugin = new URL('../../', import.meta.url);
for (const name of ['core', 'preview', 'timing', 'app', 'aiken-core', 'aiken-app', 'i18n', 'bootstrap']) {
  const source = await fs.readFile(new URL(`amd/src/${name}.js`, plugin), 'utf8');
  const built = await fs.readFile(new URL(`amd/build/${name}.min.js`, plugin), 'utf8');
  const map = JSON.parse(await fs.readFile(new URL(`amd/build/${name}.min.js.map`, plugin), 'utf8'));
  assert.equal(map.version, 3);
  assert.equal(map.file, `${name}.min.js`);
  assert.deepEqual(map.sources, [`../src/${name}.js`]);
  assert.deepEqual(map.sourcesContent, [source]);
  assert.ok(map.mappings.length > 0);
  assert.ok(built.includes(`//# sourceMappingURL=${name}.min.js.map`));
  new vm.Script(built, {filename: `${name}.min.js`});
}
console.log('All eight AMD modules parse and link to matching non-empty source maps.');
