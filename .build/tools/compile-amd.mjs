// Moodle's locked Rollup/Babel/Terser pipeline; see MOODLE-LINT-NOTICE.md.
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require = createRequire(new URL('../moodle/package.json', import.meta.url));
const {rollup} = require('rollup');
const {transformSync} = require('@babel/core');
const {terser} = require('rollup-plugin-terser');
const here = path.dirname(fileURLToPath(import.meta.url));
export async function compileAmd(name) {
    const input = path.resolve(here, '../../amd/src', name + '.js');
    const bundle = await rollup({input, treeshake: false, context: 'window', plugins: [{
        name: 'babel',
        transform(code, filename) {
            return transformSync(code, {filename, sourceMaps: true, comments: false, compact: false,
                babelrc: false, configFile: false,
                plugins: [require.resolve('babel-plugin-transform-es2015-modules-amd-lazy'),
                    require.resolve('babel-plugin-system-import-transformer'), path.join(here, 'moodle-amd.cjs')],
                presets: [[require.resolve('@babel/preset-env'), {modules: false, useBuiltIns: false,
                    ignoreBrowserslistConfig: true,
                    targets: {chrome: '93', edge: '96', firefox: '95', safari: '13.1', ios: '12.2', samsung: '15'}}]]});
        }
    }, terser({mangle: false, numWorkers: 1})]});
    await bundle.write({file: path.resolve(here, '../../amd/build', name + '.min.js'), format: 'esm', sourcemap: true});
    await bundle.close();
}
