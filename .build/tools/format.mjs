// Format generated modules with Moodle's published lint rules.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {format} from 'prettier';
import {ESLint} from 'eslint';
import {transformAsync} from '@babel/core';
import * as t from '@babel/types';
const here = path.dirname(fileURLToPath(import.meta.url));
const eslint = new ESLint({useEslintrc: false, overrideConfigFile: path.join(here, 'moodle-eslint'),
    resolvePluginsRelativeTo: here, fix: true});
const verifier = new ESLint({useEslintrc: false, overrideConfigFile: path.join(here, 'moodle-eslint'),
    resolvePluginsRelativeTo: here, fix: false});

export async function formatJavaScript(source, filename) {
    const result = await transformAsync(source, {configFile: false, babelrc: false, plugins: [() => ({visitor: {
        ObjectProperty(p) {
            if (!p.node.computed && t.isIdentifier(p.node.key) && p.node.key.name.includes('_')) {
                p.node.key = t.stringLiteral(p.node.key.name);
                p.node.shorthand = false;
                p.node.computed = true;
            }
        },
        ConditionalExpression: {exit(p) {
            if (!t.isConditionalExpression(p.node.consequent) && !t.isConditionalExpression(p.node.alternate)) return;
            const branch = node => t.isConditionalExpression(node)
                ? t.ifStatement(node.test, t.blockStatement([branch(node.consequent)]), t.blockStatement([branch(node.alternate)]))
                : t.returnStatement(node);
            p.replaceWith(t.callExpression(t.arrowFunctionExpression([], t.blockStatement([branch(p.node)])), []));
            p.skip();
        }},
        ImportSpecifier(p) {
            if (p.node.local.name === 'uiLocale' && !p.scope.getBinding('uiLocale')?.referenced) p.remove();
        },
        TemplateLiteral: {exit(p) {
            if ((p.node.end - p.node.start) < 110 || p.parentPath.isTaggedTemplateExpression()) return;
            const pieces = [];
            p.node.quasis.forEach((q, i) => {
                if (q.value.cooked) pieces.push(t.stringLiteral(q.value.cooked));
                if (i < p.node.expressions.length) pieces.push(t.templateLiteral([
                    t.templateElement({raw: '', cooked: ''}), t.templateElement({raw: '', cooked: ''}, true)
                ], [p.node.expressions[i]]));
            });
            if (pieces.length > 1) {
                p.replaceWith(pieces.reduce((left, right) => t.binaryExpression('+', left, right)));
                p.skip();
            }
        }},
        StringLiteral(p) {
            if (p.node.value.length < 110 || p.parentPath.isImportDeclaration() ||
                (p.parentPath.isObjectProperty() && p.key === 'key')) return;
            const chunks = p.node.value.match(/[\s\S]{1,80}/g).map(value => t.stringLiteral(value));
            p.replaceWith(chunks.reduce((left, right) => t.binaryExpression('+', left, right)));
            p.skip();
        },
    }})]});
    let code = await format(result.code, {parser: 'babel', printWidth: 110, tabWidth: 4});
    code = code.replace('const INVALID_XML_CHARACTER =',
        '// eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters; reject them explicitly.\nconst INVALID_XML_CHARACTER =');
    const filePath = path.resolve(here, '../../amd/src', filename);
    let [linted] = await eslint.lintText(code, {filePath});
    code = linted.output ?? code;
    // ESLint adds JSDoc to generated adapter functions. Dynamic values have no fixed public schema.
    code = code.replace(/@param (?!\{)([\w.]+)/g, '@param {*} $1');
    [linted] = await eslint.lintText(code, {filePath});
    code = linted.output ?? code;
    code = await format(code, {parser: 'babel', printWidth: 110, tabWidth: 4});
    [linted] = await eslint.lintText(code, {filePath});
    code = linted.output ?? code;
    // The AIKEN entry point does not consume Moodle import configuration.
    if (filename === 'aiken-app.js') code = code.replace('init = (config)', 'init = ()');
    const [verified] = await verifier.lintText(code, {filePath});
    if (verified.errorCount || verified.warningCount) {
        throw new Error(`${filename}: ${verified.messages.map(message => message.message).join('; ')}`);
    }
    return code;
}
