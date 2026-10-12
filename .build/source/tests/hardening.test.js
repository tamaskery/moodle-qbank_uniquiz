import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applySettings,
  generateMoodleXml,
  parseCsv,
  parseTxt,
  validateQuestions,
} from "../js/core.js";
import { analyzeAiken } from "../js/aiken-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const defaultSettings = Object.freeze({
  category: "",
  shuffleAnswers: true,
  generateNames: true,
  removeQuestionNumbering: true,
  capitalizeAnswers: false,
  answerNumbering: "abc",
});

function validateCsv(source) {
  const parsed = parseCsv(source);
  return { parsed, validation: validateQuestions(parsed.questions, parsed.fileIssues) };
}

test("converter and AIKEN upload controls expose one visible keyboard file action", () => {
  const converter = read("convert/index.html");
  const aiken = read("aiken-fixer/index.html");
  assert.match(converter, /<input id="file-input"[^>]*class="sr-only"[^>]*tabindex="-1"/u);
  assert.match(aiken, /<input id="aiken-file"[^>]*class="sr-only"[^>]*tabindex="-1"/u);
  assert.match(converter, /<button id="choose-file"/u);
  assert.match(aiken, /<button id="aiken-choose"/u);
});

test("wizard step headings are programmatic focus targets", () => {
  const converter = read("convert/index.html");
  for (const id of ["upload-title", "analyse-title", "settings-title", "review-title", "download-title"]) {
    assert.match(converter, new RegExp(`<h2 id="${id}" tabindex="-1">`, "u"));
  }
});

test("CSV malformed and sparse inputs remain deterministic and never crash", () => {
  for (const source of ["", "   \r\n\t  "]) {
    assert.throws(() => parseCsv(source), /does not contain any usable rows/u);
  }

  const headersOnly = validateCsv("question_text,answer_a,answer_b,correct\r\n");
  assert.equal(headersOnly.parsed.questions.length, 0);
  assert.equal(headersOnly.validation.canExport, false);

  const missingQuestion = parseCsv("answer_a,answer_b,correct\nYes,No,A");
  assert.equal(missingQuestion.mapping.certain, false);

  const reordered = validateCsv("Correct,Answer B,Question,Answer A\nB,No,Unicode café 🦄?,Yes");
  assert.equal(reordered.validation.canExport, true);
  assert.equal(reordered.validation.questions[0].text, "Unicode café 🦄?");

  const sparse = validateCsv("Question,A,B,C,Correct\nComplete?,Yes,No,,A\nMissing answers?,Only one,,,A");
  assert.equal(sparse.validation.questions.length, 2);
  assert.equal(sparse.validation.questions[0].status, "ready");
  assert.equal(sparse.validation.questions[1].status, "error");

  const unknown = validateCsv("Question,A,B,Correct,Future field\nKnown?,Yes,No,A,ignored\n\n\n");
  assert.equal(unknown.validation.warnings.some(({ code }) => code === "UNKNOWN_HEADER"), true);
  assert.equal(unknown.validation.canExport, true);

  const duplicate = validateCsv("Question,A,A,Correct\nDuplicate header?,Yes,No,A");
  assert.equal(duplicate.validation.errors.some(({ code }) => code === "DUPLICATE_HEADER"), true);
  assert.equal(duplicate.validation.canExport, false);
});

test("CSV quoting, newlines, Unicode, metadata, and long cells round-trip safely", () => {
  const longText = "x".repeat(100_000);
  const source = `\uFEFFquestion_name,question_text,answer_a,answer_b,correct,general_feedback,answer_1_feedback,tags,answer_numbering\r\n"
Explicit, name","A quoted, multiline ""question"" 🦄","Yes, indeed","No",A,"General <feedback>","Correct ""choice""","café;安全;🦄",ABCD\r\n,"Long question ${longText}",Yes,No,A,,,,abc`;
  const { validation } = validateCsv(source);
  assert.equal(validation.questions.length, 2);
  assert.equal(validation.canExport, true);
  assert.equal(validation.questions[0].questionName, "Explicit, name");
  assert.equal(validation.questions[0].text, "A quoted, multiline \"question\" 🦄");
  assert.deepEqual(validation.questions[0].tags, ["café", "安全", "🦄"]);
  assert.equal(validation.questions[0].answerNumbering, "ABCD");
  assert.equal(validation.questions[1].text.length, longText.length + "Long question ".length);
});

test("CSV answer references, fractions, missing answers, and duplicate text keep strict diagnostics", () => {
  const invalidReference = validateCsv("Question,A,B,C,Correct\nPick?,Yes,No,,C");
  assert.equal(invalidReference.validation.errors.some(({ code }) => code === "CORRECT_ANSWER_REFERENCE_INVALID"), true);

  const invalidFraction = validateCsv("question_text,answer_a,answer_b,answer_1_fraction,answer_2_fraction\nPick?,Yes,No,101,-1");
  assert.equal(invalidFraction.validation.errors.some(({ code }) => code === "INVALID_ANSWER_FRACTION"), true);

  const missingAnswers = validateCsv("Question,A,B,Correct\nPick?,Only one,,A");
  assert.equal(missingAnswers.validation.errors.some(({ code }) => code === "TOO_FEW_ANSWERS"), true);

  const duplicateText = validateCsv("Question,A,B,Correct\nPick?,Same,same,A");
  assert.equal(duplicateText.validation.warnings.some(({ code }) => code === "DUPLICATE_ANSWER_TEXT"), true);
  assert.equal(duplicateText.validation.canExport, true);
});

