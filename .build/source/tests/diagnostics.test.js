import test from "node:test";
import assert from "node:assert/strict";
import {
  DIAGNOSTIC_CODES,
  applySettings,
  classifyQuestionStatus,
  formatDiagnostic,
  formatReadinessSummary,
  generateMoodleXml,
  getInputDiagnostic,
  parseCsv,
  parseDelimited,
  parseTxt,
  resolveCsvMappingIssues,
  validateQuestions,
} from "../js/core.js";
import { BANK_FIXTURES, diagnosticBankCsv } from "./fixtures/diagnostic-banks.js";

const settings = {
  category: "",
  shuffleAnswers: true,
  generateNames: true,
  removeQuestionNumbering: true,
  capitalizeAnswers: false,
  answerNumbering: "abc",
};

function validateCsv(csv, overrides = settings) {
  const parsed = parseCsv(csv);
  const prepared = applySettings(parsed.questions, overrides);
  return validateQuestions(prepared, parsed.fileIssues);
}

function cleanQuestion() {
  return parseCsv("Question,Answer A,Answer B,Answer C,Correct\nClean?,Yes,No,Maybe,A").questions[0];
}

function findCode(validation, code) {
  return validation.issues.find((diagnostic) => diagnostic.code === code);
}

function assertDiagnostic(diagnostic, { code, severity, title, sourceIndex }) {
  assert.ok(diagnostic, `${code} diagnostic exists`);
  assert.equal(diagnostic.code, code);
  assert.equal(diagnostic.severity, severity);
  assert.equal(diagnostic.title, title);
  assert.equal(diagnostic.sourceIndex, sourceIndex);
  assert.equal(typeof diagnostic.message, "string");
  assert.ok(diagnostic.message.length > 10);
}

test("diagnostic formatter presents WHAT, WHERE, and HOW without duplicating location text", () => {
  assert.equal(
    formatDiagnostic({
      code: DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION,
      severity: "error",
      title: "Invalid fraction",
      message: "Use a supported numeric percentage.",
      sourceIndex: 3,
      field: "answer_2_fraction",
      metadata: { csvRow: 7 },
    }),
    "CSV row 7 · Question 3 · answer_2_fraction: Invalid fraction: Use a supported numeric percentage.",
  );

  assert.equal(
    formatDiagnostic({
      code: DIAGNOSTIC_CODES.TXT_ANSWER_KEY_MISSING,
      severity: "error",
      title: "Missing answer key",
      message: "Line 18: add an ANSWER line after the options.",
      metadata: { line: 18 },
    }),
    "Missing answer key: Line 18: add an ANSWER line after the options.",
  );

  assert.equal(
    formatDiagnostic({
      code: "LEGACY",
      severity: "warning",
      title: "Legacy warning",
      message: "Existing message remains usable.",
    }),
    "Legacy warning: Existing message remains usable.",
  );
});

test("CSV parser preserves valid quoted parsing while reporting logical row locations", () => {
  const parsed = parseDelimited(
    'Question,Answer A,Answer B,Correct\n\n"Line one\nLine two","A, value","Say ""B""",B',
  );

  assert.equal(parsed.delimiter, ",");
  assert.deepEqual(parsed.rows, [
    ["Question", "Answer A", "Answer B", "Correct"],
    ["Line one\nLine two", "A, value", 'Say "B"', "B"],
  ]);
  assert.deepEqual(parsed.rowLocations, [{ csvRow: 1 }, { csvRow: 3 }]);
});

test("malformed CSV quoting is normalized into a structured import diagnostic", () => {
  let error;
  try {
    parseCsv('Question,Answer A,Answer B,Correct\n"Broken,Yes,No,A');
  } catch (caught) {
    error = caught;
  }

  const diagnostic = getInputDiagnostic(error);
  assert.ok(diagnostic);
  assert.equal(diagnostic.code, DIAGNOSTIC_CODES.CSV_UNCLOSED_QUOTE);
  assert.deepEqual(diagnostic.metadata, { csvRow: 2, csvColumn: 1 });
  assert.match(formatDiagnostic(diagnostic), /^CSV row 2, column 1:/);
  assert.match(formatDiagnostic(diagnostic), /Add the closing double quote/);
});

