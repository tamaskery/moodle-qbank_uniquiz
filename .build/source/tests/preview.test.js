import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreviewSearchCorpusCache,
  formatPreviewAnswerLabel,
  filterPreviewQuestions,
  formatPreviewResultRange,
  formatPreviewResultSummary,
  getCompactPageItems,
  getPreviewFilterCounts,
  getPreviewPage,
  getQuestionSearchCorpus,
  normalizeSearchQuery,
  normalizeStatusFilter,
  normalizePreviewPageSize,
  paginateQuestions,
} from "../js/preview.js";

test("preview answer labels follow exported answer order and numbering mode", () => {
  const sparse = ["Alpha", "Gamma", "Epsilon"];
  for (const [numbering, expected] of [
    ["abc", ["A", "B", "C"]],
    ["ABCD", ["A", "B", "C"]],
    ["123", ["1", "2", "3"]],
    ["none", ["", "", ""]],
  ]) {
    assert.deepEqual(sparse.map((_, index) => formatPreviewAnswerLabel(index, numbering)), expected, numbering);
  }
  assert.deepEqual(["Alpha", "Beta", "Gamma"].map((_, index) => formatPreviewAnswerLabel(index, "abc")), ["A", "B", "C"]);
  const multipleGaps = ["Alpha", "", "Gamma", "", "Epsilon"];
  assert.deepEqual(
    multipleGaps.filter(Boolean).map((_, index) => formatPreviewAnswerLabel(index, "abc")),
    ["A", "B", "C"],
  );
});

const searchableQuestions = [
  {
    sourceIndex: 17, status: "ready", questionName: "Privacy foundations", name: "Generated name",
    text: "What does the GDPR protect?", category: "Law and policy", tags: ["Compliance", "EU"],
    generalFeedback: "Personal data deserves careful handling.", correctFeedback: "Correct GDPR response.",
    partiallyCorrectFeedback: "Review the GDPR principles.", incorrectFeedback: "Read the privacy guide.",
    answers: [
      { originalText: "Personal data", transformedText: "Personal data", feedback: "That is correct." },
      { originalText: "Weather data", transformedText: "Weather data", feedback: "This is a distractor." },
    ],
  },
  {
    sourceIndex: 21, status: "warning", questionName: "Magyar földrajz", name: "Budapest",
    text: "Melyik Magyarország fővárosa?", category: "Földrajz", tags: ["magyar"],
    generalFeedback: "Budapest Magyarország fővárosa.", answers: [
      { originalText: "Bécs", transformedText: "Bécs", feedback: "Nem helyes." },
      { originalText: "Budapest", transformedText: "Budapest", feedback: "Helyes." },
    ],
  },
  {
    sourceIndex: 41, status: "error", questionName: "Кириллица", name: "Москва",
    text: "Какая столица Венгрии?", category: "География", tags: ["русский"],
    generalFeedback: "Ответ отсутствует.", answers: [
      { originalText: "Будапешт", transformedText: "Будапешт", feedback: "Проверьте ответ." },
      { originalText: "Москва", transformedText: "Москва", feedback: "Неверно." },
    ],
  },
];

test("default 20-question pages report exact boundary ranges", () => {
  const cases = [
    [1, 1, 1, 1, "Showing 1 of 1 question"],
    [19, 1, 1, 19, "Showing 1–19 of 19 questions"],
    [20, 1, 1, 20, "Showing 1–20 of 20 questions"],
    [21, 2, 21, 21, "Showing 21–21 of 21 questions"],
    [40, 2, 21, 40, "Showing 21–40 of 40 questions"],
    [41, 3, 41, 41, "Showing 41–41 of 41 questions"],
    [47, 3, 41, 47, "Showing 41–47 of 47 questions"],
    [100, 5, 81, 100, "Showing 81–100 of 100 questions"],
    [101, 6, 101, 101, "Showing 101–101 of 101 questions"],
    [200, 10, 181, 200, "Showing 181–200 of 200 questions"],
    [1000, 50, 981, 1000, "Showing 981–1,000 of 1,000 questions"],
  ];
  for (const [total, totalPages, start, end, rangeText] of cases) {
    const result = getPreviewPage(total, totalPages, 20);
    assert.equal(result.totalPages, totalPages, String(total));
    assert.equal(result.start, start, String(total));
    assert.equal(result.end, end, String(total));
    assert.equal(result.rangeText, rangeText, String(total));
    assert.equal(result.pageText, `Page ${totalPages} of ${totalPages}`, String(total));
  }
});

