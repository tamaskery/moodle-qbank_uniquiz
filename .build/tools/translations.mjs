import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export const languages = ['es', 'de', 'fr', 'hu'];
export function entries(source) {
    return Object.fromEntries([...source.matchAll(/^\$string\['([^']+)'\] = '((?:\\.|[^'])*)';$/gm)]
        .map(match => [match[1], match[2].replace(/\\([\\'])/g, '$1')]));
}
const placeholders = value => [...value.matchAll(/\{\$a(?:->\w+)?\}/g)].map(match => match[0]).sort();
const quote = value => "'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
export async function languagePacks(english) {
    const source = entries(english);
    const result = {};
    for (const language of languages) {
        const strings = JSON.parse(await fs.readFile(new URL(`./translations/${language}.json`, import.meta.url), 'utf8'));
        assert.deepEqual(Object.keys(strings).sort(), Object.keys(source).sort(), `${language}: complete key coverage`);
        for (const [key, value] of Object.entries(strings)) {
            assert.equal(typeof value, 'string', `${language}/${key}`);
            assert.ok(value.trim(), `${language}/${key}: empty translation`);
            assert.deepEqual(placeholders(value), placeholders(source[key]), `${language}/${key}: placeholders`);
            assert.equal(value.includes('\u0000'), false, `${language}/${key}: NUL`);
        }
        const header = english.slice(0, english.indexOf('$string['))
            .replace('English plugin strings. Generated browser strings are appended during the build.',
                `${language} plugin strings. Generated from the complete translation source.`);
        result[language] = header + Object.entries(strings).sort(([a], [b]) => a.localeCompare(b, 'en'))
            .map(([key, value]) => `$string[${quote(key)}] = ${quote(value)};\n`).join('');
    }
    return result;
}
