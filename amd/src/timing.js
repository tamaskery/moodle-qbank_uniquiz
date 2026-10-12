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
import {string as uiString} from "qbank_uniquiz/i18n";
export const MINIMUM_PROCESSING_MS = 3000;
/**
 *
 * @param {*} startedAt
 * @param {*} finishedAt
 * @param {*} minimum
 */
export function remainingMinimumDuration(startedAt, finishedAt, minimum = MINIMUM_PROCESSING_MS) {
    if (![startedAt, finishedAt, minimum].every(Number.isFinite) || minimum < 0) {
        throw new TypeError(uiString("js_timing_processing_timing_values_must_be_finite_positive"));
    }
    return Math.max(0, minimum - Math.max(0, finishedAt - startedAt));
}
