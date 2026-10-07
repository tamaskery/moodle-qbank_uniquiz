import test from "node:test";
import assert from "node:assert/strict";
import {
  AIKEN_SEVERITY,
  analyzeAiken,
  applyAikenReviewFix,
  applySafeAikenFixes,
  createAikenFilename,
  formatAikenIssueContext,
} from "../js/aiken-core.js";

function validQuestion(answerCount = 2, punctuation = ".", question = "Which answer is correct?") {
  const answers = Array.from({ length: answerCount }, (_, index) =>
    `${String.fromCharCode(65 + index)}${punctuation} Answer ${index + 1}`);
  return `${question}\n${answers.join("\n")}\nANSWER: B\n`;
}

function codes(result, severity = null) {
  return result.issues.filter((item) => !severity || item.severity === severity).map((item) => item.code);
}

test("accepts canonical dot and parenthesis AIKEN with 2-6 answers", () => {
  for (const punctuation of [".", ")"]) {
    for (let count = 2; count <= 6; count += 1) {
      const result = analyzeAiken(validQuestion(count, punctuation));
      assert.equal(result.validForDownload, true, `${punctuation} with ${count} answers`);
      assert.equal(result.summary.total, 1);
    }
  }
});

test("accepts multiple questions and preserves Unicode literal content", () => {
  const source = `${validQuestion(3, ".", "Melyik Magyarország fővárosa?")}\n${validQuestion(2, ")", "ما هي الإجابة؟ <script>alert('x')</script>")}`;
  const result = analyzeAiken(source);
  assert.equal(result.validForDownload, true);
  assert.equal(result.summary.total, 2);
  assert.match(result.source, /Magyarország/u);
  assert.match(result.source, /<script>alert\('x'\)<\/script>/u);
});

test("UTF-8 BOM is a safe fix and complete pipeline becomes valid", () => {
  const broken = `\uFEFF${validQuestion()}`;
  assert.deepEqual(codes(analyzeAiken(broken), AIKEN_SEVERITY.SAFE_FIX), ["UTF8_BOM"]);
  const fixed = applySafeAikenFixes(broken);
  assert.equal(fixed.startsWith("\uFEFF"), false);
  assert.equal(analyzeAiken(fixed).validForDownload, true);
});

test("safe formatting issues are detected, corrected, reparsed, and valid", () => {
  const cases = [
    ["missing option spaces", "Question?\nA.First\nB.Second\nANSWER: B", /A\. First/u],
    ["lowercase labels", "Question?\na. First\nb. Second\nANSWER: B", /A\. First/u],
    ["squeezed answer", "Question?\nA. First\nB. Second\nAnswer:B", /ANSWER: B/u],
    ["lowercase answer", "Question?\nA. First\nB. Second\nanswer: b", /ANSWER: B/u],
    ["excess option whitespace", "Question?\nA.     First\nB. Second\nANSWER: B", /A\. First/u],
    ["tabs", "Question?\nA)\tFirst\nB)\tSecond\nANSWER:\tB", /A\) First/u],
    ["repeated blank lines", "Question?\nA. First\nB. Second\nANSWER: B\n\n\n\nNext?\nA. Yes\nB. No\nANSWER: A", /ANSWER: B\n\nNext\?/u],
    ["mixed punctuation", "Question?\nA. First\nB) Second\nC. Third\nANSWER: B", /B\. Second/u],
  ];
  for (const [name, broken, expected] of cases) {
    const before = analyzeAiken(broken);
    assert.ok(before.bySeverity.SAFE_FIX.length > 0, name);
    const fixed = applySafeAikenFixes(broken);
    assert.match(fixed, expected, name);
    const after = analyzeAiken(fixed);
    assert.equal(after.validForDownload, true, `${name}: ${JSON.stringify(after.issues)}`);
  }
});

test("AIKEN issue presentation retains question, source line, recovery, and blocking state", () => {
  const safe = analyzeAiken("Question?\nA.First\nB. Second\nANSWER: B");
  const safeIssue = safe.bySeverity.SAFE_FIX[0];
  assert.match(formatAikenIssueContext(safeIssue), /Question 1 · source line 2/);
  assert.ok(safeIssue.explanation);
  assert.ok(safeIssue.proposedText);

  const review = analyzeAiken("What is the capital\nof Hungary?\nA. Vienna\nB. Budapest\nANSWER: B");
  const reviewIssue = review.bySeverity.REVIEW.find((item) => item.code === "MULTILINE_QUESTION");
  assert.match(formatAikenIssueContext(reviewIssue), /Question 1 · source line 1/);
  assert.ok(reviewIssue.replacement);
  assert.equal(review.validForDownload, false);

  const blocked = analyzeAiken("Question?\nA. One\nB. Two");
  const blockingIssue = blocked.bySeverity.ERROR.find((item) => item.code === "MISSING_ANSWER_KEY");
  assert.match(formatAikenIssueContext(blockingIssue), /Question 1/);
  assert.ok(blockingIssue.explanation);
  assert.equal(blocked.validForDownload, false);
});

