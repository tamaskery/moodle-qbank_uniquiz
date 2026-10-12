/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
import {string as uiString, locale as uiLocale} from "qbank_uniquiz/i18n";
export const PREVIEW_PAGE_SIZES = Object.freeze([20, 50, 100]);
export const PREVIEW_STATUS_FILTERS = Object.freeze(["all", "warning", "error"]);
/**
 *
 * @param {*} index
 */
function alphabeticAnswerLabel(index) {
    let value = Math.max(0, Math.trunc(Number(index))) + 1;
    let label = "";
    while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
    }
    return label;
}
/**
 *
 * @param {*} index
 * @param {*} answerNumbering
 */
export function formatPreviewAnswerLabel(index, answerNumbering = "abc") {
    if (answerNumbering === "none") {
        return "";
    }
    if (answerNumbering === "123") {
        return String(Math.max(0, Math.trunc(Number(index))) + 1);
    }
    return alphabeticAnswerLabel(index);
}
/**
 *
 * @param {*} value
 */
export function normalizeSearchQuery(value) {
    return String(value ?? "")
        .trim()
        .normalize("NFC")
        .toLowerCase();
}
/**
 *
 * @param {*} value
 */
export function normalizeStatusFilter(value) {
    return PREVIEW_STATUS_FILTERS.includes(value) ? value : "all";
}
/**
 *
 * @param {*} question
 */
export function getQuestionSearchCorpus(question) {
    const answers = Array.isArray(question.answers) ? question.answers : [];
    const fields = [
        question.sourceIndex,
        uiString("js_preview_question", {
            p0: question.sourceIndex ?? "",
        }),
        question.type,
        question.questionName,
        question.name,
        question.text,
        question.category,
        ...(Array.isArray(question.tags) ? question.tags : []),
        question.generalFeedback,
        question.correctFeedback,
        question.partiallyCorrectFeedback,
        question.incorrectFeedback,
        ...answers.flatMap((answer) => [answer.originalText, answer.transformedText, answer.feedback]),
    ];
    return normalizeSearchQuery(fields.filter((value) => value !== null && value !== undefined).join("\n"));
}
/**
 *
 * @param {*} questions
 */
export function createPreviewSearchCorpusCache(questions) {
    const cache = new WeakMap();
    questions.forEach((question) => cache.set(question, getQuestionSearchCorpus(question)));
    return cache;
}
/**
 *
 * @param {*} questions
 * @param {*} searchQuery
 * @param {*} statusFilter
 * @param {*} corpusCache
 */
export function filterPreviewQuestions(
    questions,
    searchQuery = "",
    statusFilter = "all",
    corpusCache = null,
) {
    const query = normalizeSearchQuery(searchQuery);
    const filter = normalizeStatusFilter(statusFilter);
    return questions.filter((question) => {
        if (query && !(corpusCache?.get(question) ?? getQuestionSearchCorpus(question)).includes(query)) {
            return false;
        }
        return filter === "all" || question.status === filter;
    });
}
/**
 *
 * @param {*} questions
 */
export function getPreviewFilterCounts(questions) {
    return {
        all: questions.length,
        warning: questions.filter(({status}) => status === "warning").length,
        error: questions.filter(({status}) => status === "error").length,
    };
}
/**
 *
 * @param {*} total
 * @param {*} searchQuery
 * @param {*} statusFilter
 */
export function formatPreviewResultSummary(total, searchQuery = "", statusFilter = "all") {
    const query = String(searchQuery ?? "").trim();
    const filter = normalizeStatusFilter(statusFilter);
    const count = Number(total).toLocaleString(uiLocale());
    const question = total === 1 ? uiString("js_preview_question_2") : uiString("js_preview_questions");
    if (query && filter === "warning") {
        return uiString("js_preview_matching", {
            p0: count,
            p1: question,
            p2: query,
            p3: total === 1 ? uiString("js_preview_has_a_warning") : uiString("js_preview_have_warnings"),
        });
    }
    if (query && filter === "error") {
        return uiString("js_preview_matching", {
            p0: count,
            p1: question,
            p2: query,
            p3: total === 1 ? uiString("js_preview_has_an_error") : uiString("js_preview_have_errors"),
        });
    }
    if (query) {
        return uiString("js_preview_matching_2", {
            p0: count,
            p1: question,
            p2: query,
        });
    }
    if (filter === "warning") {
        return (
            `${count}` +
            " " +
            `${total === 1 ? uiString("js_preview_question_with_a_warning") : uiString("js_preview_questions_with_warnings")}`
        );
    }
    if (filter === "error") {
        return (
            `${count}` +
            " " +
            `${total === 1 ? uiString("js_preview_question_with_an_error") : uiString("js_preview_questions_with_errors")}`
        );
    }
    return "";
}
/**
 *
 * @param {*} page
 * @param {*} restricted
 */
