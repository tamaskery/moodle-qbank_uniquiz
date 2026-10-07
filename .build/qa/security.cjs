// Adversarial requests against disposable localhost QA sites only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium, edgeExecutable} = require('./playwright-runtime.cjs');
const dir = process.env.UNIQUIZ_QA_RESULTS;
async function run(browser, branch) {
    const report = JSON.parse(await fs.readFile(path.join(dir, `${branch}-integration.json`), 'utf8'));
    const base = new URL(report.url).origin;
    const endpoint = base + '/question/bank/uniquiz/import.php';
    const contexts = [];
    const checks = [];
    const check = (ok, message) => {assert.ok(ok, message); checks.push(message);};
    async function session(username = 'uniquizteacher') {
        const context = await browser.newContext(); contexts.push(context);
        const page = await context.newPage();
        await page.goto(base + '/login/index.php');
        await page.locator('#username').fill(username);
        await page.locator('#password').fill('UniQuizTeacherTest!');
        await Promise.all([page.waitForURL(url => !url.pathname.endsWith('/login/index.php')), page.locator('#loginbtn').click()]);
        return {context, page};
    }
    const denied = async(response) => {
        const value = await response.json().catch(() => ({}));
        return value.success !== true;
    };
    try {
        const {context, page} = await session();
        await page.goto(report.url);
        const config = await page.locator('#qbank-uniquiz').evaluate(el => JSON.parse(el.dataset.config));
        const name = `SECURITY-RACE-${branch}-${Date.now()}`;
        const question = `<question type="description"><name><text>${name}</text></name>` +
            '<questiontext format="html"><text>Security fixture</text></questiontext><defaultgrade>0</defaultgrade></question>';
        const xml = `<quiz>${question}</quiz>`;
        const form = {sesskey: config.sesskey, token: config.token, categoryid: String(report.categoryid),
            count: '1', xml, ...Object.fromEntries(Object.entries(config.contextparams).map(([k, v]) => [k, String(v)]))};
        for (const [title, changes] of [
            ['Unissued token rejected', {token: '0'.repeat(48)}],
            ['Missing token rejected', {token: ''}],
            ['Token cannot move to another question-bank context', {[Object.keys(config.contextparams)[0]]: '1'}],
            ['Nonexistent destination rejected', {categoryid: '2147483647'}],
            ['Count mismatch rejected', {count: '2'}],
            ['Local-file external entity rejected', {xml: '<!DOCTYPE quiz [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml}],
            ['External parameter entity rejected', {xml: '<!DOCTYPE quiz [<!ENTITY % x SYSTEM "http://127.0.0.1:9/">%x;]>' + xml}],
            ['Unexpected XML attributes rejected', {xml: xml.replace('<question ', '<question evil="1" ')}],
            ['Nested text markup rejected', {xml: xml.replace('Security fixture', '<b>Nested</b>')}],
            ['Namespace envelope rejected', {xml: xml.replace('<quiz>', '<quiz xmlns="urn:bad">')}],
            ['Repeated tags bounded independently of question count', {xml: xml.replace('</question>', '<tags>' +
                '<tag><text>tag</text></tag>'.repeat(101) + '</tags></question>')}],
            ['Individual HTML fields bounded', {xml: xml.replace('Security fixture', 'x'.repeat(262145))}],
        ]) {
            check(await denied(await context.request.post(endpoint, {form: {...form, ...changes}})), title);
        }
        const stranger = await session();
        await stranger.page.goto(report.url);
        const ownKey = await stranger.page.locator('#qbank-uniquiz').evaluate(el => JSON.parse(el.dataset.config).sesskey);
        check(await denied(await stranger.context.request.post(endpoint, {form: {...form, sesskey: ownKey}})),
            'Token cannot cross sessions even for the same teacher');
        const student = await session('uniquizstudent');
        const studentKey = await student.page.evaluate(() => M.cfg.sesskey);
        check(await denied(await student.context.request.post(endpoint, {form: {...form, sesskey: studentKey}})),
            'Student POST cannot reuse a teacher request');
        const anonymous = await browser.newContext(); contexts.push(anonymous);
        check(await denied(await anonymous.request.post(endpoint, {form})), 'Unauthenticated POST cannot import');
        const responses = await Promise.all([context.request.post(endpoint, {form}), context.request.post(endpoint, {form})]);
        const results = await Promise.all(responses.map(r => r.json()));
        check(results.every(r => r.success && r.count === 1) && JSON.stringify(results[0]) === JSON.stringify(results[1]),
            'Concurrent identical submissions return one matching receipt');
        const record = {passed: checks.length, checks, raceQuestionName: name};
        await fs.writeFile(path.join(dir, `${branch}-security.json`), JSON.stringify(record, null, 2));
        console.log(`${branch}: ${checks.length} security HTTP checks passed; verify one DB row for ${name}`);
    } finally {await Promise.all(contexts.map(c => c.close()));}
}
(async() => {
    const browser = await chromium.launch({executablePath: edgeExecutable, headless: true});
    try {for (const branch of (process.argv.slice(2).length ? process.argv.slice(2) : ['45', '52'])) await run(browser, branch);} finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