test("page sizes 20, 50, and 100 cover banks without skips, duplicates, or reordering", () => {
  for (const total of [47, 101, 200, 1000]) {
    const questions = Array.from({ length: total }, (_, index) => ({ sourceIndex: index + 1 }));
    for (const pageSize of [20, 50, 100]) {
      const first = getPreviewPage(total, 1, pageSize);
      const seen = [];
      for (let page = 1; page <= first.totalPages; page += 1) {
        seen.push(...paginateQuestions(questions, page, pageSize).questions.map(({ sourceIndex }) => sourceIndex));
      }
      assert.deepEqual(seen, questions.map(({ sourceIndex }) => sourceIndex), `${total} @ ${pageSize}`);
    }
  }
});

test("invalid page sizes fall back to 20 and out-of-range pages are clamped", () => {
  assert.equal(normalizePreviewPageSize(50), 50);
  assert.equal(normalizePreviewPageSize("100"), 100);
  assert.equal(normalizePreviewPageSize(25), 20);
  assert.equal(getPreviewPage(47, -5, 20).page, 1);
  assert.equal(getPreviewPage(47, 99, 20).page, 3);
  assert.deepEqual(getPreviewPage(0), {
    total: 0, pageSize: 20, page: 0, totalPages: 0, startIndex: 0, endIndex: 0,
    start: 0, end: 0, rangeText: "No questions to preview", pageText: "",
  });
});