test("CSV header diagnostics include stable one-based row and column locations", () => {
  const unknown = parseCsv([
    "Question,Answer A,Answer B,Correct,Author Notes",
    "Capital of France?,Paris,Rome,A,reviewed",
  ].join("\n"));
  const unknownHeader = unknown.fileIssues.find(
    (diagnostic) => diagnostic.code === DIAGNOSTIC_CODES.UNKNOWN_HEADER,
  );
  assert.deepEqual(
    {
      csvRow: unknownHeader.metadata.csvRow,
      csvColumn: unknownHeader.metadata.csvColumn,
      columnIndex: unknownHeader.metadata.columnIndex,
    },
    { csvRow: 1, csvColumn: 5, columnIndex: 4 },
  );

  const duplicate = parseCsv([
    "Question,question,Answer A,Answer B,Correct",
    "Capital of France?,ignored,Paris,Rome,A",
  ].join("\n"));
  const duplicateHeader = duplicate.fileIssues.find(
    (diagnostic) => diagnostic.code === DIAGNOSTIC_CODES.DUPLICATE_HEADER,
  );
  assert.deepEqual(
    {
      csvRow: duplicateHeader.metadata.csvRow,
      csvColumn: duplicateHeader.metadata.csvColumn,
      columnIndex: duplicateHeader.metadata.columnIndex,
    },
    { csvRow: 1, csvColumn: 2, columnIndex: 1 },
  );
});

test("manual mapping clears resolved unknown-column warnings but retains ignored columns", () => {
  const csv = "col1,col2,col3,col4,notes\nWhat is 2 + 2?,4,5,A,reviewed";
  const parsed = parseCsv(csv);
  const roles = ["question", "answer:A", "answer:B", "correct", "ignore"];
  const issues = resolveCsvMappingIssues(parsed.fileIssues, roles);
  assert.deepEqual(issues.map((issue) => issue.field), ["notes"]);
  const remapped = parseCsv(csv, roles);
  assert.deepEqual(remapped.fileIssues.map((issue) => issue.field), ["notes"]);
  assert.equal(remapped.questions[0].text, "What is 2 + 2?");
  assert.equal(validateQuestions(remapped.questions, remapped.fileIssues).canExport, true);
});

test("uncertain CSV mappings name the missing requirement and recovery action", () => {
  const cases = [
    {
      csv: "Answer A,Answer B,Correct\nParis,Rome,A",
      expected: /Question text column not identified/,
    },
    {
      csv: "Question,Answer A,Correct\nCapital of France?,Paris,A",
      expected: /At least two answer columns are required/,
    },
    {
      csv: "Question,Answer A,Answer B\nCapital of France?,Paris,Rome",
      expected: /Correct-answer column not identified/,
    },
  ];

  for (const fixture of cases) {
    const parsed = parseCsv(fixture.csv);
    assert.equal(parsed.mapping.certain, false);
    assert.match(parsed.mapping.message, fixture.expected);
    assert.match(parsed.mapping.message, /Rename the column or use manual column mapping/);
  }
});

test("Advanced CSV errors retain source row and field or answer context", () => {
  const header = [
    "type", "question_text", "default_mark", "shuffle_answers", "answer_numbering", "single",
    "answer_1", "answer_1_fraction", "answer_2", "answer_2_fraction", "answer_3_feedback",
  ].join(",");
  const cases = [
    {
      row: "multichoice,Q?,1,maybe,abc,false,A,100,B,0,",
      code: DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
      field: "shuffle_answers",
    },
    {
      row: "multichoice,Q?,nope,true,abc,false,A,100,B,0,",
      code: DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK,
      field: "default_mark",
    },
    {
      row: "multichoice,Q?,1,true,abc,false,A,nope,B,100,",
      code: DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION,
      field: "answer_A_fraction",
    },
    {
      row: "multichoice,Q?,1,true,roman,false,A,100,B,0,",
      code: DIAGNOSTIC_CODES.INVALID_ANSWER_NUMBERING,
      field: "answer_numbering",
    },
    {
      row: "matching,Q?,1,true,abc,false,A,100,B,0,",
      code: DIAGNOSTIC_CODES.UNSUPPORTED_QUESTION_TYPE,
      field: "type",
    },
    {
      row: "multichoice,Q?,1,true,abc,false,A,100,B,0,orphan",
      code: DIAGNOSTIC_CODES.ANSWER_DATA_WITHOUT_TEXT,
      answerIndex: "C",
    },
    {
      row: "multichoice,Q?,1,true,abc,true,A,50,B,50,",
      code: DIAGNOSTIC_CODES.SINGLE_MODE_CONFLICT,
      field: "single",
    },
  ];

  for (const fixture of cases) {
    const validation = validateCsv(header + "\n" + fixture.row);
    const diagnostic = findCode(validation, fixture.code);
    assert.ok(diagnostic, fixture.code);
    assert.equal(diagnostic.sourceIndex, 1, fixture.code);
    assert.equal(diagnostic.metadata.csvRow, 2, fixture.code);
    if (fixture.field) assert.equal(diagnostic.field, fixture.field, fixture.code);
    if (fixture.answerIndex) assert.equal(diagnostic.answerIndex, fixture.answerIndex, fixture.code);
    assert.equal(validation.canExport, false, fixture.code);
  }
});

