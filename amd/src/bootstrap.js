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
// GNU GPL v3 or later. No question content is sent in string requests.
import {getStrings} from "core/str";
import {exception} from "core/notification";
import {configure} from "qbank_uniquiz/i18n";

/** Load translations before evaluating any engine module or binding UI controls. */
export const init = async() => {
    try {
        const config = JSON.parse(document.getElementById("qbank-uniquiz").dataset.config);
        const values = await getStrings(
            config.stringkeys.map((key) => ({
                key,
                component: "qbank_uniquiz",
            })),
        );
        configure(config.stringkeys, values, config.language);
        const moduleName = config.tool === "aiken" ? "qbank_uniquiz/aiken-app" : "qbank_uniquiz/app";
        const module = await new Promise((resolve, reject) => require([moduleName], resolve, reject));
        module.init(config);
    } catch (error) {
        exception(error);
    }
};