export function formatPreviewResultRange(page, restricted = false) {
    if (!restricted || page.total === 0) {
        return page.rangeText;
    }
    if (page.total === 1) {
        return uiString("js_preview_showing_1_of_1_matching_question");
    }
    return uiString("js_preview_showing_of_matching_questions", {
        p0: page.start.toLocaleString(uiLocale()),
        p1: page.end.toLocaleString(uiLocale()),
        p2: page.total.toLocaleString(uiLocale()),
    });
}
/**
 *
 * @param {*} value
 */
export function normalizePreviewPageSize(value) {
    const parsed = Number(value);
    return PREVIEW_PAGE_SIZES.includes(parsed) ? parsed : PREVIEW_PAGE_SIZES[0];
}
/**
 *
 * @param {*} totalQuestions
 * @param {*} requestedPage
 * @param {*} requestedPageSize
 */
export function getPreviewPage(totalQuestions, requestedPage = 1, requestedPageSize = 20) {
    const total = Math.max(0, Math.trunc(Number(totalQuestions) || 0));
    const pageSize = normalizePreviewPageSize(requestedPageSize);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const page =
        totalPages === 0 ? 0 : Math.min(totalPages, Math.max(1, Math.trunc(Number(requestedPage) || 1)));
    const startIndex = page === 0 ? 0 : (page - 1) * pageSize;
    const endIndex = page === 0 ? 0 : Math.min(startIndex + pageSize, total);
    const start = page === 0 ? 0 : startIndex + 1;
    const end = endIndex;
    const rangeText = (() => {
        if (total === 0) {
            return uiString("js_preview_no_questions_to_preview");
        } else {
            if (total === 1) {
                return uiString("js_preview_showing_1_of_1_question");
            } else {
                return uiString("js_preview_showing_of_questions", {
                    p0: start.toLocaleString(uiLocale()),
                    p1: end.toLocaleString(uiLocale()),
                    p2: total.toLocaleString(uiLocale()),
                });
            }
        }
    })();
    return {
        total,
        pageSize,
        page,
        totalPages,
        startIndex,
        endIndex,
        start,
        end,
        rangeText,
        pageText:
            totalPages === 0
                ? ""
                : uiString("js_preview_page_of", {
                      p0: page.toLocaleString(uiLocale()),
                      p1: totalPages.toLocaleString(uiLocale()),
                  }),
    };
}
/**
 *
 * @param {*} questions
 * @param {*} requestedPage
 * @param {*} requestedPageSize
 */
export function paginateQuestions(questions, requestedPage = 1, requestedPageSize = 20) {
    const page = getPreviewPage(questions.length, requestedPage, requestedPageSize);
    return {
        ...page,
        questions: questions.slice(page.startIndex, page.endIndex),
    };
}
/**
 *
 * @param {*} currentPage
 * @param {*} totalPages
 */
export function getCompactPageItems(currentPage, totalPages) {
    const total = Math.max(0, Math.trunc(Number(totalPages) || 0));
    if (total === 0) {
        return [];
    }
    if (total <= 7) {
        return Array.from(
            {
                length: total,
            },
            (_, index) => index + 1,
        );
    }
    const current = Math.min(total, Math.max(1, Math.trunc(Number(currentPage) || 1)));
    const visible = new Set([1, 2, total - 1, total]);
    for (let page = current - 2; page <= current + 2; page += 1) {
        visible.add(page);
    }
    const pages = [...visible].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    const items = [];
    pages.forEach((page, index) => {
        if (index > 0 && page - pages[index - 1] > 1) {
            items.push("ellipsis");
        }
        items.push(page);
    });
    return items;
}