test("compact pagination is deterministic and bounded for large banks", () => {
  assert.deepEqual(getCompactPageItems(1, 1), [1]);
  assert.deepEqual(getCompactPageItems(1, 6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(getCompactPageItems(1, 50), [1, 2, 3, "ellipsis", 49, 50]);
  assert.deepEqual(getCompactPageItems(25, 50), [1, 2, "ellipsis", 23, 24, 25, 26, 27, "ellipsis", 49, 50]);
  assert.deepEqual(getCompactPageItems(50, 50), [1, 2, "ellipsis", 48, 49, 50]);
  for (let page = 1; page <= 50; page += 1) {
    const items = getCompactPageItems(page, 50);
    assert.ok(items.length <= 11, `page ${page}`);
    assert.ok(items.includes(page), `page ${page}`);
    assert.equal(items[0], 1);
    assert.equal(items.at(-1), 50);
  }
});

test("full-bank search covers identity, content, metadata, answers, and feedback", () => {
  const cases = [
    ["17", [17]], ["21", [21]], ["41", [41]], ["Question 21", [21]],
    ["privacy FOUNDATIONS", [17]], ["gdpr", [17]],
    ["personal data", [17]], ["law and policy", [17]], ["compliance", [17]],
    ["careful handling", [17]], ["distractor", [17]], ["correct gdpr", [17]],
    ["review the gdpr", [17]], ["privacy guide", [17]], ["  BUDAPEST  ", [21]],
    ["Magyarország", [21]], ["КИРИЛЛИЦА", [41]], ["будапешт", [41]],
  ];
  for (const [query, expected] of cases) {
    assert.deepEqual(filterPreviewQuestions(searchableQuestions, query).map(({ sourceIndex }) => sourceIndex), expected, query);
  }
  assert.equal(getQuestionSearchCorpus(searchableQuestions[0]).includes("weather data"), true);
  assert.equal(normalizeSearchQuery("  ÁRVÍZTŰRŐ  "), "árvíztűrő");
});

test("All, Warnings, and Errors use existing top-level status and intersect with search", () => {
  assert.deepEqual(getPreviewFilterCounts(searchableQuestions), { all: 3, warning: 1, error: 1 });
  assert.deepEqual(filterPreviewQuestions(searchableQuestions, "", "all").map(({ sourceIndex }) => sourceIndex), [17, 21, 41]);
  assert.deepEqual(filterPreviewQuestions(searchableQuestions, "", "warning").map(({ sourceIndex }) => sourceIndex), [21]);
  assert.deepEqual(filterPreviewQuestions(searchableQuestions, "", "error").map(({ sourceIndex }) => sourceIndex), [41]);
  assert.deepEqual(filterPreviewQuestions(searchableQuestions, "budapest", "warning").map(({ sourceIndex }) => sourceIndex), [21]);
  assert.deepEqual(filterPreviewQuestions(searchableQuestions, "budapest", "error").map(({ sourceIndex }) => sourceIndex), []);
  assert.equal(normalizeStatusFilter("ready"), "all");
});

test("result summaries and restricted ranges use exact singular and plural wording", () => {
  assert.equal(formatPreviewResultSummary(18, "GDPR", "all"), "18 questions matching “GDPR”");
  assert.equal(formatPreviewResultSummary(3, "GDPR", "warning"), "3 questions matching “GDPR” have warnings");
  assert.equal(formatPreviewResultSummary(1, "GDPR", "error"), "1 question matching “GDPR” has an error");
  assert.equal(formatPreviewResultSummary(14, "", "warning"), "14 questions with warnings");
  assert.equal(formatPreviewResultSummary(1, "", "warning"), "1 question with a warning");
  assert.equal(formatPreviewResultSummary(4, "", "error"), "4 questions with errors");
  assert.equal(formatPreviewResultSummary(1, "", "error"), "1 question with an error");
  assert.equal(formatPreviewResultRange(getPreviewPage(63, 1, 20), true), "Showing 1–20 of 63 matching questions");
  assert.equal(formatPreviewResultRange(getPreviewPage(1), true), "Showing 1 of 1 matching question");
});

test("search and filtering preserve canonical objects, source order, and paginated coverage", () => {
  for (const total of [47, 200, 1000]) {
    const questions = Array.from({ length: total }, (_, index) => ({
      sourceIndex: index + 1,
      status: (index + 1) % 41 === 0 ? "error" : (index + 1) % 21 === 0 ? "warning" : "ready",
      text: (index + 1) % 3 === 0 ? `GDPR review ${index + 1}` : `Other topic ${index + 1}`,
      answers: [], tags: [],
    }));
    const snapshot = structuredClone(questions);
    const results = filterPreviewQuestions(questions, "GDPR", "all");
    for (const pageSize of [20, 50, 100]) {
      const pageCount = getPreviewPage(results.length, 1, pageSize).totalPages;
      const seen = [];
      for (let page = 1; page <= pageCount; page += 1) {
        seen.push(...paginateQuestions(results, page, pageSize).questions.map(({ sourceIndex }) => sourceIndex));
      }
      assert.deepEqual(seen, results.map(({ sourceIndex }) => sourceIndex), `${total} @ ${pageSize}`);
    }
    assert.deepEqual(questions, snapshot);
  }
});

test("derived search corpus cache preserves semantics without mutating canonical questions", () => {
  const snapshot = structuredClone(searchableQuestions);
  const cache = createPreviewSearchCorpusCache(searchableQuestions);
  for (const [query, filter] of [["budapest", "all"], ["budapest", "warning"], ["41", "error"], ["gdpr", "all"]]) {
    assert.deepEqual(
      filterPreviewQuestions(searchableQuestions, query, filter, cache).map(({ sourceIndex }) => sourceIndex),
      filterPreviewQuestions(searchableQuestions, query, filter).map(({ sourceIndex }) => sourceIndex),
    );
  }
  assert.deepEqual(searchableQuestions, snapshot);
  assert.equal(cache.has(searchableQuestions[0]), true);
});