test("Basic and True/False validation errors retain their CSV data row", () => {
  const basicCases = [
    {
      csv: "Question,Answer A,Answer B,Correct\nQuestion?,Yes,No,Z",
      code: DIAGNOSTIC_CODES.CORRECT_ANSWER_REFERENCE_INVALID,
      field: "correct",
    },
    {
      csv: "Question,Answer A,Answer B,Correct\n,Yes,No,A",
      code: DIAGNOSTIC_CODES.QUESTION_TEXT_MISSING,
      field: "question_text",
    },
  ];
  for (const fixture of basicCases) {
    const validation = validateCsv(fixture.csv);
    const diagnostic = findCode(validation, fixture.code);
    assert.equal(diagnostic.metadata.csvRow, 2);
    assert.equal(diagnostic.field, fixture.field);
    assert.equal(validation.canExport, false);
  }

  const booleanCases = [
    {
      csv: "Question,Answer\nQuestion?,maybe",
      code: DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
      field: "boolean_value",
    },
    {
      csv: "Question,Answer\n,true",
      code: DIAGNOSTIC_CODES.QUESTION_TEXT_MISSING,
      field: "question_text",
    },
  ];
  for (const fixture of booleanCases) {
    const validation = validateCsv(fixture.csv);
    const diagnostic = findCode(validation, fixture.code);
    assert.equal(diagnostic.metadata.csvRow, 2);
    assert.equal(diagnostic.field, fixture.field);
    assert.equal(validation.canExport, false);
  }
});

test("TXT import and question diagnostics retain source-line recovery context", () => {
  const missingKey = parseTxt("Question?\nA. Yes\nB. No");
  const missingValidation = validateQuestions(missingKey.questions, missingKey.fileIssues);
  const missingDiagnostic = findCode(missingValidation, DIAGNOSTIC_CODES.TXT_ANSWER_KEY_MISSING);
  assert.equal(missingDiagnostic.metadata.line, 1);
  assert.match(formatDiagnostic(missingDiagnostic), /line 1/i);
  assert.equal(missingValidation.canExport, false);

  const invalidReference = parseTxt("Question?\nA. Yes\nB. No\nANSWER: C");
  const invalidValidation = validateQuestions(invalidReference.questions, invalidReference.fileIssues);
  const invalidDiagnostic = findCode(invalidValidation, DIAGNOSTIC_CODES.CORRECT_ANSWER_REFERENCE_INVALID);
  assert.equal(invalidDiagnostic.metadata.line, 1);
  assert.match(formatDiagnostic(invalidDiagnostic), /Line 1 · Question 1/);
  assert.equal(invalidValidation.canExport, false);
});

test("manual mapping remains a successful recovery path for unrecognized headers", () => {
  const parsed = parseCsv(
    "Prompt,Choice One,Choice Two,Key\nCapital of France?,Paris,Rome,A",
    ["question", "answer:A", "answer:B", "correct"],
  );
  const validation = validateQuestions(parsed.questions);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].text, "Capital of France?");
  assert.deepEqual(parsed.questions[0].correctLabels, ["A"]);
  assert.equal(validation.canExport, true);
});

test("classifies Ready, Warning and Error by highest severity", () => {
  assert.equal(classifyQuestionStatus([]), "ready");
  assert.equal(classifyQuestionStatus([{ severity: "warning" }, { severity: "warning" }]), "warning");
  assert.equal(classifyQuestionStatus([{ severity: "warning" }, { severity: "error" }]), "error");
});

