const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium, edgeExecutable} = require('./playwright-runtime.cjs');
const root = path.resolve(__dirname, '../source');
const dir = process.env.UNIQUIZ_QA_RESULTS;
async function run(browser, branch) {
    const report = JSON.parse(await fs.readFile(path.join(dir, `${branch}-integration.json`), 'utf8'));
    const base = new URL(report.url).origin;
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const checks = [];
    const check = (ok, message) => {assert.ok(ok, message); checks.push(message);};
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.querySelector('#qbank-uniquiz')?.dataset.initialized === 'true');
    const review = async(file) => {
        await page.goto(report.url); await ready();
        await page.locator('#file-input').setInputFiles(file);
        await page.locator('#consent').check(); await page.locator('#analyse-button').click();
        await page.locator('[data-step="2"]:visible').waitFor();
        await page.locator('#to-settings').click(); await page.locator('#to-review').click();
        await page.locator('[data-step="4"]:visible').waitFor();
    };
    try {
        await page.goto(base + '/login/index.php');
        await page.locator('#username').fill('uniquizteacher');
        await page.locator('#password').fill('UniQuizTeacherTest!');
        await Promise.all([page.waitForURL(url => !url.pathname.endsWith('/login/index.php')), page.locator('#loginbtn').click()]);
        await page.goto(report.url); await ready();
        check((await page.locator('#analyse-button').innerText()).startsWith('⟦'), 'Static template uses Moodle language customization');
        check((await page.locator('[aria-label*="Conversion progress"]').getAttribute('aria-label')).includes('<img'),
            'Malicious translation remains literal in an attribute');
        check(await page.locator('#uq-xss').count() === 0, 'Translation cannot inject template elements');
        await page.locator('#file-input').setInputFiles({name: 'mapping.csv', mimeType: 'text/csv',
            buffer: Buffer.from('Prompt,Column 5,,Key\nTest?,Yes,No,A')});
        await page.locator('#consent').check(); await page.locator('#analyse-button').click();
        await page.locator('#mapping-panel:visible').waitFor();
        const labels = await page.locator('#mapping-fields strong').allTextContents();
        check(labels[1] === 'Column 5', 'User-supplied column headers remain data even when named like a fallback');
        check(labels[2] === '⟦Column 3⟧', 'Only synthetic missing-column labels are translated');
        for (const [index, role] of ['question', 'answer:A', 'answer:B', 'correct'].entries()) {
            await page.locator('#mapping-fields select').nth(index).selectOption(role);
        }
        await page.locator('#apply-mapping').click();
        check(!await page.locator('#to-settings').isDisabled(), 'Manual mapping works with translated labels and invariant roles');
        await review(path.join(root, 'examples/uniquiz-question-types.csv'));
        check(await page.locator('.question-card').count() === 6, 'Translated review retains all six types');
        check((await page.locator('#qbank-uniquiz').innerText()).includes('⟦Ready⟧'), 'Dynamic JavaScript labels translated');
        await page.locator('#generate-button').click();
        await page.locator('[data-step="5"]:visible').waitFor();
        const event = page.waitForEvent('download'); await page.locator('#download-button').click();
        await (await event).saveAs(path.join(dir, `${branch}-pseudo.xml`));
        check(await fs.readFile(path.join(dir, `${branch}-pseudo.xml`), 'utf8') ===
            await fs.readFile(path.join(dir, `${branch}-download.xml`), 'utf8'), 'Translated UI produces byte-identical XML');
        check(await page.locator('#uq-import').isDisabled(), 'Translated workflow still requires confirmation');
        await page.locator('#uq-confirm').check();
        const response = page.waitForResponse(r => r.url().endsWith('/uniquiz/import.php'));
        await page.locator('#uq-import').click();
        const result = await (await response).json();
        check(result.success && result.count === 6 && result.message.startsWith('⟦'), 'Confirmed import and server response use translated workflow');
        await review({name: '<img onerror=x>.csv', mimeType: 'text/csv',
            buffer: Buffer.from('question_text,answer_1,answer_2,correct\n<img id=uq-content-xss src=x onerror=window.uqXss=1>,Yes,No,')});
        check(await page.locator('#generate-button').isDisabled(), 'Translated blocking diagnostics remain blocking');
        check((await page.locator('#qbank-uniquiz').innerText()).includes('<img id="uq-xss"'), 'Dynamic diagnostic translation is literal text');
        check(await page.locator('#uq-xss, #uq-content-xss').count() === 0 && !await page.evaluate(() => window.uqXss),
            'Untrusted content, filename and translations execute no script');
        await page.goto(report.url + '&tool=aiken'); await ready();
        await page.locator('#aiken-source').fill('Capital?\na) Vienna\nb) Budapest\nanswer: b');
        await page.locator('#check-aiken').click(); await page.locator('#aiken-results:visible').waitFor();
        check((await page.locator('#aiken-results').innerText()).includes('⟦Safe fix⟧'), 'AIKEN severity display translated without changing codes');
        await page.locator('#fix-safe').click();
        check((await page.locator('#aiken-corrected').inputValue()).includes('ANSWER: B'), 'Translated AIKEN fixer preserves wire syntax');
        await page.goto(report.url.replace('/index.php?', '/help.php?'));
        check((await page.locator('body').innerText()).includes('⟦Basic CSV⟧'), 'Guide uses native language customization');
        check(errors.length === 0, 'No browser exceptions under pseudolanguage');
        await fs.writeFile(path.join(dir, `${branch}-pseudolang.json`), JSON.stringify({passed: checks.length, checks}, null, 2));
        console.log(`${branch}: ${checks.length} pseudolanguage checks passed`);
    } catch (error) {
        await page.screenshot({path: path.join(dir, `${branch}-pseudo-failure.png`), fullPage: true});
        throw error;
    } finally {await context.close();}
}
(async() => {
    const browser = await chromium.launch({executablePath: edgeExecutable, headless: true});
    try {for (const branch of (process.argv.slice(2).length ? process.argv.slice(2) : ['45', '52'])) await run(browser, branch);} finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
