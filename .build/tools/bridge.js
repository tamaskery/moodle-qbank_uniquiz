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
const categorySearch = container.querySelector('#uq-category-search');
const categoryFind = container.querySelector('#uq-category-find');
const categoryPrevious = container.querySelector('#uq-category-previous');
const categoryNext = container.querySelector('#uq-category-next');
const categoryStatus = container.querySelector('#uq-category-status');
let categoryPage = 0;
let categoryQuery = '';
let categoryMore = config.categorymore;
let categoryBusy = false;
function categoryControls() {
    const locked = importBusy || importDone || categoryBusy;
    categorySearch.disabled = locked;
    categoryFind.disabled = locked;
    categoryPrevious.disabled = locked || categoryPage === 0;
    categoryNext.disabled = locked || !categoryMore;
    importDestination.disabled = locked;
    importButton.disabled = locked || importBlocked || !importXml || !importConfirm.checked;
}
async function findCategories(page, search) {
    if (importBusy || importDone || categoryBusy) return;
    categoryBusy = true;
    categoryControls();
    try {
        const body = new URLSearchParams({...config.contextparams, sesskey: config.sesskey,
            page: String(page), search});
        const response = await fetch(config.categoryurl, {method: 'POST', credentials: 'same-origin', body});
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.categories)) throw new Error(config.strings.noresult);
        const selected = importDestination.selectedOptions[0];
        const current = selected ? {id: selected.value, name: selected.textContent} : null;
        const resultCount = result.categories.length;
        const options = result.categories;
        if (current && !options.some(item => String(item.id) === current.id)) options.unshift(current);
        importDestination.replaceChildren(...options.map(item => {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = item.name;
            option.selected = String(item.id) === current?.id;
            return option;
        }));
        categoryPage = result.page;
        categoryQuery = search;
        categoryMore = result.more;
        categoryStatus.textContent = (resultCount > 0
            ? config.strings.categoryresults : config.strings.categoryempty).replace('{$a}', String(categoryPage + 1));
    } catch (error) {
        categoryStatus.textContent = error instanceof Error ? error.message : config.strings.noresult;
    } finally {
        categoryBusy = false;
        categoryControls();
    }
}
categoryFind.addEventListener('click', () => findCategories(0, categorySearch.value));
categorySearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); findCategories(0, categorySearch.value); }
});
categoryPrevious.addEventListener('click', () => findCategories(Math.max(0, categoryPage - 1), categoryQuery));
categoryNext.addEventListener('click', () => findCategories(categoryPage + 1, categoryQuery));
importDestination.addEventListener('change', () => { importConfirm.checked = false; categoryControls(); });
categoryControls();

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
    categoryControls();
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
    if (importBusy || categoryBusy || importDone || importBlocked || !importConfirm.checked || !importXml) return;
    if (new Blob([importXml]).size > config.maxxmlbytes) {
        importStatus.textContent = config.strings.xmltoolarge;
        return;
    }
    importBusy = true;
    importButton.disabled = true;
    importDestination.disabled = true;
    importConfirm.disabled = true;
    container.querySelector('#new-conversion').disabled = true;
    categoryControls();
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
        categoryControls();
    }
});