test("whole-bank fixtures validate every question and produce exact question counts", () => {
  const expected = {
    one: [1, 1, 0, 0, true],
    twenty: [20, 20, 0, 0, true],
    fortySeven: [47, 47, 0, 0, true],
    twoHundred: [200, 197, 3, 0, true],
    oneThousand: [1000, 982, 14, 4, false],
  };
  for (const [name, fixture] of Object.entries(BANK_FIXTURES)) {
    const validation = validateCsv(diagnosticBankCsv(fixture.total, fixture));
    assert.deepEqual([
      validation.readiness.total,
      validation.readiness.ready,
      validation.readiness.warning,
      validation.readiness.error,
      validation.canExport,
    ], expected[name], name);
    assert.equal(validation.readiness.ready + validation.readiness.warning + validation.readiness.error,
      validation.readiness.total, name);
  }
});

test("formats the exact clean, warning and error whole-bank summaries", () => {
  const clean = formatReadinessSummary({ total: 47, ready: 47, warning: 0, error: 0,
    importErrorCount: 0, importWarningCount: 0 });
  assert.deepEqual(clean, {
    heading: "47 questions ready for Moodle", counts: "", supporting: "No issues detected.",
    status: "Ready to export", blocked: false,
  });
  const warning = formatReadinessSummary({ total: 200, ready: 197, warning: 3, error: 0,
    importErrorCount: 0, importWarningCount: 0 });
  assert.equal(warning.heading, "200 questions found");
  assert.equal(warning.counts, "197 ready · 3 with warnings · 0 with errors");
  assert.equal(warning.supporting, "Warnings do not prevent export, but reviewing them is recommended.");
  assert.equal(warning.status, "Ready to export with warnings");
  const error = formatReadinessSummary({ total: 1000, ready: 982, warning: 14, error: 4,
    importErrorCount: 0, importWarningCount: 0 });
  assert.equal(error.heading, "1,000 questions found");
  assert.equal(error.counts, "982 ready · 14 with warnings · 4 with errors");
  assert.equal(error.supporting, "4 questions contain errors that must be resolved before export.");
  assert.equal(error.status, "Export blocked");
  const singular = formatReadinessSummary({ total: 2, ready: 1, warning: 0, error: 1,
    importErrorCount: 0, importWarningCount: 0 });
  assert.equal(singular.counts, "1 ready · 0 with warnings · 1 with error");
  assert.equal(singular.supporting, "1 question contains an error that must be resolved before export.");
});

test("formats the explicit no-question state", () => {
  assert.deepEqual(formatReadinessSummary({ total: 0, ready: 0, warning: 0, error: 0,
    importErrorCount: 0, importWarningCount: 0 }), {
    heading: "No questions detected",
    counts: "",
    supporting: "UniQuiz could not identify any supported questions in this input. Check the file structure or try another supported format.",
    status: "Export blocked",
    blocked: true,
  });
});

test("uses singular whole-bank grammar for one question", () => {
  const clean = formatReadinessSummary({ total: 1, ready: 1, warning: 0, error: 0,
    importErrorCount: 0, importWarningCount: 0 });
  assert.equal(clean.heading, "1 question ready for Moodle");
  const error = formatReadinessSummary({ total: 1, ready: 0, warning: 0, error: 1,
    importErrorCount: 0, importWarningCount: 0 });
  assert.equal(error.heading, "1 question found");
});

test("multiple diagnostics count the question once at its highest severity", () => {
  const warningQuestion = structuredClone(cleanQuestion());
  warningQuestion.answers[1].originalText = warningQuestion.answers[0].originalText;
  warningQuestion.answers[2].originalText = warningQuestion.answers[0].originalText;
  const errorQuestion = structuredClone(cleanQuestion());
  errorQuestion.sourceIndex = 2;
  errorQuestion.answers[1].originalText = errorQuestion.answers[0].originalText;
  errorQuestion.answers.forEach((answer) => { answer.fraction = 0; answer.isCorrect = false; });
  errorQuestion.correctLabels = [];
  const validation = validateQuestions([warningQuestion, errorQuestion]);
  assert.equal(validation.questions[0].diagnostics.filter(({ severity }) => severity === "warning").length, 2);
  assert.equal(validation.questions[0].status, "warning");
  assert.equal(validation.questions[1].status, "error");
  assert.deepEqual(validation.readiness, {
    total: 2, ready: 0, warning: 1, error: 1, importErrorCount: 0, importWarningCount: 0, canExport: false,
  });
});