test("multiline questions require review and can be explicitly joined", () => {
  const source = "What is the capital\nof Hungary?\nA. Vienna\nB. Budapest\nANSWER: B\n";
  const result = analyzeAiken(source);
  const review = result.bySeverity.REVIEW.find((item) => item.code === "MULTILINE_QUESTION");
  assert.ok(review);
  assert.equal(result.validForDownload, false);
  const fixed = applyAikenReviewFix(source, review);
  assert.match(fixed, /^What is the capital of Hungary\?/u);
  assert.equal(analyzeAiken(fixed).validForDownload, true);
});

test("multiline answers require review and can be explicitly joined", () => {
  const source = "Question?\nA. A long answer\ncontinued here\nB. Another answer\nANSWER: A\n";
  const result = analyzeAiken(source);
  const review = result.bySeverity.REVIEW.find((item) => item.code === "MULTILINE_ANSWER");
  assert.ok(review);
  const fixed = applyAikenReviewFix(source, review);
  assert.match(fixed, /A\. A long answer continued here/u);
  assert.equal(analyzeAiken(fixed).validForDownload, true);
});

test("question numbering requires explicit review before removal", () => {
  const source = validQuestion(2, ".", "Question 7: Which answer is correct?");
  const result = analyzeAiken(source);
  const review = result.bySeverity.REVIEW.find((item) => item.code === "QUESTION_NUMBERING");
  assert.ok(review);
  const fixed = applyAikenReviewFix(source, review);
  assert.match(fixed, /^Which answer is correct\?/u);
  assert.equal(analyzeAiken(fixed).validForDownload, true);
});

test("blocking AIKEN errors are specific and disable output", () => {
  const cases = [
    ["MISSING_ANSWER_KEY", "Question?\nA. One\nB. Two"],
    ["ANSWER_NOT_FOUND", "Question?\nA. One\nB. Two\nANSWER: C"],
    ["DUPLICATE_LABEL", "Question?\nA. One\nA. Two\nANSWER: A"],
    ["TOO_FEW_ANSWERS", "Question?\nA. One\nANSWER: A"],
    ["EMPTY_ANSWER", "Question?\nA.\nB. Two\nANSWER: B"],
    ["CONFLICTING_ANSWER_KEYS", "Question?\nA. One\nB. Two\nANSWER: A\nANSWER: B"],
    ["MULTIPLE_CORRECT_UNSUPPORTED", "Question?\nA. One\nB. Two\nANSWER: A,C"],
    ["LABEL_SEQUENCE", "Question?\nA. One\nC. Two\nANSWER: C"],
  ];
  for (const [expectedCode, source] of cases) {
    const result = analyzeAiken(source);
    assert.equal(result.validForDownload, false, expectedCode);
    assert.ok(codes(result, AIKEN_SEVERITY.ERROR).includes(expectedCode), `${expectedCode}: ${codes(result)}`);
  }
});

test("safe fixes never hide unsupported multiple-correct syntax", () => {
  const source = "Question?\na.One\nb.Two\nanswer:a,b";
  const fixed = applySafeAikenFixes(source);
  const result = analyzeAiken(fixed);
  assert.ok(codes(result, AIKEN_SEVERITY.ERROR).includes("MULTIPLE_CORRECT_UNSUPPORTED"));
  assert.equal(result.validForDownload, false);
});

test("does not treat a tab inside educational answer text as structural spacing", () => {
  const source = "Question?\nA. Column one\tColumn two\nB. Other\nANSWER: A\n";
  const result = analyzeAiken(source);
  assert.equal(result.validForDownload, true);
  assert.equal(result.issues.length, 0);
});

test("creates the required local-time filename", () => {
  assert.equal(createAikenFilename(new Date(2026, 7, 13, 9, 5)), "uniquiz-aiken-fixed-20260813-0905.txt");
});
