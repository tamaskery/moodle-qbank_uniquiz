/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
// GNU GPL v3 or later. Loaded before the question engine; never translates submitted data.
let strings = Object.create(null);
let language = "en";

/**
 * Install the page-language catalogue fetched through core/str.
 * @param {*} keys
 * @param {*} values
 * @param {*} lang
 */
export const configure = (keys, values, lang) => {
    if (keys.length !== values.length) {
        throw new Error("Incomplete language catalogue");
    }
    strings = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    const candidate = String(lang || "en").replaceAll("_", "-");
    try {
        language = Intl.getCanonicalLocales(candidate)[0];
    } catch {
        // Moodle variants such as de_kids are not necessarily BCP 47 locale names.
        try {
            language = Intl.getCanonicalLocales(candidate.split("-")[0])[0];
        } catch {
            language = "en";
        }
    }
};

/** Return the page locale for display-only number formatting. */
export const locale = () => language;

/**
 * Interpolate once: dollar signs and placeholder-shaped user text remain literal.
 * @param {*} key
 * @param {*} params
 */
export const string = (key, params = {}) => {
    if (!Object.hasOwn(strings, key)) {
        throw new Error(`Missing language string: ${key}`);
    }
    return strings[key].replace(/\{\$a->(\w+)\}/g, (match, name) =>
        Object.hasOwn(params, name) ? String(params[name]) : match,
    );
};