test("canonical sourceIndex survives whole-bank parsing, diagnostics and subset boundaries", () => {
  const fixture = BANK_FIXTURES.oneThousand;
  const validation = validateCsv(diagnosticBankCsv(fixture.total, fixture));
  for (const index of [1, 20, 21, 134, 500, 501, 999, 1000]) {
    const question = validation.questions[index - 1];
    assert.equal(question.sourceIndex, index);
    for (const diagnostic of question.diagnostics) assert.equal(diagnostic.sourceIndex, index);
  }
  assert.equal(validation.questions[20].status, "warning");
  assert.equal(validation.questions[133].status, "error");
  assert.equal(validation.questions[999].status, "error");
});

test("question and import diagnostics remain separate for export eligibility", () => {
  const clean = [cleanQuestion()];
  const warning = validateQuestions(clean, [{ severity: "warning", message: "Review extra metadata." }]);
  assert.equal(warning.questions[0].status, "ready");
  assert.equal(warning.readiness.ready, 1);
  assert.equal(warning.readiness.importWarningCount, 1);
  assert.equal(warning.canExport, true);
  assert.equal(warning.importDiagnostics[0].scope, "import");
  const error = validateQuestions(clean, [{ severity: "error", message: "Malformed import." }]);
  assert.equal(error.questions[0].status, "ready");
  assert.equal(error.readiness.importErrorCount, 1);
  assert.equal(error.canExport, false);
});

test("warnings permit XML export while question errors block every full-bank export", () => {
  const warningFixture = BANK_FIXTURES.twoHundred;
  const warningValidation = validateCsv(diagnosticBankCsv(warningFixture.total, warningFixture));
  assert.equal(warningValidation.canExport, true);
  assert.doesNotThrow(() => generateMoodleXml(warningValidation.questions, settings));
  const errorFixture = BANK_FIXTURES.oneThousand;
  const errorValidation = validateCsv(diagnosticBankCsv(errorFixture.total, errorFixture));
  assert.equal(errorValidation.canExport, false);
  assert.throws(() => generateMoodleXml(errorValidation.questions, settings));
});

test("normal configured transformations and optional blanks remain Ready without warning noise", () => {
  const csv = [
    "question_text,answer_1,answer_2,answer_3,answer_4,answer_5,answer_6,correct,category,tags,general_feedback",
    "Q51. clean transformation?,yes,no,,,,,A,, ,",
    "Q52. second clean transformation?,true,false,,,,,A,, ,",
  ].join("\n");
  const parsed = parseCsv(csv);
  const validation = validateQuestions(applySettings(parsed.questions, {
    ...settings, capitalizeAnswers: true, answerNumbering: "123", generateNames: true,
  }), parsed.fileIssues);
  assert.deepEqual(validation.questions.map(({ text }) => text), ["clean transformation?", "second clean transformation?"]);
  assert.deepEqual(validation.questions.map(({ status }) => status), ["ready", "ready"]);
  assert.equal(validation.warnings.length, 0);
});

