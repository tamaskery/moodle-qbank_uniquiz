/**
 * This file is part of Moodle - http://moodle.org/
 *
 * Moodle is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Moodle is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Moodle. If not, see <https://www.gnu.org/licenses/>.
 *
 * UniQuiz generated interface code.
 * @module qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
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
