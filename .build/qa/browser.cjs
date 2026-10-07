const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium, edgeExecutable} = require('./playwright-runtime.cjs');
const root = path.resolve(__dirname, '../source');
const resultsDir = process.env.UNIQUIZ_QA_RESULTS;

async function listingScreenshot(page, filename) {
    const viewport = page.viewportSize();
    // Keep the entire wizard in the viewport so Moodle's sticky site chrome
    // cannot be painted across a stitched full-page screenshot.
    await page.setViewportSize({width: 1440, height: 2600});
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForLoadState('networkidle');
    await page.locator('#qbank-uniquiz').screenshot({path: filename});
    await page.setViewportSize(viewport);
}

async function login(page, base, username = 'uniquizteacher') {
    await page.goto(base + '/login/index.php');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(username === 'admin' ? 'UniQuizPluginTest!' : 'UniQuizTeacherTest!');
    await Promise.all([page.waitForURL(url => !url.pathname.endsWith('/login/index.php')), page.locator('#loginbtn').click()]);
}

async function reviewFile(page, filename) {
    await page.waitForFunction(() => document.querySelector('#qbank-uniquiz')?.dataset.initialized === 'true');
    await page.locator('#file-input').setInputFiles(typeof filename === 'string'
        ? (path.isAbsolute(filename) ? filename : path.join(root, filename)) : filename);
    await page.locator('#consent').check();
    await page.locator('#analyse-button').click();
    await page.locator('[data-step="2"]:visible').waitFor();
    await page.locator('#to-settings').click();
    await page.locator('#to-review').click();
    await page.locator('[data-step="4"]:visible').waitFor();
}