test("all structured parser and file diagnostic codes expose stable fields", () => {
  const scenarios = [
    [parseCsv("Question,Answer A,Answer B,Correct,author_notes\nQ?,A,B,A,note"), DIAGNOSTIC_CODES.UNKNOWN_HEADER,
      "warning", "Unrecognized column ignored", null],
    [parseCsv("Question,question_text,Answer A,Answer B,Correct\nQ?,Q?,A,B,A"), DIAGNOSTIC_CODES.DUPLICATE_HEADER,
      "error", "Duplicate column detected", null],
    [parseCsv("Question,Answer\nBoolean?,maybe"), DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
      "error", "Invalid true/false answer", 1],
    [parseCsv("question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,answer_numbering\nQ?,A,100,B,0,roman"),
      DIAGNOSTIC_CODES.INVALID_ANSWER_NUMBERING, "error", "Unsupported answer numbering", 1],
    [parseCsv("question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,answer_3_feedback\nQ?,A,100,B,0,orphan"),
      DIAGNOSTIC_CODES.ANSWER_DATA_WITHOUT_TEXT, "error", "Answer data without answer text", 1],
    [parseCsv("question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,correct\nQ?,A,100,B,0,A"),
      DIAGNOSTIC_CODES.SCORING_METHOD_CONFLICT, "error", "Conflicting scoring methods", 1],
    [parseCsv("question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\nQ?,A,100,B,"),
      DIAGNOSTIC_CODES.MISSING_ANSWER_FRACTION, "error", "Answer fraction is missing", 1],
    [parseCsv("question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\nQ?,A,nope,B,100"),
      DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION, "error", "Invalid answer fraction", 1],
    [parseTxt("ANSWER: A"), DIAGNOSTIC_CODES.TXT_ANSWER_KEY_WITHOUT_QUESTION,
      "error", "Answer key without a question", null],
    [parseTxt("Question?\nA. Yes\nNext question?"), DIAGNOSTIC_CODES.TXT_AMBIGUOUS_STRUCTURE,
      "error", "Ambiguous TXT structure", null],
    [parseTxt("Question?\nA. Yes\nB. No"), DIAGNOSTIC_CODES.TXT_ANSWER_KEY_MISSING,
      "error", "Answer key is missing", null],
    [parseTxt("   "), DIAGNOSTIC_CODES.NO_SUPPORTED_QUESTIONS,
      "error", "No questions detected", null],
  ];
  for (const [parsed, code, severity, title, sourceIndex] of scenarios) {
    const validation = validateQuestions(parsed.questions, parsed.fileIssues);
    assertDiagnostic(findCode(validation, code), { code, severity, title, sourceIndex });
  }
  const fallbackWarning = validateQuestions([cleanQuestion()], [{ severity: "warning", message: "Legacy warning" }]);
  assertDiagnostic(findCode(fallbackWarning, DIAGNOSTIC_CODES.IMPORT_WARNING), {
    code: DIAGNOSTIC_CODES.IMPORT_WARNING, severity: "warning", title: "Review recommended", sourceIndex: null,
  });
  const fallbackError = validateQuestions([cleanQuestion()], [{ severity: "error", message: "Legacy error" }]);
  assertDiagnostic(findCode(fallbackError, DIAGNOSTIC_CODES.IMPORT_ERROR), {
    code: DIAGNOSTIC_CODES.IMPORT_ERROR, severity: "error", title: "Issue requires attention", sourceIndex: null,
  });
});

test("all structured question validation codes expose stable fields", () => {
  const cases = [];
  const add = (mutate, code, title) => {
    const question = structuredClone(cleanQuestion());
    mutate(question);
    cases.push([validateQuestions([question]), code, title]);
  };
  add((q) => { q.type = "matching"; }, DIAGNOSTIC_CODES.UNSUPPORTED_QUESTION_TYPE, "Unsupported question type");
  add((q) => { q.text = ""; }, DIAGNOSTIC_CODES.QUESTION_TEXT_MISSING, "Question text is missing");
  add((q) => { q.answers[1].label = "A"; }, DIAGNOSTIC_CODES.DUPLICATE_ANSWER_LABEL, "Duplicate answer label");
  add((q) => { q.answers = q.answers.slice(0, 1); }, DIAGNOSTIC_CODES.TOO_FEW_ANSWERS, "Not enough answers");
  add((q) => { q.answers[1].originalText = q.answers[0].originalText; },
    DIAGNOSTIC_CODES.DUPLICATE_ANSWER_TEXT, "Duplicate answer text");
  add((q) => { q.answers.forEach((answer) => { answer.fraction = 0; }); q.correctLabels = []; },
    DIAGNOSTIC_CODES.NO_POSITIVE_ANSWER, "No correct answer");
  add((q) => { q.answers[0].fraction = 60; q.answers[1].fraction = 20; },
    DIAGNOSTIC_CODES.POSITIVE_FRACTION_TOTAL_INVALID, "Answer fractions do not total 100%");
  add((q) => { q.answers[0].fraction = 50; q.answers[1].fraction = 50; q.single = true; },
    DIAGNOSTIC_CODES.SINGLE_MODE_CONFLICT, "Conflicting answer mode");
  add((q) => { q.defaultMark = 0; }, DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK, "Invalid default mark");
  add((q) => { q.correctLabels = ["Z"]; },
    DIAGNOSTIC_CODES.CORRECT_ANSWER_REFERENCE_INVALID, "Correct answer reference is invalid");
  add((q) => { q.correctLabels = ["A", "A"]; },
    DIAGNOSTIC_CODES.DUPLICATE_CORRECT_REFERENCE, "Duplicate correct-answer reference");
  for (const [validation, code, title] of cases) {
    assertDiagnostic(findCode(validation, code), { code, severity: code === DIAGNOSTIC_CODES.DUPLICATE_ANSWER_TEXT
      ? "warning" : "error", title, sourceIndex: 1 });
  }
});
