import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {transformAsync} from '@babel/core';
import amd from '@babel/plugin-transform-modules-amd';
import {minify} from 'terser';
import postcss from 'postcss';
import {localizeJavaScript, localizeTemplate, languagePhp, catalogue} from './localize.mjs';
import {formatJavaScript} from './format.mjs';
import stylelint from 'stylelint';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../source');
const plugin = path.resolve(here, '../..');
const read = (name) => fs.readFile(path.join(root, name), 'utf8');
const write = async (name, value) => {
    if (name.startsWith('templates/')) {
        const lang = {};
        for (const match of value.matchAll(/\{\{lang\.([^}]+)\}\}/g)) lang[match[1]] = catalogue.get(match[1]).value;
        const context = {lang, config: '{}', baseurl: 'https://example.invalid/question/bank/uniquiz',
            helpurl: 'https://example.invalid/help', converterurl: 'https://example.invalid/convert',
            bankurl: 'https://example.invalid/questions', categories: [{id: 1, name: 'Example category', selected: true}],
            importintro: 'Review and confirm import.', destinationlabel: 'Destination', categorypolicy: 'Use this category.',
            importconfirm: 'Import questions', returnbank: 'Return to question bank'};
        value = `{{!\n    @template qbank_uniquiz/${path.basename(name, '.mustache')}\n\n    UniQuiz interface.\n\n    Example context (json):\n    ${JSON.stringify(context, null, 4).replaceAll('\n', '\n    ')}\n}}\n` + value;
    }
    const target = path.join(plugin, name);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, value);
};
const banner = '/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */\n';
const hashes = {};
for (const name of ['core', 'preview', 'timing', 'app', 'aiken-core', 'aiken-app', 'i18n', 'bootstrap']) {
    const adapter = ['i18n', 'bootstrap'].includes(name);
    const original = adapter ? await fs.readFile(path.join(here, name + '.js'), 'utf8') : await read(`js/${name}.js`);
    if (!adapter) hashes[`js/${name}.js`] = createHash('sha256').update(original).digest('hex');
    let source = original;
    if (name === 'app') {
        source = source.replace('label.textContent = header;', 'label.textContent = !state.parsed.rows[0][index]?.trim() ? `Column ${index + 1}` : header;');
        source = source.replace('function resetGeneratedFile() {', 'function resetGeneratedFile() {\n  resetImport();');
        source = source.replace('function resetConversion() {', 'function resetConversion() {\n  if (importDone) { window.location.reload(); return; }');
        source = source.replace('renderMetrics(elements.finalSummary, result, { errors: [] });',
            'renderMetrics(elements.finalSummary, result, { errors: [] });\n      prepareImport(xml, result.total);');
    }
    if (name === 'aiken-app') {
        source = source.replace('severity.textContent = item.severity.replace("_", " ");',
            'severity.textContent = ({SAFE_FIX: "Safe fix", REVIEW: "Review required", ERROR: "Blocking error"})[item.severity];');
    }
    if (!adapter) source = await localizeJavaScript(name, source);
    source = source.replace(/from ["']\.\/([\w-]+)\.js\?v=[^"']+["']/g, 'from "qbank_uniquiz/$1"');
    if (name === 'app' || name === 'aiken-app') {
        const imports = [...source.matchAll(/^import[\s\S]*?;\r?\n/gm)].map((match) => match[0]).join('');
        source = source.replace(/^import[\s\S]*?;\r?\n/gm, '');
        source = source.replaceAll('root = document', 'root = container');
        source = source.replaceAll('document.body.setAttribute', 'container.setAttribute')
            .replaceAll('document.body.removeAttribute', 'container.removeAttribute');
        source = source.replace('helpLink.href = "/guide/#faq";', 'helpLink.href = config.helpurl;');
        if (name === 'app') {
            source = (await fs.readFile(path.join(here, 'bridge.js'), 'utf8')) + '\n' + source;
        }
        source = imports + `\nexport const init = (config) => {\nconst container = document.getElementById('qbank-uniquiz');\nif (!container || container.dataset.initialized) return;\ncontainer.dataset.initialized = 'true';\n${source}\n};\n`;
    }
    source = await formatJavaScript(source, `${name}.js`);
    if (name === 'aiken-app') source = source.replace('init = (config)', 'init = ()');
    await write(`amd/src/${name}.js`, banner + source);
    const compiled = await transformAsync(banner + source, {
        sourceMaps: true, sourceFileName: `../src/${name}.js`,
        plugins: [[amd, {moduleIds: true, moduleId: `qbank_uniquiz/${name}`}]],
    });
    const built = await minify(compiled.code, {
        format: {comments: false, preamble: banner.trim()},
        sourceMap: {content: compiled.map, filename: `${name}.min.js`, url: `${name}.min.js.map`, includeSources: true},
    });
    await write(`amd/build/${name}.min.js`, built.code + '\n');
    await write(`amd/build/${name}.min.js.map`, built.map + '\n');
}

