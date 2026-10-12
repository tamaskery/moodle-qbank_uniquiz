// One-time migration from the reviewed 0.1.4 catalogue. Never run during normal builds.
import fs from 'node:fs/promises';
const here = new URL('./', import.meta.url);
const catalogue = JSON.parse(await fs.readFile(new URL('language-catalogue.json', here), 'utf8'));
const registry = {};
const migration = {};
for (const [oldKey, entry] of Object.entries(catalogue)) {
    const base = oldKey.replace(/_[a-f0-9]{8}$/, '');
    let key = base;
    let index = 2;
    while (registry[key]) { key = `${base}_${index++}`; }
    const prefix = oldKey.startsWith('ui_') ? 'ui' : oldKey.match(/^js_(aiken_app|aiken_core|core|app|preview|timing)_/)[0].slice(0, -1);
    registry[key] = {prefix, value: entry.value};
    migration[oldKey] = key;
}
await fs.writeFile(new URL('language-registry.json', here), JSON.stringify(registry, null, 2) + '\n', {flag: 'wx'});
await fs.writeFile(new URL('language-key-migration-0.1.4.json', here), JSON.stringify(migration, null, 2) + '\n', {flag: 'wx'});
