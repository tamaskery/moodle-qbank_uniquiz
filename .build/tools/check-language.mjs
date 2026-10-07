import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as original from '../source/js/core.js';
import * as aiken from '../source/js/aiken-core.js';
import * as preview from '../source/js/preview.js';
const root = new URL('../source/', import.meta.url);
const catalogue = JSON.parse(await fs.readFile(new URL('./language-catalogue.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await fs.readFile(new URL('./language-registry.json', import.meta.url), 'utf8'));
const migration = JSON.parse(await fs.readFile(new URL('./language-key-migration-0.1.4.json', import.meta.url), 'utf8'));
assert.deepEqual(new Set(Object.values(migration)), new Set(Object.keys(registry)), 'Migration must cover every stable key');
assert.equal(Object.values(migration).length, new Set(Object.values(migration)).size, 'Migration must not merge translations');
for (const [key, entry] of Object.entries(catalogue)) {
    assert.ok(!/_[0-9a-f]{8}$/.test(key), 'Text hashes are not stable identifiers');
    assert.equal(registry[key].value, entry.value, 'Registry and extracted English differ');
}
const definitions = new Map();
const cache = new Map();
const context = vm.createContext({define: (name, deps, factory) => definitions.set(name, {deps, factory}),
    TextDecoder, TextEncoder, URL, Blob, console});
for (const name of ['i18n', 'core', 'aiken-core', 'preview', 'timing']) {
    vm.runInContext(await fs.readFile(new URL(`../../amd/build/${name}.min.js`, import.meta.url), 'utf8'), context);
}
function load(name) {
    if (cache.has(name)) return cache.get(name);
    const def = definitions.get(name);
    const exports = {};
    cache.set(name, exports);
    def.factory(...def.deps.map(dep => dep === 'exports' ? exports : load(dep)));
    return exports;
}
const i18n = load('qbank_uniquiz/i18n');
const keys = Object.keys(catalogue).filter(key => key.startsWith('js_'));
const values = keys.map(key => catalogue[key].value);
const engine = load('qbank_uniquiz/core');
const translatedAiken = load('qbank_uniquiz/aiken-core');
const translatedPreview = load('qbank_uniquiz/preview');
const settings = {answerNumbering: 'abc', shuffleAnswers: true, generateNames: false, removeQuestionNumbering: false};
let checks = 0;
for (const pseudo of [false, true]) {
    i18n.configure(keys, values.map(s => pseudo ? `⟦${s}⟧` : s), pseudo ? 'de_kids' : 'en');
    for (const name of ['examples/uniquiz-question-types.csv', 'examples/uniquiz-advanced-template.csv',
        'examples/uniquiz-template.csv', 'tests/fixtures/diagnostics-warning-moodle.csv']) {
        const source = await fs.readFile(new URL(name, root), 'utf8');
        const expected = original.generateMoodleXml(original.applySettings(original.parseCsv(source).questions, settings), settings);
        const actual = engine.generateMoodleXml(engine.applySettings(engine.parseCsv(source).questions, settings), settings);
        assert.equal(actual, expected, `Language changed exported question data: ${name}`);
        checks++;
    }
    const source = 'Question $& {$a->p0}?\na) <Yes>\nb) No\nanswer: a';
    assert.equal(translatedAiken.applySafeAikenFixes(source), aiken.applySafeAikenFixes(source));
    checks++;
    for (const severity of ['warning', 'error']) {
        const parsed = engine.parseCsv('question_text,answer_1,answer_2,correct\nTest?,Yes,No,A');
        const validated = engine.validateQuestions(parsed.questions, [{severity, message: 'Legacy diagnostic'}]);
        assert.equal(validated[severity === 'warning' ? 'warnings' : 'errors'][0].severity, severity);
        checks++;
    }
    const result = engine.validateQuestions(engine.applySettings(engine.parseCsv('question_text,answer_1,answer_2,correct\nTest?,Yes,No,Z').questions, settings));
    assert.equal(result.errors[0].title.startsWith('⟦'), pseudo);
    checks++;
    if (!pseudo) assert.equal(translatedPreview.formatPreviewResultSummary(2, 'test', 'warning'), preview.formatPreviewResultSummary(2, 'test', 'warning'));
}
i18n.configure(['test'], ['{$a->p0} / {$a->p1}'], 'de_kids');
assert.equal(i18n.string('test', {p0: '$& {$a->p1} <script>', p1: 'SAFE'}), '$& {$a->p1} <script> / SAFE');
assert.equal(new Intl.NumberFormat(i18n.locale()).format(1234.5), new Intl.NumberFormat('de').format(1234.5));
assert.throws(() => i18n.string('__proto__'));
const english = await fs.readFile(new URL('../../lang/en/qbank_uniquiz.php', import.meta.url), 'utf8');
const englishKeys = [...english.matchAll(/^\$string\['([^']+)'\]/gm)].map(match => match[1]);
assert.equal(new Set(englishKeys).size, englishKeys.length, 'Duplicate English language key');
assert.deepEqual(englishKeys, [...englishKeys].sort(), 'English language keys must be alphabetically sorted');
console.log(`${checks + 4} language invariance/interpolation checks passed; ${keys.length} JS and ${Object.keys(catalogue).length - keys.length} template strings extracted.`);
console.log(`${englishKeys.length} English language keys are unique and alphabetically sorted.`);