// Extract the proven UI, with only the Moodle-specific shell, links and final hand-off changed.
const converter = await read('convert/index.html');
let markup = converter.match(/<main[\s\S]*?<\/main>/)[0]
    .replace('<main id="main" class="app-shell">', '<div class="app-shell">').replace('</main>', '</div>');
markup = markup.replace(/<section class="hero"[\s\S]*?<\/section>/,
    '<p class="microcopy">Choose a file, review the complete question bank, then download XML or import into Moodle.</p>');
markup = markup.replace(/<span>I agree to the[\s\S]*?<\/span>/,
    '<span>I understand that file analysis happens in this browser. Confirming import sends the prepared questions to this Moodle site.</span>');
markup = markup.replace('Question content is read locally and is never intentionally sent to the UniQuiz server.',
    'Analysis stays in your browser. Questions are sent to Moodle only when you confirm import.');
markup = markup.replace('Creates this category beneath Moodle’s top question-bank category.',
    'Used in the XML download. Direct import uses the destination selected in the final step.');
markup = markup.replaceAll('href="../examples/', 'href="{{baseurl}}/examples/')
    .replaceAll('href="/guide/"', 'href="{{helpurl}}" target="_blank" rel="noopener"');
markup = markup.replace('<strong>Download</strong>', '<strong>Import</strong>');
markup = markup.replace('Your questions are ready to import. We checked the file structure and grading one last time.',
    'Review the destination below, then confirm import or download the XML.');
const finalActions = `
<section class="uq-import-panel" aria-labelledby="uq-import-title">
  <h3 id="uq-import-title">Import into Moodle</h3>
  <p>{{importintro}}</p>
  <label class="field" for="uq-destination"><span>{{destinationlabel}}</span>
    <select id="uq-destination">{{#categories}}<option value="{{id}}" {{#selected}}selected{{/selected}}>{{name}}</option>{{/categories}}</select>
  </label>
  <p class="microcopy">{{categorypolicy}}</p>
  <label class="consent-box"><input type="checkbox" id="uq-confirm"><span>I have reviewed these questions and want to add them to the selected category.</span></label>
  <button id="uq-import" type="button" class="button button-primary" disabled>{{importconfirm}}</button>
  <div id="uq-import-status" role="status" aria-live="polite" tabindex="-1"></div>
  <a id="uq-return" class="button button-secondary" href="{{bankurl}}" hidden>{{returnbank}}</a>
</section>`;
markup = markup.replace('      <a id="download-button"', finalActions + '\n      <a id="download-button"');
const processing = converter.match(/  <div id="processing"[\s\S]*?(?=\s*<\/body>)/)[0];
await write('templates/converter.mustache', localizeTemplate('converter', '{{! Generated from the standalone converter by build-tools/build.mjs. }}\n<div id="qbank-uniquiz" data-config="{{config}}">\n' + markup + processing + '\n</div>\n'));

