// Development-only inventory. Does not change source files.
import fs from 'node:fs/promises';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default;
for (const file of process.argv.slice(2).filter(x => !x.startsWith('--'))) {
    const prefix = process.argv.includes('--plugin') ? '../uniquiz/amd/src' : '../../js';
    const source = await fs.readFile(new URL(`${prefix}/${file}.js`, import.meta.url), 'utf8');
    const ast = parse(source, {sourceType: 'module'});
    const rows = [];
    traverse(ast, { 'StringLiteral|TemplateLiteral'(p) {
        if (p.parent.type === 'ImportDeclaration' || p.parent.type === 'ExportNamedDeclaration') return;
        const value = p.isStringLiteral() ? p.node.value : p.node.quasis.map(x => x.value.cooked).join('{$}');
        if (!/[a-z]/i.test(value) || (!process.argv.includes('--all') && !/\s/.test(value)) ||
            /^\s*[<.:#[]/.test(value) || value.startsWith('js_')) return;
        rows.push(`${p.node.loc.start.line}: ${JSON.stringify(value)} (${p.parent.type}:${p.key})`);
    }});
    console.log(file + '\n' + rows.join('\n'));
}
