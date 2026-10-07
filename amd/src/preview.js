/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
import {string as uiString, locale as uiLocale} from 'qbank_uniquiz/i18n';
export const PREVIEW_PAGE_SIZES = Object.freeze([20, 50, 100]);
export const PREVIEW_STATUS_FILTERS = Object.freeze(["all", "warning", "error"]);
function alphabeticAnswerLabel(index) {
  let value = Math.max(0, Math.trunc(Number(index))) + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
export function formatPreviewAnswerLabel(index, answerNumbering = "abc") {
  if (answerNumbering === "none") return "";
  if (answerNumbering === "123") return String(Math.max(0, Math.trunc(Number(index))) + 1);
  return alphabeticAnswerLabel(index);
}
export function normalizeSearchQuery(value) {
  return String(value ?? "").trim().normalize("NFC").toLowerCase();
}
export function normalizeStatusFilter(value) {
  return PREVIEW_STATUS_FILTERS.includes(value) ? value : "all";
}
export function getQuestionSearchCorpus(question) {
  const answers = Array.isArray(question.answers) ? question.answers : [];
  const fields = [question.sourceIndex, uiString("js_preview_question_a708e36a", {
    p0: question.sourceIndex ?? ""
  }), question.type, question.questionName, question.name, question.text, question.category, ...(Array.isArray(question.tags) ? question.tags : []), question.generalFeedback, question.correctFeedback, question.partiallyCorrectFeedback, question.incorrectFeedback, ...answers.flatMap(answer => [answer.originalText, answer.transformedText, answer.feedback])];
  return normalizeSearchQuery(fields.filter(value => value !== null && value !== undefined).join("\n"));
}
export function createPreviewSearchCorpusCache(questions) {
  const cache = new WeakMap();
  questions.forEach(question => cache.set(question, getQuestionSearchCorpus(question)));
  return cache;
}
export function filterPreviewQuestions(questions, searchQuery = "", statusFilter = "all", corpusCache = null) {
  const query = normalizeSearchQuery(searchQuery);
  const filter = normalizeStatusFilter(statusFilter);
  return questions.filter(question => {
    if (query && !(corpusCache?.get(question) ?? getQuestionSearchCorpus(question)).includes(query)) return false;
    return filter === "all" || question.status === filter;
  });
}
export function getPreviewFilterCounts(questions) {
  return {
    all: questions.length,
    warning: questions.filter(({
      status
    }) => status === "warning").length,
    error: questions.filter(({
      status
    }) => status === "error").length
  };
}
export function formatPreviewResultSummary(total, searchQuery = "", statusFilter = "all") {
  const query = String(searchQuery ?? "").trim();
  const filter = normalizeStatusFilter(statusFilter);
  const count = Number(total).toLocaleString(uiLocale());
  const question = total === 1 ? uiString("js_preview_question_1f5087db") : uiString("js_preview_questions_17d5efa6");
  if (query && filter === "warning") {
    return uiString("js_preview_matching_6173f080", {
      p0: count,
      p1: question,
      p2: query,
      p3: total === 1 ? uiString("js_preview_has_a_warning_3fcd21be") : uiString("js_preview_have_warnings_4dce76d3")
    });
  }
  if (query && filter === "error") {
    return uiString("js_preview_matching_6173f080", {
      p0: count,
      p1: question,
      p2: query,
      p3: total === 1 ? uiString("js_preview_has_an_error_16ebe1c0") : uiString("js_preview_have_errors_319e389f")
    });
  }
  if (query) return uiString("js_preview_matching_abdac942", {
    p0: count,
    p1: question,
    p2: query
  });
  if (filter === "warning") return `${count} ${total === 1 ? uiString("js_preview_question_with_a_warning_1e2fb12f") : uiString("js_preview_questions_with_warnings_4db4530a")}`;
  if (filter === "error") return `${count} ${total === 1 ? uiString("js_preview_question_with_an_error_b548bb5a") : uiString("js_preview_questions_with_errors_4efca907")}`;
  return "";
}
export function formatPreviewResultRange(page, restricted = false) {
  if (!restricted || page.total === 0) return page.rangeText;
  if (page.total === 1) return uiString("js_preview_showing_1_of_1_matching_question_293486e9");
  return uiString("js_preview_showing_of_matching_questions_73ed3512", {
    p0: page.start.toLocaleString(uiLocale()),
    p1: page.end.toLocaleString(uiLocale()),
    p2: page.total.toLocaleString(uiLocale())
  });
}
export function normalizePreviewPageSize(value) {
  const parsed = Number(value);
  return PREVIEW_PAGE_SIZES.includes(parsed) ? parsed : PREVIEW_PAGE_SIZES[0];
}
export function getPreviewPage(totalQuestions, requestedPage = 1, requestedPageSize = 20) {
  const total = Math.max(0, Math.trunc(Number(totalQuestions) || 0));
  const pageSize = normalizePreviewPageSize(requestedPageSize);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 0 : Math.min(totalPages, Math.max(1, Math.trunc(Number(requestedPage) || 1)));
  const startIndex = page === 0 ? 0 : (page - 1) * pageSize;
  const endIndex = page === 0 ? 0 : Math.min(startIndex + pageSize, total);
  const start = page === 0 ? 0 : startIndex + 1;
  const end = endIndex;
  const rangeText = total === 0 ? uiString("js_preview_no_questions_to_preview_320b29ed") : total === 1 ? uiString("js_preview_showing_1_of_1_question_c00c4f62") : uiString("js_preview_showing_of_questions_184ac13b", {
    p0: start.toLocaleString(uiLocale()),
    p1: end.toLocaleString(uiLocale()),
    p2: total.toLocaleString(uiLocale())
  });
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
    pageText: totalPages === 0 ? "" : uiString("js_preview_page_of_f7e8f50f", {
      p0: page.toLocaleString(uiLocale()),
      p1: totalPages.toLocaleString(uiLocale())
    })
  };
}
export function paginateQuestions(questions, requestedPage = 1, requestedPageSize = 20) {
  const page = getPreviewPage(questions.length, requestedPage, requestedPageSize);
  return {
    ...page,
    questions: questions.slice(page.startIndex, page.endIndex)
  };
}
export function getCompactPageItems(currentPage, totalPages) {
  const total = Math.max(0, Math.trunc(Number(totalPages) || 0));
  if (total === 0) return [];
  if (total <= 7) return Array.from({
    length: total
  }, (_, index) => index + 1);
  const current = Math.min(total, Math.max(1, Math.trunc(Number(currentPage) || 1)));
  const visible = new Set([1, 2, total - 1, total]);
  for (let page = current - 2; page <= current + 2; page += 1) visible.add(page);
  const pages = [...visible].filter(page => page >= 1 && page <= total).sort((a, b) => a - b);
  const items = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}