async function run(browser, branch) {
    const report = JSON.parse(await fs.readFile(path.join(resultsDir, `${branch}-integration.json`), 'utf8'));
    const base = new URL(report.url).origin;
    const context = await browser.newContext({viewport: {width: 1440, height: 1050}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    const checks = [];
    const check = (ok, message) => { assert.ok(ok, message); checks.push(message); };
    const jsErrors = [];
    page.on('pageerror', error => jsErrors.push(error.message));
    try {
        await login(page, base);
        await page.goto(report.url);
        if (!await page.locator('#qbank-uniquiz').count()) {
            throw new Error((await page.locator('body').innerText()).slice(0, 6000));
        }
        await page.waitForFunction(() => document.querySelector('#qbank-uniquiz')?.dataset.initialized === 'true');
        check((await page.locator('.debuggingmessage').count()) === 0, 'No Moodle developer warnings');
        await listingScreenshot(page, path.join(resultsDir, `${branch}-upload.png`));
        await reviewFile(page, 'examples/uniquiz-question-types.csv');
        check(await page.locator('.question-card').count() === 6, 'All six question types previewed');
        await page.locator('#preview-search').fill('pi');
        check(await page.locator('.question-card').count() < 6, 'Search filters preview');
        await page.locator('#clear-preview-search').click();
        await listingScreenshot(page, path.join(resultsDir, `${branch}-review.png`));
        await page.locator('#generate-button').click();
        await page.locator('[data-step="5"]:visible').waitFor();
        check(await page.locator('#uq-import').isDisabled(), 'Explicit confirmation required');
        check(await page.locator('#uq-destination').inputValue() === String(report.categoryid), 'Current category selected');
        const downloadEvent = page.waitForEvent('download');
        await page.locator('#download-button').click();
        const download = await downloadEvent;
        await download.saveAs(path.join(resultsDir, `${branch}-download.xml`));
        const xml = await fs.readFile(path.join(resultsDir, `${branch}-download.xml`), 'utf8');
        check((xml.match(/<question type=/g) || []).length === 6, 'Download retains all six questions');

        let submitted;
        page.on('request', request => {
            if (request.url().endsWith('/uniquiz/import.php') && request.method() === 'POST') {
                submitted = Object.fromEntries(new URLSearchParams(request.postData()));
            }
        });
        await page.locator('#uq-confirm').check();
        for (const [field, value] of [['token', 'expiredtesttoken'], ['sesskey', 'invalid'],
            ['categoryid', String(report.othercategoryid)]]) {
            const endpoint = '**/uniquiz/import.php';
            await page.route(endpoint, route => {
                const form = new URLSearchParams(route.request().postData());
                form.set(field, value);
                return route.continue({postData: form.toString()});
            });
            const rejectedResponse = page.waitForResponse(r => r.url().endsWith('/uniquiz/import.php'));
            await page.locator('#uq-import').click();
            const rejected = await (await rejectedResponse).json();
            check(typeof rejected.error === 'string' && rejected.error.length > 0,
                `Native Moodle AJAX error returned for ${field}`);
            await page.waitForFunction(message => document.querySelector('#uq-import-status').textContent === message,
                rejected.error);
            check(await page.locator('#uq-import').isEnabled(), `Native ${field} error is displayed and retry remains available`);
            await page.unroute(endpoint);
        }
        const importResponse = page.waitForResponse(response => response.url().endsWith('/uniquiz/import.php'));
        await page.locator('#uq-import').click();
        const response = await importResponse;
        const imported = await response.json();
        check(imported.success && imported.count === 6, `Confirmed direct import: ${JSON.stringify(imported)}`);
        await page.locator('#uq-return:visible').waitFor();
        check(await page.locator('#uq-import').isDisabled(), 'Completed import cannot be double-clicked');
        await listingScreenshot(page, path.join(resultsDir, `${branch}-imported.png`));
        const retry = await context.request.post(base + '/question/bank/uniquiz/import.php', {form: submitted});
        check(JSON.stringify(await retry.json()) === JSON.stringify(imported), 'Identical retry returns original receipt');
        const changed = await context.request.post(base + '/question/bank/uniquiz/import.php', {form: {...submitted, xml: submitted.xml.replace('Budapest', 'Changed')}});
        check(!(await changed.json()).success, 'Reused token with changed content rejected');
        const csrf = await context.request.post(base + '/question/bank/uniquiz/import.php', {form: {...submitted, sesskey: 'invalid'}});
        check(!(await csrf.json()).success, 'Invalid CSRF token rejected');
        const foreign = await context.request.post(base + '/question/bank/uniquiz/import.php', {form: {...submitted, categoryid: String(report.othercategoryid)}});
        check(!(await foreign.json()).success, 'Foreign category rejected by HTTP endpoint');
        const get = await context.request.get(base + '/question/bank/uniquiz/import.php', {params: submitted});
        check(!(await get.json()).success, 'GET cannot import');
        await page.locator('#uq-return').click();
        await page.getByText('Capital of Hungary', {exact: true}).first().waitFor();
        check(true, 'Imported questions visible in native bank');

        await page.goto(report.url);
        await reviewFile(page, path.join(resultsDir, 'text-fidelity.csv'));
        check((await page.locator('.question-card').first().innerText()).includes('a<b and c>d'), 'Preview preserves literal comparisons');
        check(await page.locator('.question-card h4').first().evaluate(el => getComputedStyle(el).whiteSpace) === 'pre-wrap',
            'Preview preserves multiline layout');
        await page.locator('#generate-button').click();
        await page.locator('[data-step="5"]:visible').waitFor();
        const token = await page.locator('#qbank-uniquiz').evaluate(el => JSON.parse(el.dataset.config).token);
        const fidelityXml = await fs.readFile(path.join(resultsDir, 'text-fidelity.xml'), 'utf8');
        const fresh = {...submitted, token, count: '2', xml: fidelityXml};
        const invalid = await context.request.post(base + '/question/bank/uniquiz/import.php', {
            form: {...fresh, xml: fidelityXml.replace(/<defaultgrade>[^<]+<\/defaultgrade>/, '<defaultgrade>SECRET</defaultgrade>')},
        });
        const invalidResult = await invalid.json();
        check(invalid.status() === 422 && invalidResult.message.includes('Question 1, defaultgrade') &&
            !invalidResult.message.includes('SECRET'), 'Validation HTTP 422 identifies question and field without source content');
        const failed = await context.request.post(base + '/question/bank/uniquiz/import.php', {
            form: {...fresh, xml: fidelityXml.replace(/<defaultgrade>[^<]+<\/defaultgrade>/, '<defaultgrade>1e100</defaultgrade>')},
        });
        const failedResult = await failed.json();
        check(failed.status() === 500 && /^[a-f0-9]{16}$/.test(failedResult.reference) &&
            !JSON.stringify(failedResult).includes('1e100'), 'Unexpected HTTP 500 returns safe incident reference');
        await fs.writeFile(path.join(resultsDir, `${branch}-error-reference.json`), JSON.stringify(failedResult, null, 2));
        const oversized = await context.request.post(base + '/question/bank/uniquiz/import.php', {form: {...fresh, count: '501'}});
        check(oversized.status() === 422 && (await oversized.json()).message.includes('500'), 'Server rejects oversized submitted count');
        await page.locator('#uq-confirm').check();
        const textResponse = page.waitForResponse(r => r.url().endsWith('/uniquiz/import.php'));
        await page.locator('#uq-import').click();
        check((await (await textResponse).json()).success, 'Valid text imports after failed requests without corrupting the receipt');

        await page.goto(report.url);
        const largeSource = 'question_text,answer_1,answer_2,correct\n' +
            Array.from({length: 501}, (_, i) => `Question ${i + 1}?,Yes,No,A`).join('\n');
        await reviewFile(page, {name: 'large.csv', mimeType: 'text/csv', buffer: Buffer.from(largeSource)});
        await page.locator('#generate-button').click();
        await page.locator('[data-step="5"]:visible').waitFor();
        await page.locator('#uq-confirm').check();
        check(await page.locator('#uq-import').isDisabled() && (await page.locator('#uq-import-status').innerText()).includes('500'),
            '501-question batch is blocked before direct submission');
        check(await page.locator('#download-button').isVisible() && !(await page.locator('#download-button').isDisabled()),
            'Large-bank XML download remains available');

        await page.goto(report.url);
        await page.waitForFunction(() => document.querySelector('#qbank-uniquiz')?.dataset.initialized === 'true');
        await page.locator('#file-input').setInputFiles({name: 'invalid.csv', mimeType: 'text/csv',
            buffer: Buffer.from('question_text,answer_1,answer_2,correct\nBad\u000Btext,Yes,No,A')});
        await page.locator('#consent').check();
        await page.locator('#analyse-button').click();
        await page.getByText(/U\+000B/).first().waitFor();
        check(true, 'Invalid XML character identified during initial analysis');

        await page.goto(report.url);
        await reviewFile(page, 'tests/fixtures/correct-outside-options.csv');
        check(await page.locator('#generate-button').isDisabled(), 'Invalid bank blocks export and direct-import preparation');
        await page.goto(report.url);
        await reviewFile(page, 'tests/fixtures/diagnostics-warning-moodle.csv');
        check(!(await page.locator('#generate-button').isDisabled()), 'Warning bank stays exportable');

        await page.goto(report.url + '&tool=aiken');
        await page.waitForFunction(() => document.querySelector('#qbank-uniquiz')?.dataset.initialized === 'true');
        await page.locator('#aiken-source').fill('Capital of Hungary?\na) Vienna\nb) Budapest\nanswer: b');
        await page.locator('#check-aiken').click();
        await page.locator('#aiken-results:visible').waitFor();
        await page.locator('#fix-safe').click();
        check((await page.locator('#aiken-corrected').inputValue()).includes('ANSWER: B'), 'AIKEN safe repair works inside Moodle');

        await page.setViewportSize({width: 390, height: 844});
        await page.goto(report.url);
        await page.screenshot({path: path.join(resultsDir, `${branch}-mobile.png`), fullPage: true});
        check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No mobile horizontal overflow');
        await reviewFile(page, 'examples/uniquiz-question-types.csv');
        await page.locator('#generate-button').click();
        await page.locator('[data-step="5"]:visible').waitFor();
        const mobileDownloadEvent = page.waitForEvent('download');
        await page.locator('#download-button').click();
        await (await mobileDownloadEvent).saveAs(path.join(resultsDir, `${branch}-mobile-download.xml`));
        const mobileXml = await fs.readFile(path.join(resultsDir, `${branch}-mobile-download.xml`), 'utf8');
        check((mobileXml.match(/<question type=/g) || []).length === 6, 'Mobile workflow exports all six questions');
        await page.locator('#uq-confirm').check();
        const mobileResponse = page.waitForResponse(r => r.url().endsWith('/uniquiz/import.php'));
        await page.locator('#uq-import').click();
        const mobileResult = await (await mobileResponse).json();
        check(mobileResult.success && mobileResult.count === 6, 'Mobile workflow completes confirmed import');
        await page.locator('#uq-return:visible').waitFor();
        await page.screenshot({path: path.join(resultsDir, `${branch}-mobile-imported.png`), fullPage: true});
        check(jsErrors.length === 0, `No browser JS errors: ${jsErrors.join('; ')}`);
        const studentContext = await browser.newContext();
        const studentPage = await studentContext.newPage();
        await login(studentPage, base, 'uniquizstudent');
        await studentPage.goto(report.url);
        check(await studentPage.locator('#qbank-uniquiz').count() === 0, 'Student cannot open wizard');
        await studentContext.close();
        const adminContext = await browser.newContext();
        const adminPage = await adminContext.newPage();
        await login(adminPage, base, 'admin');
        await adminPage.goto(report.url.replace('/index.php?', '/help.php?'));
        check((await adminPage.locator('body').innerText()).includes('Direct import accepts up to 500 questions'),
            'Admin navigation scenario opens the current guide with correct limits');
        await adminContext.close();
        await fs.writeFile(path.join(resultsDir, `${branch}-browser.json`), JSON.stringify({release: report.release, checks, passed: checks.length}, null, 2));
        console.log(`${branch}: ${checks.length} browser checks passed`);
    } catch (error) {
        await page.screenshot({path: path.join(resultsDir, `${branch}-failure.png`), fullPage: true});
        console.error(`${branch} page errors: ${jsErrors.join('; ')}`);
        throw error;
    } finally { await context.close(); }
}

(async () => {
    await fs.mkdir(resultsDir, {recursive: true});
    const browser = await chromium.launch({executablePath: edgeExecutable, headless: true});
    try {
        for (const branch of (process.argv.slice(2).length ? process.argv.slice(2) : ['45', '52'])) await run(browser, branch);
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
