/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
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
