// Plugin-only, syntax-aware localization. The standalone parser and wire formats stay unchanged.
import {createHash} from 'node:crypto';
import {transformAsync} from '@babel/core';
import * as t from '@babel/types';
import {parseFragment} from 'parse5';

export const catalogue = new Map();

function register(prefix, value, location, params = []) {
    const slug = value.replace(/\{\$a->p\d+\}/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
    const key = `${prefix}_${slug || 'text'}_${createHash('sha256').update(value).digest('hex').slice(0, 8)}`;
    const existing = catalogue.get(key) ?? {value, locations: [], params};
    if (existing.value !== value) throw new Error(`Language key collision: ${key}`);
    existing.locations.push(location);
    catalogue.set(key, existing);
    return key;
}

function functionName(p) {
    return p.findParent(x => x.isFunctionDeclaration())?.node.id?.name ?? '';
}

function technical(p, file) {
    if (p.findParent(x => x.isImportDeclaration())) return true;
    // This function creates exported data, not UI labels. Never translate generated question names.
    if (file === 'core' && functionName(p) === 'applySettings') return true;
    if (p.parentPath.isNewExpression() && p.parent.callee.name === 'RegExp') return true;
    if (p.findParent(x => x.isAssignmentExpression() && x.node.left.type === 'MemberExpression' &&
        ['className', 'id', 'type', 'value', 'download', 'href'].includes(x.node.left.property.name))) return true;
    if (p.parentPath.isCallExpression()) {
        const call = p.parent.callee;
        if (call.type === 'Identifier' && ['$', '$$'].includes(call.name)) return true;
        if (call.type === 'MemberExpression' && ['querySelector', 'querySelectorAll', 'matchMedia', 'closest',
            'matches', 'getAttribute', 'removeAttribute'].includes(call.property.name)) return true;
        if (call.type === 'MemberExpression' && call.object?.property?.name === 'classList') return true;
    }
    return false;
}

export async function localizeJavaScript(file, source) {
    const result = await transformAsync(source, {
        configFile: false, babelrc: false, sourceType: 'module',
        plugins: [() => ({visitor: {
            'StringLiteral|TemplateLiteral': {exit(p) {
                if (p.node._localized || technical(p, file)) return;
                const value = p.isStringLiteral() ? p.node.value
                    : p.node.quasis.map((q, i) => q.value.cooked + (i < p.node.expressions.length ? `{$a->p${i}}` : '')).join('');
                if (value === 'en-US' && p.parentPath.isCallExpression() && p.parent.callee.property?.name === 'toLocaleString') {
                    p.replaceWith(t.callExpression(t.identifier('uiLocale'), []));
                    p.skip();
                    return;
                }
                // Machine syntax, examples and selector fragments are never language strings.
                if (/^\s*</.test(value) || /^(?:ANSWER:|\\b|\$course\$|:scope|question\[)/.test(value) ||
                    /^(?:notice|button) [a-z-]/.test(value) ||
                    ['no numbering', 'name > text', 'questiontext > text'].includes(value)) return;
                if (file === 'core' && functionName(p) === 'parseCsv' && /^Column /.test(value)) return;
                const literalText = value.replace(/\{\$a->p\d+\}/g, '');
                const prose = /[a-z]/i.test(literalText) && /\s/.test(value) && !/^\(/.test(value);
                const displayWord = ['Yes', 'No', 'Ready', 'Category', 'Grading', 'Tags', 'True/False',
                    'Numerical', 'Essay', 'Description', 'Before', 'Proposed'].includes(value) &&
                    !(p.parentPath.isBinaryExpression() || (p.parentPath.isObjectProperty() && p.key === 'key'));
                const noun = ['question', 'questions', 'warning', 'warnings', 'error', 'errors', 'answer', 'answers',
                    'feedback', 'feedbacks', 'single-answer', 'multiple-answer', 'valid'].includes(value) &&
                    (file !== 'core' || functionName(p) === 'formatReadinessSummary') &&
                    (p.parentPath.isConditionalExpression() && ['consequent', 'alternate'].includes(p.key) ||
                    p.parentPath.isCallExpression() && p.parent.callee.name === 'metric' && p.key === 1);
                if (!prose && !displayWord && !noun) return;
                const expressions = p.isTemplateLiteral() ? p.node.expressions : [];
                const key = register(`js_${file.replaceAll('-', '_')}`, value.replace(/`([^`]+)`/g, '“$1”'), `${file}:${p.node.loc?.start.line ?? '?'}`,
                    expressions.map((e, i) => `p${i}: ${e.type === 'Identifier' ? e.name : 'dynamic display value'}`));
                const args = [t.stringLiteral(key)];
                if (expressions.length) args.push(t.objectExpression(expressions.map((e, i) => t.objectProperty(t.identifier(`p${i}`), e))));
                p.replaceWith(t.callExpression(t.identifier('uiString'), args));
                p.skip();
            }},
        }})],
    });
    return `import {string as uiString, locale as uiLocale} from 'qbank_uniquiz/i18n';\n${result.code}\n`;
}

// Escape translations with normal Mustache variables, including inside attributes.
// Code/pre examples and machine option values remain literal. Never translate dynamic question content.
export function localizeTemplate(name, source) {
    const root = parseFragment(source, {sourceCodeLocationInfo: true});
    const edits = [];
    function visit(node, inCode = false) {
        const code = inCode || ['pre', 'code', 'script', 'style'].includes(node.tagName);
        if (!code && node.nodeName === '#text' && node.sourceCodeLocation) {
            const value = node.value.trim();
            if (/[a-z]/i.test(value) && !value.includes('{{')) {
                const key = register('ui', value, `${name}:text`);
                const loc = node.sourceCodeLocation;
                const raw = source.slice(loc.startOffset, loc.endOffset);
                const leading = raw.match(/^\s*/)[0];
                const trailing = raw.match(/\s*$/)[0];
                edits.push([loc.startOffset, loc.endOffset, `${leading}{{lang.${key}}}${trailing}`]);
            }
        }
        for (const attr of node.attrs ?? []) {
            if (['title', 'aria-label', 'placeholder', 'alt'].includes(attr.name) && /[a-z]/i.test(attr.value) &&
                !attr.value.includes('{{')) {
                const loc = node.sourceCodeLocation.attrs[attr.name];
                const key = register('ui', attr.value, `${name}:${attr.name}`);
                edits.push([loc.startOffset, loc.endOffset, `${attr.name}="{{lang.${key}}}"`]);
            }
        }
        for (const child of node.childNodes ?? []) visit(child, code);
    }
    visit(root);
    for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + value + source.slice(end);
    return source;
}

export function languagePhp(nativeSource) {
    const quote = value => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
    const firstKey = nativeSource.indexOf('$string[');
    if (firstKey < 0) throw new Error('Native language strings missing');
    const entries = [...nativeSource.matchAll(/^\$string\['([^']+)'\] = .+;$/gm)]
        .map(match => [match[1], match[0] + '\n']);
    entries.push(...[...catalogue].map(([key, entry]) => [key,
        `$string[${quote(key)}] = ${quote(entry.value)};\n`]));
    if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error('Duplicate language key');
    return nativeSource.slice(0, firstKey) +
        '// Generated from native messages and UI sources; edit the sources, then rebuild.\n' +
        entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, block]) => block).join('');
}
