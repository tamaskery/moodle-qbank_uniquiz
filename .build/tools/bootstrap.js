// GNU GPL v3 or later. No question content is sent in string requests.
import {getStrings} from 'core/str';
import {exception} from 'core/notification';
import {configure} from 'qbank_uniquiz/i18n';

/** Load translations before evaluating any engine module or binding UI controls. */
export const init = async() => {
    try {
        const config = JSON.parse(document.getElementById('qbank-uniquiz').dataset.config);
        const values = await getStrings(config.stringkeys.map(key => ({key, component: 'qbank_uniquiz'})));
        configure(config.stringkeys, values, config.language);
        const moduleName = config.tool === 'aiken' ? 'qbank_uniquiz/aiken-app' : 'qbank_uniquiz/app';
        const module = await new Promise((resolve, reject) => require([moduleName], resolve, reject));
        module.init(config);
    } catch (error) {
        exception(error);
    }
};
