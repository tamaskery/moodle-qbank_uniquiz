const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium, edgeExecutable} = require('./playwright-runtime.cjs');
const dir = process.env.UNIQUIZ_QA_RESULTS;
const root = path.resolve(__dirname, '../source');
(async() => {
    const report = JSON.parse(await fs.readFile(path.join(dir, 'ci-integration.json'), 'utf8'));
    const strings = JSON.parse(await fs.readFile(path.join(dir, 'ci-language-strings.json'), 'utf8'));
    const browser = await chromium.launch({executablePath: edgeExecutable, headless: true});
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    const page = await context.newPage();
    const errors = [];
    const checks = [];
    const check = (ok, message) => {assert.ok(ok, message); checks.push(message);};
    const ready = () => page.waitForFunction(() => document.querySelector('#qbank-uniquiz')?.dataset.initialized === 'true');
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(new URL('/login/index.php', report.url).href);
        await page.waitForLoadState('networkidle');
        await page.locator('#username').fill('uniquizteacher');
        await page.locator('#password').fill('UniQuizTeacherTest!');
        await Promise.all([page.waitForURL(url => !url.pathname.endsWith('/login/index.php')), page.locator('#loginbtn').click()]);
        for (const language of ['es', 'de', 'fr', 'hu']) {
            const s = strings[language];
            await page.goto(report.url + '&lang=' + language); await ready();
            check(await page.locator('#qbank-uniquiz').evaluate(el => JSON.parse(el.dataset.config).language) === language,
                language + ': Moodle selected the installed language');
            check(await page.getByRole('button', {name: s.ui_analyse_questions, exact: true}).count() === 1,
                language + ': wizard template translated');
            await page.locator('#file-input').setInputFiles(path.join(root, 'examples/uniquiz-question-types.csv'));
            await page.locator('#consent').check(); await page.locator('#analyse-button').click();
            await page.locator('[data-step="2"]:visible').waitFor();
            await page.locator('#to-settings').click(); await page.locator('#to-review').click();
            await page.locator('[data-step="4"]:visible').waitFor();
            check((await page.locator('#qbank-uniquiz').innerText()).includes(s.js_app_ready), language + ': dynamic review translated');
            await page.locator('#generate-button').click(); await page.locator('[data-step="5"]:visible').waitFor();
            const download = page.waitForEvent('download'); await page.locator('#download-button').click();
            const target = path.join(dir, 'ci-' + language + '.xml');
            await (await download).saveAs(target);
            check(await fs.readFile(target, 'utf8') === await fs.readFile(path.join(dir, 'ci-download.xml'), 'utf8'),
                language + ': XML is identical to the English export');
            check(await page.locator('#uq-import').isDisabled(), language + ': confirmation remains required');
            await page.locator('#uq-confirm').check();
            const response = page.waitForResponse(r => r.url().endsWith('/uniquiz/import.php'));
            await page.locator('#uq-import').click();
            const result = await (await response).json();
            check(result.success && result.message === s.importsuccess.replace('{$a}', '6'), language + ': native translated import response');
            await page.waitForLoadState('networkidle');
            await page.screenshot({path: path.join(dir, 'ci-' + language + '-import.png'), fullPage: true});
            await page.goto(report.url + '&lang=' + language); await ready();
            await page.locator('#file-input').setInputFiles({name: 'blocked.csv', mimeType: 'text/csv',
                buffer: Buffer.from('type,question_text,answer_1,answer_1_fraction\nshortanswer,Original content,Yes,50')});
            await page.locator('#consent').check(); await page.locator('#analyse-button').click();
            await page.locator('[data-step="2"]:visible').waitFor();
            check((await page.locator('#qbank-uniquiz').innerText()).includes(s.js_core_short_answer_requires_full_credit),
                language + ': full-credit recovery diagnostic translated');
            await page.goto(report.url + '&tool=aiken&lang=' + language); await ready();
            await page.locator('#aiken-source').fill('Question?\na) Yes\nb) No\nanswer: a');
            await page.locator('#check-aiken').click(); await page.locator('#aiken-results:visible').waitFor();
            check((await page.locator('#aiken-results').innerText()).includes(s.js_aiken_app_safe_fix), language + ': AIKEN diagnostics translated');
            await page.locator('#fix-safe').click();
            check((await page.locator('#aiken-corrected').inputValue()).includes('ANSWER: A'), language + ': AIKEN syntax unchanged');
            await page.goto(report.url.replace('/index.php?', '/help.php?') + '&lang=' + language);
            check((await page.locator('body').innerText()).includes(s.ui_basic_csv), language + ': guide translated');
            await page.setViewportSize({width: 390, height: 844});
            await page.goto(report.url + '&lang=' + language); await ready();
            check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), language + ': no mobile overflow');
            await page.waitForLoadState('networkidle');
            await page.screenshot({path: path.join(dir, 'ci-' + language + '-mobile.png'), fullPage: true});
            await page.setViewportSize({width: 1280, height: 900});
        }
        check(errors.length === 0, 'No browser exceptions in the four native languages');
        await fs.writeFile(path.join(dir, 'ci-languages.json'), JSON.stringify({passed: checks.length, checks, browserVersion: browser.version()}, null, 2));
        console.log(checks.length + ' native four-language browser checks passed');
    } catch (error) {
        await page.screenshot({path: path.join(dir, 'ci-languages-failure.png'), fullPage: true});
        throw error;
    } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
