import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  applySettings,
  DIAGNOSTIC_CODES,
  generateMoodleXml,
  parseCsv,
  validateQuestions,
} from "../js/core.js";

const settings = {
  category: "",
  shuffleAnswers: true,
  generateNames: true,
  removeQuestionNumbering: true,
  capitalizeAnswers: false,
  answerNumbering: "abc",
};

function prepare(csv) {
  const parsed = parseCsv(csv);
  const questions = applySettings(parsed.questions, settings);
  return { parsed, questions, validation: validateQuestions(questions, parsed.fileIssues) };
}

test("Short Answer supports defaults, multiple accepted answers, feedback, case sensitivity, Unicode, and XML escaping", () => {
  const csv = [
    "type,question_text,answer_1,answer_1_fraction,answer_1_feedback,answer_2,answer_2_fraction,answer_2_feedback,case_sensitive,general_feedback",
    'shortanswer,"What is <Magyarország> fővárosa & központja?",Budapest,100,Helyes.,"Budapest & City",50,Részben.,true,"Általános <visszajelzés>"',
    "shortanswer,Українська столиця?,Київ,,,,,,false,",
  ].join("\n");
  const { parsed, questions, validation } = prepare(csv);
  assert.equal(parsed.mapping.certain, true);
  assert.equal(validation.canExport, true);
  assert.equal(questions[0].caseSensitive, true);
  assert.equal(questions[1].caseSensitive, false);
  assert.deepEqual(questions[0].answers.map(({ fraction }) => fraction), [100, 50]);
  assert.equal(questions[1].answers[0].fraction, 100);
  const xml = generateMoodleXml(questions, settings);
  assert.equal((xml.match(/<question type="shortanswer">/gu) ?? []).length, 2);
  assert.match(xml, /<usecase>1<\/usecase>/u);
  assert.match(xml, /<usecase>0<\/usecase>/u);
  assert.match(xml, /What is &lt;Magyarország&gt; fővárosa &amp; központja\?/u);
  assert.match(xml, /<text>Budapest &amp; City<\/text>/u);
  assert.match(xml, /<text>Київ<\/text>/u);
});

test("Short Answer validation blocks missing answers, malformed fractions, and unsupported case values with row context", () => {
  const csv = [
    "type,question_text,answer_1,answer_1_fraction,case_sensitive",
    "shortanswer,Missing answer?,,,false",
    "shortanswer,Bad fraction?,Answer,nope,false",
    "shortanswer,Bad case?,Answer,100,sometimes",
  ].join("\n");
  const { validation } = prepare(csv);
  assert.equal(validation.canExport, false);
  const missing = validation.questions[0].diagnostics.find(({ code }) => code === DIAGNOSTIC_CODES.NO_POSITIVE_ANSWER);
  const fraction = validation.questions[1].diagnostics.find(({ code }) => code === DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION);
  const caseValue = validation.questions[2].diagnostics.find(({ title }) => title === "Unsupported case-sensitive value");
  assert.equal(missing.metadata.csvRow, 2);
  assert.equal(fraction.field, "answer_A_fraction");
  assert.equal(caseValue.field, "case_sensitive");
});

test("Numerical supports integers, decimals, negatives, zero/non-zero tolerance, multiple values, and feedback", () => {
  const csv = [
    "type,question_text,answer_1,answer_1_fraction,answer_1_tolerance,answer_1_feedback,answer_2,answer_2_fraction,answer_2_tolerance",
    "numerical,Approximately what is pi?,3.14,100,0.01,Correct.,3.14159,50,0",
    "numerical,Give a negative integer.,-24,100,0,Correct.,,,",
    "numerical,Give a decimal.,1.5,100,0,,,",
  ].join("\n");
  const { questions, validation } = prepare(csv);
  assert.equal(validation.canExport, true);
  assert.deepEqual(questions.flatMap(({ answers }) => answers.map(({ originalText }) => originalText)),
    ["3.14", "3.14159", "-24", "1.5"]);
  assert.deepEqual(questions[0].answers.map(({ tolerance }) => tolerance), [0.01, 0]);
  const xml = generateMoodleXml(questions, settings);
  assert.equal((xml.match(/<question type="numerical">/gu) ?? []).length, 3);
  assert.match(xml, /<text>3\.14<\/text>[\s\S]*<tolerance>0\.01<\/tolerance>/u);
  assert.match(xml, /<text>-24<\/text>[\s\S]*<tolerance>0<\/tolerance>/u);
  assert.match(xml, /<text>1\.5<\/text>/u);
});

test("Numerical validation rejects invalid answers and tolerances while preserving zero", () => {
  const csv = [
    "type,question_text,answer_1,answer_1_fraction,answer_1_tolerance",
    "numerical,Bad answer?,twelve,100,0",
    "numerical,Bad tolerance?,12,100,-0.1",
    "numerical,Malformed tolerance?,12,100,near",
    "numerical,Zero tolerance?,12,100,0",
  ].join("\n");
  const { questions, validation } = prepare(csv);
  assert.ok(validation.questions[0].diagnostics.some(({ code }) => code === DIAGNOSTIC_CODES.INVALID_NUMERICAL_ANSWER));
  assert.ok(validation.questions[1].diagnostics.some(({ code }) => code === DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE));
  assert.ok(validation.questions[2].diagnostics.some(({ code }) => code === DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE));
  assert.equal(validation.questions[3].status, "ready");
  assert.equal(questions[3].answers[0].tolerance, 0);
});