test("TXT malformed-input matrix preserves diagnostics and surviving questions", () => {
  for (const source of ["", " \r\n \n"]) {
    const parsed = parseTxt(source);
    assert.equal(parsed.questions.length, 0);
    assert.equal(parsed.fileIssues.some(({ code }) => code === "NO_SUPPORTED_QUESTIONS"), true);
  }

  const cases = [
    ["Question?\nA. Yes\nB. No", "TXT_ANSWER_KEY_MISSING"],
    ["Question?\nA. Yes\nB. No\nANSWER: Z", "CORRECT_ANSWER_REFERENCE_INVALID"],
    ["Question?\nA. Yes\nANSWER: A", "TOO_FEW_ANSWERS"],
    ["Question?\nA. Yes\nA. No\nANSWER: A", "DUPLICATE_ANSWER_LABEL"],
  ];
  for (const [source, code] of cases) {
    const parsed = parseTxt(source);
    const validation = validateQuestions(parsed.questions, parsed.fileIssues);
    assert.equal(validation.errors.some((item) => item.code === code), true, code);
  }

  const mixed = parseTxt("\uFEFFValid café 🦄?\r\nA. Oui\r\nB. Non\r\nANSWER: A\r\n\r\nBroken question?\r\nA. One\r\n\r\nValid after?\r\nA. Yes\r\nB. No\r\nANSWER: B");
  const validation = validateQuestions(mixed.questions, mixed.fileIssues);
  assert.equal(validation.questions.some(({ text }) => text === "Valid café 🦄?"), true);
  assert.equal(validation.questions.some(({ text }) => text.includes("Valid after?")), true);
  assert.equal(validation.errors.length > 0, true);
  assert.equal(validation.canExport, false);

  const long = "Long question " + "界".repeat(100_000);
  const parsedLong = parseTxt(`${long}\nA. ${"a".repeat(100_000)}\nB. No\nANSWER: A`);
  assert.equal(validateQuestions(parsedLong.questions, parsedLong.fileIssues).canExport, true);
});

test("AIKEN malformed-input matrix is deterministic and never silently passes invalid structure", () => {
  const sources = [
    "",
    "   \r\n",
    "Question?\nA. Yes\nB. No",
    "Question?\nA. Yes\nB. No\nANSWER: Z",
    "Question?\nA. Yes\nANSWER: A",
    "Question?\nA. Yes\nA. No\nANSWER: A",
    "Valid?\nA. Yes\nB. No\nANSWER: A\n\nBroken?\nA. One\n\nAlso valid?\nA. Yes\nB. No\nANSWER: B",
    `Unicode café 安全 🦄?\nA. ${"界".repeat(100_000)}\nB. No\nANSWER: A`,
  ];
  const signatures = sources.map((source) => {
    const first = analyzeAiken(source);
    const second = analyzeAiken(source.replaceAll("\n", "\r\n"));
    assert.equal(first.validForDownload, second.validForDownload);
    assert.deepEqual(first.issues.map(({ code, severity }) => [code, severity]),
      second.issues.map(({ code, severity }) => [code, severity]));
    return [first.summary.total, first.validForDownload, first.issues.map(({ code }) => code)];
  });
  assert.equal(signatures.slice(0, 7).every(([, valid]) => valid === false), true);
  assert.equal(signatures.at(-1)[1], true);
});

test("malicious-looking content is inert in preview sources and escaped in Moodle XML", () => {
  const source = "question_name,question_text,answer_a,answer_b,correct,general_feedback,answer_1_feedback,tags\n"
    + '"<img src=x onerror=alert(1)>","<script>alert(1)</script>","<svg onload=alert(2)>",Safe,A,"<& feedback>","</text><script>alert(3)</script>","x&y"';
  const parsed = parseCsv(source);
  const prepared = applySettings(parsed.questions, defaultSettings);
  const validation = validateQuestions(prepared, parsed.fileIssues);
  assert.equal(validation.canExport, true);
  const xml = generateMoodleXml(validation.questions, defaultSettings);
  assert.doesNotMatch(xml, /<script|<img|<svg|<iframe/iu);
  assert.match(xml, /&amp;lt;script&amp;gt;alert\(1\)&amp;lt;\/script&amp;gt;/u);
  assert.match(xml, /&lt;img src=x onerror=alert\(1\)&gt;/u);
  assert.match(xml, /&amp;lt;\/text&amp;gt;&amp;lt;script&amp;gt;alert\(3\)&amp;lt;\/script&amp;gt;/u);
  assert.match(xml, /x&amp;y/u);

  const app = read("js/app.js");
  const aikenApp = read("js/aiken-app.js");
  assert.doesNotMatch(`${app}\n${aikenApp}`, /\.innerHTML\s*=|insertAdjacentHTML|document\.write|eval\(/gu);
});
