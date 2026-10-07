export const PREVIEW_PAGE_SIZES = Object.freeze([20, 50, 100]);
export const PREVIEW_STATUS_FILTERS = Object.freeze(["all", "warning", "error"]);

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
  const fields = [
    question.sourceIndex,
    `Question ${question.sourceIndex ?? ""}`,
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

export function createPreviewSearchCorpusCache(questions) {
  const cache = new WeakMap();
  questions.forEach((question) => cache.set(question, getQuestionSearchCorpus(question)));
  return cache;
}

export function filterPreviewQuestions(questions, searchQuery = "", statusFilter = "all", corpusCache = null) {
  const query = normalizeSearchQuery(searchQuery);
  const filter = normalizeStatusFilter(statusFilter);
  return questions.filter((question) => {
    if (query && !(corpusCache?.get(question) ?? getQuestionSearchCorpus(question)).includes(query)) return false;
    return filter === "all" || question.status === filter;
  });
}

export function getPreviewFilterCounts(questions) {
  return {
    all: questions.length,
    warning: questions.filter(({ status }) => status === "warning").length,
    error: questions.filter(({ status }) => status === "error").length,
  };
}

export function formatPreviewResultSummary(total, searchQuery = "", statusFilter = "all") {
  const query = String(searchQuery ?? "").trim();
  const filter = normalizeStatusFilter(statusFilter);
  const count = Number(total).toLocaleString("en-US");
  const question = total === 1 ? "question" : "questions";
  if (query && filter === "warning") {
    return `${count} ${question} matching “${query}” ${total === 1 ? "has a warning" : "have warnings"}`;
  }
  if (query && filter === "error") {
    return `${count} ${question} matching “${query}” ${total === 1 ? "has an error" : "have errors"}`;
  }
  if (query) return `${count} ${question} matching “${query}”`;
  if (filter === "warning") return `${count} ${total === 1 ? "question with a warning" : "questions with warnings"}`;
  if (filter === "error") return `${count} ${total === 1 ? "question with an error" : "questions with errors"}`;
  return "";
}

export function formatPreviewResultRange(page, restricted = false) {
  if (!restricted || page.total === 0) return page.rangeText;
  if (page.total === 1) return "Showing 1 of 1 matching question";
  return `Showing ${page.start.toLocaleString("en-US")}–${page.end.toLocaleString("en-US")} of ${page.total.toLocaleString("en-US")} matching questions`;
}

export function normalizePreviewPageSize(value) {
  const parsed = Number(value);
  return PREVIEW_PAGE_SIZES.includes(parsed) ? parsed : PREVIEW_PAGE_SIZES[0];
}

export function getPreviewPage(totalQuestions, requestedPage = 1, requestedPageSize = 20) {
  const total = Math.max(0, Math.trunc(Number(totalQuestions) || 0));
  const pageSize = normalizePreviewPageSize(requestedPageSize);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0
    ? 0
    : Math.min(totalPages, Math.max(1, Math.trunc(Number(requestedPage) || 1)));
  const startIndex = page === 0 ? 0 : (page - 1) * pageSize;
  const endIndex = page === 0 ? 0 : Math.min(startIndex + pageSize, total);
  const start = page === 0 ? 0 : startIndex + 1;
  const end = endIndex;
  const rangeText = total === 0
    ? "No questions to preview"
    : total === 1
      ? "Showing 1 of 1 question"
      : `Showing ${start.toLocaleString("en-US")}–${end.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} questions`;

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
    pageText: totalPages === 0 ? "" : `Page ${page.toLocaleString("en-US")} of ${totalPages.toLocaleString("en-US")}`,
  };
}

export function paginateQuestions(questions, requestedPage = 1, requestedPageSize = 20) {
  const page = getPreviewPage(questions.length, requestedPage, requestedPageSize);
  return { ...page, questions: questions.slice(page.startIndex, page.endIndex) };
}

export function getCompactPageItems(currentPage, totalPages) {
  const total = Math.max(0, Math.trunc(Number(totalPages) || 0));
  if (total === 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const current = Math.min(total, Math.max(1, Math.trunc(Number(currentPage) || 1)));
  const visible = new Set([1, 2, total - 1, total]);
  for (let page = current - 2; page <= current + 2; page += 1) visible.add(page);
  const pages = [...visible].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const items = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}
