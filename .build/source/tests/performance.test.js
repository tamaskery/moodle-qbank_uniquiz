import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applySettings,
  generateMoodleXml,
  parseCsv,
  validateQuestions,
} from "../js/core.js";
import {
  createPreviewSearchCorpusCache,
  filterPreviewQuestions,
  paginateQuestions,
} from "../js/preview.js";

const fixtureRoot = new URL("fixtures/performance/", import.meta.url);
const settings = {
  category: "", shuffleAnswers: true, generateNames: true,
  removeQuestionNumbering: true, capitalizeAnswers: false, answerNumbering: "abc",
};

async function loadFixture(name) {
  const source = await readFile(new URL(name, fixtureRoot), "utf8");
  const parsed = parseCsv(source);
  const prepared = applySettings(parsed.questions, settings);
  const validation = validateQuestions(prepared, parsed.fileIssues);
  return { source, parsed, prepared, validation };
}

test("v0.4.7 simple, rich, Unicode, and long-content stress fixtures preserve full-bank models", async () => {
  const cases = [
    ["1000-simple-mcqs.csv", 1000],
    ["1000-rich-mcqs.csv", 1000],
    ["1000-unicode-questions.csv", 1000],
    ["500-long-content-questions.csv", 500],
  ];
  for (const [name, expected] of cases) {
    const { prepared, validation } = await loadFixture(name);
    assert.equal(prepared.length, expected, name);
    assert.equal(validation.canExport, true, name);
    assert.equal(validation.readiness.error, 0, name);
    assert.equal(prepared[0].sourceIndex, 1, name);
    assert.equal(prepared.at(-1).sourceIndex, expected, name);
  }
});

test("rich and Unicode stress fixtures preserve metadata, feedback, answers, and scripts", async () => {
  const rich = await loadFixture("1000-rich-mcqs.csv");
  assert.equal(rich.prepared[499].answers.length, 6);
  assert.match(rich.prepared[499].generalFeedback, /complete learning context/u);
  assert.match(rich.prepared[499].answers[5].feedback, /Detailed answer F feedback/u);
  assert.equal(rich.prepared[499].tags.includes("rich"), true);
  assert.match(rich.prepared[499].category, /Performance\/Module/u);

  const unicode = await loadFixture("1000-unicode-questions.csv");
  assert.match(unicode.prepared[0].text, /Кириллица/u);
  assert.match(unicode.prepared[1].text, /混合 Unicode/u);
  assert.match(unicode.prepared[2].text, /Árvíztűrő tükörfúrógép/u);
});

test("1,000-question mixed-status fixture retains exact top-level status and source identity", async () => {
  const mixed = await loadFixture("1000-mixed-status-questions.csv");
  assert.equal(mixed.validation.readiness.ready, 980);
  assert.equal(mixed.validation.readiness.warning, 15);
  assert.equal(mixed.validation.readiness.error, 5);
  assert.equal(mixed.validation.canExport, false);
  const bySource = new Map(mixed.validation.questions.map((question) => [question.sourceIndex, question]));
  for (const sourceIndex of [1, 20, 21, 100, 101, 500, 999, 1000]) {
    assert.equal(bySource.get(sourceIndex)?.sourceIndex, sourceIndex);
  }
  assert.equal(bySource.get(100).status, "warning");
  assert.equal(bySource.get(200).status, "error");
  assert.equal(bySource.get(1000).status, "error");
});

test("cached large-bank search/filter and pagination preserve order without skips or duplicates", async () => {
  const { validation } = await loadFixture("1000-mixed-status-questions.csv");
  const questions = validation.questions;
  const cache = createPreviewSearchCorpusCache(questions);
  for (const [query, filter] of [["question", "all"], ["repeated", "warning"], ["1000", "error"]]) {
    const results = filterPreviewQuestions(questions, query, filter, cache);
    const expected = filterPreviewQuestions(questions, query, filter);
    assert.deepEqual(results.map(({ sourceIndex }) => sourceIndex), expected.map(({ sourceIndex }) => sourceIndex));
    for (const pageSize of [20, 50, 100]) {
      const seen = [];
      for (let page = 1; seen.length < results.length; page += 1) {
        seen.push(...paginateQuestions(results, page, pageSize).questions.map(({ sourceIndex }) => sourceIndex));
      }
      assert.deepEqual(seen, results.map(({ sourceIndex }) => sourceIndex), `${query}/${filter}/${pageSize}`);
      assert.equal(new Set(seen).size, seen.length, `${query}/${filter}/${pageSize}`);
    }
  }
});

test("clean 1,000-question fixtures export every question independent of preview derivation", async () => {
  for (const name of ["1000-simple-mcqs.csv", "1000-rich-mcqs.csv", "1000-unicode-questions.csv"]) {
    const { prepared, validation } = await loadFixture(name);
    filterPreviewQuestions(validation.questions, "question 999", "all", createPreviewSearchCorpusCache(validation.questions));
    paginateQuestions(validation.questions, 2, 100);
    const xml = generateMoodleXml(prepared, settings);
    assert.equal((xml.match(/<question type="multichoice">/gu) ?? []).length, 1000, name);
  }
});
