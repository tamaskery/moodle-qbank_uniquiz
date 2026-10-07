// Included in the Moodle app initializer by build.mjs. GNU GPL v3 or later.
let importXml = '';
let importCount = 0;
let importDone = false;
let importBusy = false;
let importBlocked = false;
const importButton = container.querySelector('#uq-import');
const importConfirm = container.querySelector('#uq-confirm');
const importDestination = container.querySelector('#uq-destination');
const importStatus = container.querySelector('#uq-import-status');

function resetImport() {
    importXml = '';
    importCount = 0;
    importDone = false;
    importBlocked = false;
    importButton.disabled = true;
    importConfirm.checked = false;
    importConfirm.disabled = false;
    importDestination.disabled = false;
    importStatus.textContent = '';
    container.querySelector('#uq-return').hidden = true;
}

function prepareImport(xml, count) {
    importXml = xml;
    importCount = count;
    const countLabel = count === 1 ? config.strings.importcountsingle : config.strings.importcount;
    importButton.textContent = countLabel.replace('{$a}', String(count));
    importBlocked = count > config.maxquestions || new Blob([xml]).size > config.maxxmlbytes;
    importStatus.textContent = count > config.maxquestions
        ? config.strings.batchlimit.replace('{$a}', String(config.maxquestions))
        : importBlocked ? config.strings.xmltoolarge : '';
    importButton.disabled = importBlocked || !importConfirm.checked;
}

importConfirm.addEventListener('change', () => {
    importButton.disabled = !importConfirm.checked || !importXml || importBusy || importDone || importBlocked;
});

importButton.addEventListener('click', async () => {
    if (importBusy || importDone || importBlocked || !importConfirm.checked || !importXml) return;
    if (new Blob([importXml]).size > config.maxxmlbytes) {
        importStatus.textContent = config.strings.xmltoolarge;
        return;
    }
    importBusy = true;
    importButton.disabled = true;
    importDestination.disabled = true;
    importConfirm.disabled = true;
    container.querySelector('#new-conversion').disabled = true;
    importStatus.textContent = config.strings.importing;
    try {
        const body = new URLSearchParams({
            sesskey: config.sesskey, token: config.token, categoryid: importDestination.value,
            count: String(importCount), xml: importXml, ...config.contextparams,
        });
        const response = await fetch(config.importurl, {
            method: 'POST', credentials: 'same-origin', body,
            headers: {'Accept': 'application/json'},
        });
        let result;
        try { result = await response.json(); } catch {
            throw new Error(config.strings.noresult);
        }
        if (!response.ok || !result?.success) {
            // Moodle's AJAX handler uses `error` for failures before the importer runs.
            const message = [result?.message, result?.error].find(value => typeof value === 'string' && value.trim());
            throw new Error(message || config.strings.noresult);
        }
        importDone = true;
        importStatus.textContent = result.message;
        const returnLink = container.querySelector('#uq-return');
        returnLink.href = result.bankurl;
        returnLink.hidden = false;
        importStatus.focus();
    } catch (error) {
        importStatus.textContent = error instanceof Error ? error.message : config.strings.noresult;
    } finally {
        importBusy = false;
        importButton.disabled = importDone || !importConfirm.checked;
        importDestination.disabled = importDone;
        importConfirm.disabled = importDone;
        container.querySelector('#new-conversion').disabled = false;
    }
});