test("Essay uses conservative internal Moodle defaults without automatically graded answers", () => {
  const csv = [
    "type,question_text,question_name,default_mark,general_feedback,tags",
    'essay,"Explain the principle of proportionality — arányosság.",Principle of proportionality,10,"Grader feedback: <review>",law;Unicode',
  ].join("\n");
  const { questions, validation } = prepare(csv);
  assert.equal(validation.canExport, true);
  assert.equal(questions[0].answers.length, 0);
  const xml = generateMoodleXml(questions, settings);
  assert.match(xml, /<question type="essay">/u);
  assert.match(xml, /<defaultgrade>10<\/defaultgrade>/u);
  assert.match(xml, /<responseformat>editor<\/responseformat>/u);
  assert.match(xml, /<responserequired>1<\/responserequired>/u);
  assert.match(xml, /<attachments>0<\/attachments>/u);
  assert.doesNotMatch(xml, /<answer fraction=/u);
});

test("Description supports multiline Unicode and special characters without grading UI data", () => {
  const csv = 'type,question_text,general_feedback\ndescription,"Read <this> scenario & note:\nMásodik sor — 日本語.",""';
  const { questions, validation } = prepare(csv);
  assert.equal(validation.canExport, true);
  assert.equal(questions[0].answers.length, 0);
  assert.equal(questions[0].defaultMark, 0);
  const xml = generateMoodleXml(questions, settings);
  assert.match(xml, /<question type="description">/u);
  assert.match(xml, /Read &amp;lt;this&amp;gt; scenario &amp;amp; note:&lt;br&gt;Második sor — 日本語\./u);
  assert.match(xml, /<defaultgrade>0<\/defaultgrade>/u);
  assert.doesNotMatch(xml, /<answer fraction=/u);
});

test("mixed Advanced CSV validates and exports all six supported Moodle question types by row", () => {
  const headers = ["type", "question_text", "question_name", "default_mark", "general_feedback", "answer_1",
    "answer_1_fraction", "answer_1_tolerance", "answer_1_feedback", "answer_2", "answer_2_fraction",
    "answer_2_tolerance", "answer_2_feedback", "case_sensitive"];
  const rows = [
    ["multichoice", "Choose A.", "", "", "", "A", "100", "", "", "B", "0", "", "", ""],
    ["truefalse", "The sky can appear blue.", "", "", "", "true", "100", "", "Correct.", "false", "0", "", "", ""],
    ["shortanswer", "Capital of Hungary?", "", "", "", "Budapest", "100", "", "Correct.", "", "", "", "", "false"],
    ["numerical", "Approximately pi?", "", "", "", "3.14", "100", "0.01", "Correct.", "", "", "", "", ""],
    ["essay", "Explain proportionality.", "Essay name", "10", "Review rubric.", "", "", "", "", "", "", "", "", ""],
    ["description", "Read the next scenario.", "Scenario", "", "", "", "", "", "", "", "", "", "", ""],
  ];
  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
  const { parsed, questions, validation } = prepare(csv);
  assert.equal(parsed.mapping.certain, true);
  assert.equal(validation.canExport, true);
  assert.deepEqual(questions.map(({ type }) => type),
    ["multichoice", "truefalse", "shortanswer", "numerical", "essay", "description"]);
  const xml = generateMoodleXml(questions, settings);
  for (const type of ["multichoice", "truefalse", "shortanswer", "numerical", "essay", "description"]) {
    assert.equal((xml.match(new RegExp(`<question type="${type}">`, "gu")) ?? []).length, 1, type);
  }
});

test("unsupported types remain blocking and include source field context", () => {
  const { validation } = prepare("type,question_text\nmatching,Match these items");
  const issue = validation.questions[0].diagnostics.find(({ code }) => code === DIAGNOSTIC_CODES.UNSUPPORTED_QUESTION_TYPE);
  assert.equal(issue.field, "type");
  assert.equal(issue.metadata.csvRow, 2);
  assert.equal(validation.canExport, false);
});

test("existing Basic, Advanced, and True/False XML remains byte-for-byte unchanged", async () => {
  const expected = new Map([
    ["examples/uniquiz-template.csv", "2edf9adb3108f534e2dbd84e28c1dce7f43e244694db63d6556be8c223d09345"],
    ["examples/uniquiz-advanced-template.csv", "222956725ab7018db88d618d8d390d49ad98a5070356f2f0178a4401fc0b4c6c"],
    ["tests/fixtures/test-true.csv", "f8cf6c04ba17b88b96dfd613779c98bffb323e431156df263e146491956a51ff"],
  ]);
  for (const [file, digest] of expected) {
    const csv = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const parsed = parseCsv(csv);
    const xml = generateMoodleXml(applySettings(parsed.questions, settings), settings);
    assert.equal(createHash("sha256").update(xml).digest("hex"), digest, file);
  }
});