const aiken = await read('aiken-fixer/index.html');
let aikenMarkup = aiken.match(/<main[\s\S]*?<\/main>/)[0]
    .replace('<main id="main" class="aiken-shell">', '<div class="aiken-shell">').replace('</main>', '</div>')
    .replaceAll('href="/convert/"', 'href="{{converterurl}}"')
    .replace('<a id="download-aiken"', '<a href="#" id="download-aiken"');
await write('templates/aiken.mustache', localizeTemplate('aiken', '<div id="qbank-uniquiz" data-config="{{config}}">' + aikenMarkup +
    aiken.match(/  <div id="aiken-processing"[\s\S]*?(?=\s*<\/body>)/)[0] + '</div>\n'));
await write('templates/help.mustache', localizeTemplate('help', await fs.readFile(path.join(here, 'help.mustache'), 'utf8')));
await write('lang/en/qbank_uniquiz.php', languagePhp(await fs.readFile(path.join(here, 'lang-en.php'), 'utf8')));
await fs.writeFile(path.join(here, 'language-catalogue.json'), JSON.stringify(Object.fromEntries(catalogue), null, 2) + '\n');

// Every CSS selector is scoped. Moodle concatenates plugin styles across the site.
let css = postcss.parse((await read('styles.css')) + '\n' + (await read('aiken.css')));
css.walkRules((rule) => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map((selector) => {
        if (/^(?::root|html|body)(?=$|[\s.:#[])/.test(selector)) {
            return selector.replace(/^(?::root|html|body)/, '#qbank-uniquiz');
        }
        return `#qbank-uniquiz ${selector}`;
    });
});
const animations = [];
css.walkDecls((decl) => {
    if (!decl.important) return;
    const rules = /duration$/.test(decl.prop) ? 'declaration-no-important, time-min-milliseconds' : 'declaration-no-important';
    decl.before(postcss.comment({text: `stylelint-disable ${rules} -- Enforce hidden content and reduced-motion accessibility overrides.`}));
    decl.after(postcss.comment({text: `stylelint-enable ${rules}`}));
});
css.walkAtRules(/keyframes$/, (rule) => { animations.push(rule.params); rule.params = 'uq-' + rule.params; });
css.walkDecls(/^animation/, (decl) => {
    for (const name of animations) decl.value = decl.value.replace(new RegExp(`\\b${name}\\b`, 'g'), 'uq-' + name);
});
await write('styles.css', '/* Generated, scoped UniQuiz styles. GNU GPL v3 or later. */\n' + css.toString() + `
#qbank-uniquiz { display: flow-root; }
#qbank-uniquiz { font-family: inherit; }
#qbank-uniquiz .app-shell { width: 100%; max-width: 1100px; margin: 0 auto; }
#qbank-uniquiz .uq-import-panel { text-align: left; margin: 2rem 0; padding: 1.5rem; border: 1px solid var(--border); border-radius: 12px; }
#qbank-uniquiz #uq-import { margin-top: 1rem; }
#qbank-uniquiz #uq-import-status { margin: 1rem 0; white-space: pre-wrap; }
#qbank-uniquiz .processing { z-index: 1060; }
`);
for (const name of ['uniquiz-template.csv', 'uniquiz-advanced-template.csv', 'uniquiz-question-types.csv']) {
    await write('examples/' + name, await read('examples/' + name));
}
await write('ENGINE-SOURCES.json', JSON.stringify({version: (await read('VERSION')).trim(), files: hashes}, null, 2) + '\n');
console.log('Built qbank_uniquiz AMD modules, templates, scoped styles, examples and engine hashes.');
const styles = await fs.readFile(path.join(plugin, 'styles.css'), 'utf8');
const formattedStyles = await stylelint.lint({code: styles, configFile: path.join(here, 'moodle-stylelint'), fix: true});
await write('styles.css', formattedStyles.code ?? formattedStyles.output);
