import test from "node:test";
import assert from "node:assert/strict";
import {
  applySettings,
  capitalizeFirst,
  cleanSourceQuestionNumbering,
  detectCsvMapping,
  formatFraction,
  generateMoodleXml,
  normalizeHeader,
  normalizeBooleanValue,
  parseCsv,
  parseTxt,
  resolveCsvHeader,
  summarizeQuestions,
  unicodeExcerpt,
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

function ready(questions, overrides = {}) {
  return applySettings(questions, { ...settings, ...overrides });
}

test("parses a normal comma CSV and one correct answer", () => {
  const result = parseCsv("Question,Answer A,Answer B,Correct\nCapital?,Vienna,Budapest,B");
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].answers[1].isCorrect, true);
  assert.equal(validateQuestions(result.questions).errors.length, 0);
});

test("sparse Advanced answer slots preserve metadata and export only usable answers", () => {
  const csv = [
    "question_text,answer_1,answer_1_fraction,answer_1_feedback,answer_2,answer_2_fraction,answer_2_feedback,answer_3,answer_3_fraction,answer_3_feedback,answer_numbering",
    "Gap?,Alpha,100,Alpha feedback,,,,Gamma,0,Gamma feedback,abc",
  ].join("\n");
  const parsed = parseCsv(csv);
  const prepared = ready(parsed.questions);
  const validation = validateQuestions(prepared, parsed.fileIssues);
  const question = validation.questions[0];
  assert.equal(validation.canExport, true);
  assert.deepEqual(question.answers.map(({ label }) => label), ["A", "C"]);
  assert.deepEqual(question.answers.map(({ originalText, fraction, feedback, isCorrect }) => ({
    originalText, fraction, feedback, isCorrect,
  })), [
    { originalText: "Alpha", fraction: 100, feedback: "Alpha feedback", isCorrect: true },
    { originalText: "Gamma", fraction: 0, feedback: "Gamma feedback", isCorrect: false },
  ]);
  const xml = generateMoodleXml(prepared, settings);
  assert.equal((xml.match(/<answer fraction=/gu) ?? []).length, 2);
  assert.match(xml, /<answernumbering>abc<\/answernumbering>/u);
  assert.match(xml, /<text>Alpha<\/text>[\s\S]*<text>Alpha feedback<\/text>/u);
  assert.match(xml, /<text>Gamma<\/text>[\s\S]*<text>Gamma feedback<\/text>/u);
});

test("detects semicolon and tab delimiters", () => {
  assert.equal(parseCsv("Question;A;B;Correct\nCapital?;Vienna;Budapest;B").delimiter, ";");
  assert.equal(parseCsv("Prompt\tOption 1\tOption 2\tKey\nCapital?\tVienna\tBudapest\tB").delimiter, "\t");
});

test("preserves quoted commas and UTF-8 BOM", () => {
  const result = parseCsv('\uFEFFQuestion,Answer A,Answer B,Correct\n"Choose a city, please","Paris, France",Rome,A');
  assert.equal(result.questions[0].text, "Choose a city, please");
  assert.equal(result.questions[0].answers[0].originalText, "Paris, France");
});

test("recognizes alternative column names", () => {
  const result = parseCsv("QuestionText,Option 1,Option 2,Answer Key\nCapital?,Vienna,Budapest,B");
  assert.equal(result.mapping.certain, true);
  assert.equal(result.questions[0].answers[1].isCorrect, true);
  assert.equal(detectCsvMapping(["Prompt", "Option A", "Option B", "Right"]).certain, false);
});

test("normalizes advanced headers deterministically and reports unknown or duplicate columns", () => {
  assert.equal(normalizeHeader("  Partially-Correct   Feedback  "), "partially_correct_feedback");
  assert.equal(resolveCsvHeader("Question Text"), "question_text");
  assert.equal(resolveCsvHeader("Option F"), "answer_6");
  assert.equal(resolveCsvHeader("Answer 6 Feedback"), "answer_6_feedback");
  const mapped = detectCsvMapping(["Question", "question_text", "Answer A", "Answer B", "Correct", "Mystery"]);
  assert.equal(mapped.issues.some(({ severity, message }) => severity === "error" && /Duplicate column/u.test(message)), true);
  assert.equal(mapped.issues.some(({ severity, message }) => severity === "warning" && /Mystery/u.test(message)), true);
  for (const header of ["question_text", "Question Text", "QUESTION TEXT", "question-text", " question_text "]) {
    assert.equal(resolveCsvHeader(header), "question_text");
  }
});

test("parses the Advanced CSV template as one flexible canonical schema", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixture = await readFile(new URL("../examples/uniquiz-advanced-template.csv", import.meta.url), "utf8");
  const parsed = parseCsv(fixture);
  const prepared = ready(parsed.questions, { category: "UI fallback", shuffleAnswers: false, answerNumbering: "abc" });
  const validation = validateQuestions(prepared, parsed.fileIssues);

  assert.equal(parsed.mapping.schema, "fraction");
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.warnings.length, 0);
  assert.deepEqual(prepared.map(({ name }) => name), ["Capital of Hungary", "Prime numbers"]);
  assert.deepEqual(prepared.map(({ category }) => category), ["UniQuiz Advanced Examples", "UniQuiz Advanced Examples"]);
  assert.deepEqual(prepared.map(({ defaultMark }) => defaultMark), [2, 1.5]);
  assert.deepEqual(prepared.map(({ shuffleAnswers }) => shuffleAnswers), [false, true]);
  assert.deepEqual(prepared.map(({ answerNumbering }) => answerNumbering), ["ABCD", "123"]);
  assert.deepEqual(prepared.map(({ single }) => single), [true, false]);
  assert.deepEqual(prepared[1].answers.map(({ fraction }) => fraction), [50, 50, -25, 0]);
  assert.deepEqual(prepared[0].tags, ["geography", "capitals"]);

  const xml = generateMoodleXml(prepared, settings);
  for (const expected of [
    "$course$/top/UniQuiz Advanced Examples", "<defaultgrade>2</defaultgrade>",
    "<shuffleanswers>0</shuffleanswers>", "<answernumbering>ABCD</answernumbering>",
    '<answer fraction="-25" format="html">', "Budapest is Hungary&apos;s capital.",
    "<correctfeedback format=\"html\"><text>Correct.</text></correctfeedback>",
    "<partiallycorrectfeedback format=\"html\"><text>Select every prime number.</text></partiallycorrectfeedback>",
    "<incorrectfeedback format=\"html\"><text>Review the definition of a prime number.</text></incorrectfeedback>",
    "<tag><text>prime numbers</text></tag>",
  ]) assert.equal(xml.includes(expected), true, expected);
});

test("Advanced CSV shuffle_answers explicitly overrides or falls back to the global setting", () => {
  const cases = [
    { label: "explicit True + global OFF", header: ",shuffle_answers", value: ",True", global: false, expected: true },
    { label: "explicit True + global ON", header: ",shuffle_answers", value: ",True", global: true, expected: true },
    { label: "explicit False + global OFF", header: ",shuffle_answers", value: ",False", global: false, expected: false },
    { label: "explicit False + global ON", header: ",shuffle_answers", value: ",False", global: true, expected: false },
    { label: "blank + global OFF", header: ",shuffle_answers", value: ",", global: false, expected: false },
    { label: "blank + global ON", header: ",shuffle_answers", value: ",", global: true, expected: true },
    { label: "omitted + global OFF", header: "", value: "", global: false, expected: false },
    { label: "omitted + global ON", header: "", value: "", global: true, expected: true },
  ];
  for (const scenario of cases) {
    const csv = [
      `question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction${scenario.header}`,
      `Which option is correct?,Yes,100,No,0${scenario.value}`,
    ].join("\n");
    const parsed = parseCsv(csv);
    const prepared = ready(parsed.questions, { shuffleAnswers: scenario.global });
    assert.equal(prepared[0].shuffleAnswers, scenario.expected, scenario.label);
    const xml = generateMoodleXml(prepared, { ...settings, shuffleAnswers: scenario.global });
    assert.match(xml, new RegExp(`<shuffleanswers>${scenario.expected ? "1" : "0"}<\\/shuffleanswers>`, "u"), scenario.label);
  }
});

test("row metadata overrides UI values while omitted fields retain UI fallbacks", () => {
  const csv = [
    "question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,category,shuffle_answers,answer_numbering",
    "Row overrides?,Yes,100,No,0,CSV Category,false,123",
    "Row falls back?,Yes,100,No,0,,,,",
  ].join("\n");
  const prepared = ready(parseCsv(csv).questions, { category: "UI Category", shuffleAnswers: true, answerNumbering: "ABCD" });
  assert.deepEqual(prepared.map(({ category }) => category), ["CSV Category", "UI Category"]);
  assert.deepEqual(prepared.map(({ shuffleAnswers }) => shuffleAnswers), [false, true]);
  assert.deepEqual(prepared.map(({ answerNumbering }) => answerNumbering), ["123", "ABCD"]);
});

test("advanced fields work in arbitrary order with sparse columns and more than six answers", () => {
  const csv = [
    "answer_7_fraction,tags,answer_2_fraction,question-text,answer_7,answer_1_fraction,answer_2,answer_1,general-feedback",
    '0,"Hungarian;Cyrillic",100,"Melyik válasz: ""Будапешт""?",Unused,0,Будапешт,Bécs,"Visszajelzés, idézőjellel: ""jó""."',
  ].join("\n");
  const parsed = parseCsv(csv);
  assert.equal(validateQuestions(parsed.questions, parsed.fileIssues).errors.length, 0);
  assert.deepEqual(parsed.questions[0].answers.map(({ label }) => label), ["G", "B", "A"]);
  assert.equal(parsed.questions[0].text, 'Melyik válasz: "Будапешт"?');
  assert.equal(parsed.questions[0].generalFeedback, 'Visszajelzés, idézőjellel: "jó".');
});

test("preserves escaped quotes and multiline quoted Advanced CSV feedback", () => {
  const parsed = parseCsv('question_text,answer_1,answer_1_fraction,answer_1_feedback,answer_2,answer_2_fraction\n"Line one\nLine two","Say ""yes""",100,"Feedback, with a comma\nand a second line",No,0');
  assert.equal(validateQuestions(parsed.questions).errors.length, 0);
  assert.equal(parsed.questions[0].text, "Line one\nLine two");
  assert.equal(parsed.questions[0].answers[0].originalText, 'Say "yes"');
  assert.equal(parsed.questions[0].answers[0].feedback, "Feedback, with a comma\nand a second line");
});

test("advanced fraction and metadata validation remains strict", () => {
  const cases = [
    ["question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\nBad total?,A,40,B,40", /current total is 80%/u],
    ["question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\nOut of range?,A,101,B,0", /not a valid answer fraction/u],
    ["question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\nMissing fraction?,A,100,B,", /no explicit fraction/u],
    ["question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,answer_3_feedback\nOrphan?,A,100,B,0,Feedback", /scoring or feedback but has no answer text/u],
    ["question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,correct\nConflicting?,A,100,B,0,A", /both Correct and explicit answer fractions/u],
    ["type,question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\nmatching,Wrong type?,A,100,B,0", /unsupported type/u],
    ["question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,default_mark\nBad mark?,A,100,B,0,0", /default mark must be greater than 0/u],
    ["question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,single\nBad single?,A,50,B,50,true", /marked as single-answer/u],
  ];
  for (const [csv, expected] of cases) {
    const parsed = parseCsv(csv);
    const messages = validateQuestions(parsed.questions, parsed.fileIssues).errors.map(({ message }) => message).join("\n");
    assert.match(messages, expected);
  }
  for (const malformed of ["abc", "50percent", "++"]) {
    const parsed = parseCsv(`question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\nMalformed?,A,${malformed},B,100`);
    assert.match(validateQuestions(parsed.questions).errors.map(({ message }) => message).join("\n"), /not a valid answer fraction/u);
  }
  const decimal = parseCsv("question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,answer_3,answer_3_fraction\nDecimal?,A,33.333,B,66.667,C,0");
  assert.equal(validateQuestions(decimal.questions).errors.length, 0);
});

test("semicolon tags are trimmed, de-duplicated, and XML escaped", () => {
  const parsed = parseCsv('question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction,tags\nTagged?,Yes,100,No,0," Alpha ;alpha; R&D "');
  assert.deepEqual(parsed.questions[0].tags, ["Alpha", "R&D"]);
  const xml = generateMoodleXml(ready(parsed.questions), settings);
  assert.match(xml, /<tag><text>Alpha<\/text><\/tag>/u);
  assert.match(xml, /<tag><text>R&amp;D<\/text><\/tag>/u);
});

test("strips every supported source question numbering style", () => {
  const cases = [
    ["1. First?", "2. Second?", "3. Third?"],
    ["1) First?", "2) Second?", "3) Third?"],
    ["Q1. First?", "q2. Second?", "Q3. Third?"],
    ["Question 1: First?", "question 2: Second?", "Question 3: Third?"],
  ];
  for (const prompts of cases) {
    const csv = `Question,A,B,Correct\n${prompts.map((prompt) => `${prompt},Yes,No,A`).join("\n")}`;
    assert.deepEqual(ready(parseCsv(csv).questions).map(({ text }) => text), ["First?", "Second?", "Third?"]);
  }
});

test("removes independently detected numbering prefixes throughout the shared CSV and TXT export pipeline", () => {
  const prefixed = [
    "1. Dot question?", "2) Parenthesis question?", "Q3. Q-prefix question?", "Question 4: Label question?",
  ];
  const expected = ["Dot question?", "Parenthesis question?", "Q-prefix question?", "Label question?"];
  const csv = parseCsv([
    "Question,A,B,Correct",
    ...prefixed.map((text) => `${text},Yes,No,A`),
  ].join("\n"));
  const txt = parseTxt([
    "1. Dot question?", "A. Yes", "B. No", "ANSWER: A", "",
    "2) Parenthesis question?", "A. Yes", "B. No", "ANSWER: A", "",
    "Q3. Q-prefix question?", "A. Yes", "B. No", "ANSWER: A", "",
    "Question 4: Label question?", "A. Yes", "B. No", "ANSWER: A",
  ].join("\n"));

  for (const parsed of [csv, txt]) {
    const prepared = ready(parsed.questions);
    assert.deepEqual(prepared.map(({ text }) => text), expected);
    assert.deepEqual(prepared.map(({ name }) => name), expected);
    assert.deepEqual(prepared.map(({ sourceIndex }) => sourceIndex), [1, 2, 3, 4]);
    const xml = generateMoodleXml(prepared, settings);
    expected.forEach((text) => assert.equal((xml.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu")) ?? []).length, 2));
    const preserved = ready(parsed.questions, { removeQuestionNumbering: false });
    assert.deepEqual(preserved.map(({ text }) => text), prefixed);
    assert.deepEqual(preserved.map(({ name }) => name), prefixed);
    assert.deepEqual(preserved.map(({ sourceIndex }) => sourceIndex), [1, 2, 3, 4]);
    const preservedXml = generateMoodleXml(preserved, { ...settings, removeQuestionNumbering: false });
    prefixed.forEach((text) => assert.equal((preservedXml.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu")) ?? []).length, 2));
  }
});

test("exact one-question Q1 France regression follows TXT and CSV ON/OFF through prepared text, names, and XML", async () => {
  const { readFile } = await import("node:fs/promises");
  const cases = [
    ["fixtures/v047-q1-france.txt", parseTxt],
    ["fixtures/v047-q1-france.csv", parseCsv],
  ];
  for (const [fixture, parser] of cases) {
    const parsed = parser(await readFile(new URL(fixture, import.meta.url), "utf8"));
    const enabled = ready(parsed.questions, { removeQuestionNumbering: true });
    assert.equal(enabled[0].text, "What is the capital of France?", `${fixture} ON text`);
    assert.equal(enabled[0].name, "What is the capital of France?", `${fixture} ON name`);
    const enabledXml = generateMoodleXml(enabled, settings);
    assert.match(enabledXml, /<name><text>What is the capital of France\?<\/text><\/name>/u, `${fixture} ON XML name`);
    assert.match(enabledXml, /<questiontext format="html"><text>What is the capital of France\?<\/text><\/questiontext>/u,
      `${fixture} ON XML question text`);
    assert.doesNotMatch(enabledXml, /Q1\./u, `${fixture} ON excludes prefix`);

    const disabled = ready(parsed.questions, { removeQuestionNumbering: false });
    assert.equal(disabled[0].text, "Q1. What is the capital of France?", `${fixture} OFF text`);
    assert.equal(disabled[0].name, "Q1. What is the capital of France?", `${fixture} OFF name`);
    const disabledXml = generateMoodleXml(disabled, { ...settings, removeQuestionNumbering: false });
    assert.equal((disabledXml.match(/Q1\. What is the capital of France\?/gu) ?? []).length, 2,
      `${fixture} OFF XML text and name`);
  }
});

test("number removal preserves explicit Advanced CSV names, source identity, and Ready diagnostics", () => {
  const parsed = parseCsv([
    "question_name,question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction",
    "Q1 Internal compliance identifier,Q1. What is GDPR?,Lawful data protection,100,A file format,0",
  ].join("\n"));
  const prepared = ready(parsed.questions);
  const validation = validateQuestions(prepared, parsed.fileIssues);
  assert.equal(prepared[0].text, "What is GDPR?");
  assert.equal(prepared[0].name, "Q1 Internal compliance identifier");
  assert.equal(prepared[0].questionName, "Q1 Internal compliance identifier");
  assert.equal(prepared[0].sourceIndex, 1);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.warnings.length, 0);
  assert.equal(validation.questions[0].status, "ready");
  const xml = generateMoodleXml(prepared, settings);
  assert.match(xml, /<name><text>Q1 Internal compliance identifier<\/text><\/name>/u);
  assert.match(xml, /<questiontext format="html"><text>What is GDPR\?<\/text><\/questiontext>/u);
  assert.doesNotMatch(xml, /<questiontext format="html"><text>Q1\./u);
});

test("strips independently detected mixed, non-consecutive, and single prefixes while preserving numeric content", () => {
  const parsePrompts = (prompts) => ready(parseCsv(`Question,A,B,Correct\n${prompts.map((prompt) => `${prompt},Yes,No,A`).join("\n")}`)
    .questions).map(({ text }) => text);
  const legitimate = [
    "1.5 liters of water is how many milliliters?",
    "3.14 is approximately equal to what?",
    "24 hours equals how many minutes?",
    "2024 was a leap year. True or false?",
    "10 kg equals how many grams?",
    "2FA is used for what?",
    "2-factor authentication is commonly abbreviated as what?",
    "100% means which of the following?",
    "3D printing is primarily associated with which process?",
  ];
  assert.deepEqual(parsePrompts(legitimate), legitimate);
  const broken = ["1. First?", "2. Second?", "4. Fourth?", "5. Fifth?"];
  assert.deepEqual(parsePrompts(broken), ["First?", "Second?", "Fourth?", "Fifth?"]);
  const mixed = ["1. First?", "2) Second?", "3. Third?"];
  assert.deepEqual(parsePrompts(mixed), ["First?", "Second?", "Third?"]);
  assert.deepEqual(parsePrompts(["1. Only?"]), ["Only?"]);
});

test("cleans numbering for explicit, multiple-correct, and structured TXT questions", () => {
  const explicit = parseCsv('Question,Answer A,Answer B,Answer C,Correct\n1. First?,One,Two,Three,A\n2. Second?,One,Two,Three,"A,C"');
  const preparedExplicit = ready(explicit.questions);
  assert.deepEqual(preparedExplicit.map(({ text }) => text), ["First?", "Second?"]);
  assert.deepEqual(explicit.questions[1].correctLabels, ["A", "C"]);
  const xml = generateMoodleXml(preparedExplicit, settings);
  assert.equal((xml.match(/fraction="50"/gu) ?? []).length, 2);
  const txt = parseTxt("1) First?\nA. Yes\nB. No\nANSWER: A\n\n2) Second?\nA. Yes\nB. No\nANSWER: B");
  assert.deepEqual(ready(txt.questions).map(({ text }) => text), ["First?", "Second?"]);
});

test("cleaned Unicode and XML-sensitive text feeds preview names and XML", () => {
  const parsed = parseCsv('Question,A,B,Correct\n"1. Árvíztűrő < kérdés & válasz?",igen,nem,A\n"2. Вопрос > ответ ""idézet"" és aposztróf\'s?",да,нет,B');
  const prepared = ready(parsed.questions);
  assert.deepEqual(prepared.map(({ text }) => text), [
    "Árvíztűrő < kérdés & válasz?", "Вопрос > ответ \"idézet\" és aposztróf's?",
  ]);
  assert.equal(prepared[0].name.startsWith("Árvíztűrő"), true);
  assert.equal(prepared[0].name.startsWith("1."), false);
  const xml = generateMoodleXml(prepared, settings);
  assert.match(xml, /Árvíztűrő &lt; kérdés &amp; válasz\?/u);
  assert.match(xml, /Вопрос &gt; ответ/u);
});

test("shared numbering cleanup is immutable and refuses empty remainders", () => {
  const source = [
    { text: "1. First", marker: 1 }, { text: "2. Second", marker: 2 },
  ];
  const cleaned = cleanSourceQuestionNumbering(source);
  assert.notEqual(cleaned, source);
  assert.deepEqual(cleaned.map(({ text }) => text), ["First", "Second"]);
  assert.deepEqual(source.map(({ text }) => text), ["1. First", "2. Second"]);
  const unsafe = [{ text: "1. " }, { text: "2. Second" }];
  assert.deepEqual(cleanSourceQuestionNumbering(unsafe).map(({ text }) => text), ["1. ", "Second"]);
  assert.deepEqual(cleanSourceQuestionNumbering([
    { text: "51. Fifty-one" }, { text: "52. Fifty-two" }, { text: "53. Fifty-three" },
  ]).map(({ text }) => text), ["Fifty-one", "Fifty-two", "Fifty-three"]);
});

test("number-removal setting accepts consecutive sequences starting at 1, 51, or 101 and preserves them when off", () => {
  const preparePrompts = (prompts, removeQuestionNumbering = true) => {
    const csv = `Question,A,B,Correct\n${prompts.map((prompt) => `${prompt},Yes,No,A`).join("\n")}`;
    return ready(parseCsv(csv).questions, { removeQuestionNumbering }).map(({ text }) => text);
  };
  for (const start of [1, 51, 101]) {
    const prompts = Array.from({ length: start === 51 ? 5 : 3 }, (_, index) => `${start + index}. Question ${index + 1}?`);
    const cleaned = prompts.map((_, index) => `Question ${index + 1}?`);
    assert.deepEqual(preparePrompts(prompts, true), cleaned, `ON from ${start}`);
    assert.deepEqual(preparePrompts(prompts, false), prompts, `OFF from ${start}`);
  }
});

test("arbitrary-start cleanup handles broken, mixed, and single-question inputs without touching numeric content", () => {
  const cleanedTexts = (prompts) => cleanSourceQuestionNumbering(prompts.map((text) => ({ text }))).map(({ text }) => text);
  const broken = ["51. First?", "52. Second?", "54. Fourth?", "55. Fifth?"];
  const mixed = ["51. First?", "52) Second?", "53. Third?"];
  const legitimate = [
    "1.5 litres equals how many millilitres?",
    "2026 was a leap year. Which answer is correct?",
    "10 km equals how many metres?",
    "2-factor authentication is commonly abbreviated as what?",
    "100% means which of the following?",
    "3D printing is primarily associated with which process?",
  ];
  assert.deepEqual(cleanedTexts(broken), ["First?", "Second?", "Fourth?", "Fifth?"]);
  assert.deepEqual(cleanedTexts(mixed), ["First?", "Second?", "Third?"]);
  assert.deepEqual(cleanedTexts(legitimate), legitimate);
  assert.deepEqual(cleanedTexts(["51. Only question?"]), ["Only question?"]);
});

test("exact 51-55 Boolean regression fixture follows removal setting without changing semantics", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const source = await readFile(new URL("fixtures/uniquiz-v042-numbering-regression-51-55.csv", import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), "c7a10594f532fd429352eb3665e2b57fc2f2ea32b6717655265739524ccbad02");
  const parsed = parseCsv(source.toString("utf8"));
  const prefixed = [
    "51. Capital of Hungary is Budapest?",
    "52. Capital of Slovakia is Budapest?",
    "53. The Earth orbits the Sun.",
    "54. 2026 was a leap year.",
    "55. 🦄 is a unicorn emoji.",
  ];
  const cleaned = prefixed.map((text) => text.replace(/^\d+\.\s+/u, ""));
  const enabled = ready(parsed.questions, { removeQuestionNumbering: true });
  const disabled = ready(parsed.questions, { removeQuestionNumbering: false });
  assert.deepEqual(enabled.map(({ text }) => text), cleaned);
  assert.deepEqual(enabled.map(({ name }) => name), cleaned);
  assert.deepEqual(disabled.map(({ text }) => text), prefixed);
  assert.deepEqual(disabled.map(({ name }) => name), prefixed);
  assert.deepEqual(enabled.map(({ correctLabels }) => correctLabels), [["A"], ["B"], ["A"], ["B"], ["A"]]);
  assert.deepEqual(enabled.map(({ answers }) => answers.map(({ originalText }) => originalText)),
    Array.from({ length: 5 }, () => ["true", "false"]));
  const enabledXml = generateMoodleXml(enabled, settings);
  const disabledXml = generateMoodleXml(disabled, { ...settings, removeQuestionNumbering: false });
  cleaned.forEach((text) => assert.match(enabledXml, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")));
  prefixed.forEach((text) => assert.equal(disabledXml.includes(text), true));
  assert.equal((enabledXml.match(/<answer fraction="100"/gu) ?? []).length, 5);
  assert.equal((enabledXml.match(/<answer fraction="0"/gu) ?? []).length, 5);
});

test("number cleanup changes only text and names for explicit, multiple-correct, and structured TXT inputs", () => {
  const explicit = parseCsv('Question,Answer A,Answer B,Answer C,Answer D,Answer E,Answer F,Correct\n51. First?,one,two,three,four,five,six,B\n52. Primes?,2,3,4,5,,,"A,B,D"');
  const explicitPrepared = ready(explicit.questions);
  assert.deepEqual(explicitPrepared.map(({ text }) => text), ["First?", "Primes?"]);
  assert.deepEqual(explicitPrepared[0].answers.map(({ originalText }) => originalText), ["one", "two", "three", "four", "five", "six"]);
  assert.deepEqual(explicitPrepared[1].correctLabels, ["A", "B", "D"]);
  const explicitXml = generateMoodleXml(explicitPrepared, settings);
  assert.equal((explicitXml.match(/fraction="33\.3333333"/gu) ?? []).length, 3);
  assert.match(explicitXml, /<single>false<\/single>/u);

  const txt = parseTxt("51. First?\nA. Yes\nB. No\nANSWER: A\n\n52. Second?\nA. Yes\nB. No\nANSWER: B");
  assert.deepEqual(ready(txt.questions).map(({ text }) => text), ["First?", "Second?"]);
  assert.deepEqual(ready(txt.questions, { removeQuestionNumbering: false }).map(({ text }) => text), ["51. First?", "52. Second?"]);
});

test("all existing answer-numbering values remain independent of question-number removal", () => {
  const parsed = parseCsv("Question,A,B,Correct\n51. First?,Yes,No,A\n52. Second?,Yes,No,B");
  for (const answerNumbering of ["abc", "ABCD", "123", "none"]) {
    for (const removeQuestionNumbering of [true, false]) {
      const scenarioSettings = { ...settings, answerNumbering, removeQuestionNumbering };
      const xml = generateMoodleXml(ready(parsed.questions, scenarioSettings), scenarioSettings);
      assert.match(xml, new RegExp(`<answernumbering>${answerNumbering}<\\/answernumbering>`, "u"));
    }
  }
});

test("passes the supplied numbering stress-test pack file by file without modifying fixtures", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixtureUrl = (name) => new URL(`fixtures/numbering-stress-test-pack/${name}`, import.meta.url);
  const parseFixture = async (name) => {
    const source = await readFile(fixtureUrl(name), "utf8");
    const parsed = name.endsWith(".csv") ? parseCsv(source) : parseTxt(source);
    return { ...parsed, questions: ready(parsed.questions) };
  };
  for (const name of [
    "numbering-dot-mcq.csv",
    "numbering-paren-mcq.csv",
    "numbering-q-mcq.csv",
    "numbering-question-label-mcq.csv",
  ]) {
    const parsed = await parseFixture(name);
    assert.equal(parsed.questions.length, 10, name);
    assert.equal(validateQuestions(parsed.questions, parsed.fileIssues).errors.length, 0, name);
    assert.equal(parsed.questions[0].text, "What is the capital of Hungary?", name);
    assert.equal(parsed.questions[9].text, "Which emoji is a unicorn?", name);
    assert.equal(parsed.questions.some(({ text }) => /^(?:\d+[.)]|q\d+\.|question\s+\d+:)\s/iu.test(text)), false, name);
    assert.deepEqual(parsed.questions[0].answers.map(({ originalText }) => originalText),
      ["Vienna", "Budapest", "Prague", "Warsaw"], name);
    assert.deepEqual(parsed.questions[0].correctLabels, ["B"], name);
  }

  const trueFalse = await parseFixture("numbering-truefalse.csv");
  assert.equal(trueFalse.questions.length, 8);
  assert.equal(trueFalse.questions.reduce((total, question) => total + question.answers.length, 0), 16);
  assert.deepEqual(trueFalse.questions.map(({ text }) => text), [
    "Capital of Hungary is Budapest?",
    "Capital of Slovakia is Budapest?",
    "The Earth orbits the Sun.",
    "Water freezes at 0 °C under standard conditions.",
    "2 + 2 = 5.",
    "Budapest Magyarország fővárosa?",
    "Москва — столица Венгрии?",
    "π is approximately 3.14159.",
  ]);
  assert.deepEqual(trueFalse.questions.map(({ correctLabels }) => correctLabels),
    [["A"], ["B"], ["A"], ["A"], ["B"], ["A"], ["B"], ["A"]]);

  const structuredTxt = await parseFixture("numbering-structured-txt.txt");
  assert.equal(structuredTxt.questions.length, 8);
  assert.equal(structuredTxt.questions[0].text, "What is the capital of Hungary?");
  assert.equal(structuredTxt.questions[7].text, "Which answer contains XML-sensitive literal text?");
  assert.equal(structuredTxt.questions.some(({ text }) => /^\d+\.\s/u.test(text)), false);
  const structuredXml = generateMoodleXml(ready(structuredTxt.questions), settings);
  assert.match(structuredXml, /R&amp;amp;D uses &amp;lt;research&amp;gt; tags/u);

  const preserveCsv = await parseFixture("numbering-preserve-numeric.csv");
  assert.deepEqual(preserveCsv.questions.map(({ text }) => text), [
    "1.5 litres equals how many millilitres?",
    "2026 was a leap year. Which answer is correct?",
    "10 km equals how many metres?",
    "3D printing is primarily associated with which process?",
    "2-factor authentication is commonly abbreviated as what?",
    "100% means which of the following?",
  ]);

  const preserveTxt = await parseFixture("numbering-preserve-txt.txt");
  assert.deepEqual(preserveTxt.questions.map(({ text }) => text), [
    "1.5 litres equals how many millilitres?",
    "2026 was a leap year. Which answer is correct?",
    "10 km equals how many metres?",
    "2-factor authentication is commonly abbreviated as what?",
  ]);

  const broken = await parseFixture("numbering-broken-sequence.csv");
  assert.deepEqual(broken.questions.map(({ text }) => text), [
    "What is the capital of Hungary?",
    "Which planet is known as the Red Planet?",
    "Which value is greater than 10?",
    "Melyik Magyarország fővárosa?",
    "Какая столица Венгрии?",
  ]);
});

test("expands strict boolean CSV shorthand into ordinary multichoice questions", () => {
  for (const [source, expectedCorrect] of [
    ["true", "A"], ["false", "B"], [" TRUE ", "A"], [" False ", "B"],
  ]) {
    const parsed = parseCsv(`question,answer\nStatement?,${source}`);
    assert.equal(parsed.mapping.certain, true);
    assert.deepEqual(parsed.mapping.roles, ["question", "boolean"]);
    assert.deepEqual(parsed.questions[0].answers.map(({ label, originalText }) => [label, originalText]), [
      ["A", "true"], ["B", "false"],
    ]);
    assert.deepEqual(parsed.questions[0].correctLabels, [expectedCorrect]);
    assert.equal(validateQuestions(parsed.questions).errors.length, 0);
  }
  assert.equal(normalizeBooleanValue(" TrUe "), true);
  assert.equal(normalizeBooleanValue(" FaLsE "), false);
});

test("capitalization changes boolean display text without changing correctness", () => {
  const parsed = parseCsv("question,answer\nStatement?,false");
  const lowercase = ready(parsed.questions, { capitalizeAnswers: false });
  const capitalized = ready(parsed.questions, { capitalizeAnswers: true });
  assert.deepEqual(lowercase[0].answers.map(({ transformedText }) => transformedText), ["true", "false"]);
  assert.deepEqual(capitalized[0].answers.map(({ transformedText }) => transformedText), ["True", "False"]);
  assert.deepEqual(lowercase[0].answers.map(({ isCorrect }) => isCorrect), [false, true]);
  assert.deepEqual(capitalized[0].answers.map(({ isCorrect }) => isCorrect), [false, true]);
});

test("explicit answer schemas take precedence over boolean-looking answer text", () => {
  const parsed = parseCsv("Question,Answer A,Answer B,Correct\nChoose?,true,false,B");
  assert.deepEqual(parsed.mapping.roles, ["question", "answer:A", "answer:B", "correct"]);
  assert.equal(parsed.mapping.certain, true);
  assert.equal(parsed.questions[0].booleanShorthand, undefined);
  assert.deepEqual(parsed.questions[0].correctLabels, ["B"]);
  assert.deepEqual(parsed.questions[0].answers.map(({ isCorrect }) => isCorrect), [false, true]);
});

test("rejects unsupported or empty boolean values with a specific blocking error", () => {
  for (const value of ["yes", "no", "1", "0", "maybe"]) {
    const parsed = parseCsv(`question,answer\nStatement?,${value}`);
    const validation = validateQuestions(parsed.questions);
    assert.equal(validation.errors.length, 1);
    assert.equal(validation.errors[0].message, `\`${value}\` is not a supported true/false answer. Use true or false.`);
  }
  const empty = parseCsv("question,answer\nStatement?,");
  assert.deepEqual(validateQuestions(empty.questions).errors.map(({ message }) => message), [
    "The true/false answer is empty. Enter true or false before exporting.",
  ]);
  const missingQuestion = parseCsv("question,answer\n,true");
  assert.match(validateQuestions(missingQuestion.questions).errors[0].message, /no question text/u);
});

test("boolean shorthand preserves Unicode and escapes XML-special question text", () => {
  const source = parseCsv('question,answer\n"東京 & 2 < 3?",true\n"Будапешт > Вена?",false');
  assert.equal(validateQuestions(source.questions).errors.length, 0);
  const xml = generateMoodleXml(ready(source.questions), settings);
  assert.match(xml, /東京 &amp; 2 &lt; 3\?/u);
  assert.match(xml, /Будапешт &gt; Вена\?/u);
  assert.equal((xml.match(/<question type="multichoice">/gu) ?? []).length, 2);
  assert.equal((xml.match(/<single>true<\/single>/gu) ?? []).length, 2);
  assert.equal((xml.match(/<answer fraction="100"/gu) ?? []).length, 2);
  assert.equal((xml.match(/<answer fraction="0"/gu) ?? []).length, 2);
});

test("uses the supplied test-true.csv unchanged as the canonical boolean regression fixture", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixture = await readFile(new URL("fixtures/test-true.csv", import.meta.url), "utf8");
  const parsed = parseCsv(fixture);
  const cleaned = ready(parsed.questions);
  assert.equal(parsed.questions.length, 3);
  assert.deepEqual(cleaned.map(({ text }) => text), [
    "Capital of Hungary is Budapest?",
    "Capital of Slovakia is Budapest?",
    "Capital of Slovania is Bratislava?",
  ]);
  assert.deepEqual(parsed.questions.map(({ correctLabels }) => correctLabels), [["A"], ["B"], ["A"]]);
  assert.equal(validateQuestions(parsed.questions).errors.length, 0);
  for (const capitalizeAnswers of [false, true]) {
    const prepared = ready(parsed.questions, { capitalizeAnswers });
    const xml = generateMoodleXml(prepared, { ...settings, capitalizeAnswers });
    assert.equal((xml.match(/<question type="multichoice">/gu) ?? []).length, 3);
    assert.equal((xml.match(/<answer fraction=/gu) ?? []).length, 6);
    assert.equal((xml.match(/<single>true<\/single>/gu) ?? []).length, 3);
    assert.equal(xml.includes(capitalizeAnswers ? "<text>True</text>" : "<text>true</text>"), true);
  }
});

test("supports mixed single and multiple-answer CSV questions", () => {
  const result = parseCsv('Question,A,B,C,D,Correct\nCapital?,Vienna,Budapest,Prague,Warsaw,B\nPrimes?,2,3,4,6,"A,B"');
  assert.deepEqual(summarizeQuestions(result.questions), { total: 2, single: 1, multiple: 1, other: 0 });
});

test("reports missing and invalid correct answers", () => {
  const missing = parseCsv("Question,A,B,Correct\nCapital?,Vienna,Budapest,");
  assert.match(validateQuestions(missing.questions).errors[0].message, /no positively scored answer/u);
  const invalid = parseCsv("Question,A,B,Correct\nCapital?,Vienna,Budapest,D");
  assert.match(validateQuestions(invalid.questions).errors[0].message, /refers to answer D/u);
});

test("reports missing question text, too few usable answers, and duplicate answer text", () => {
  const missingQuestion = parseCsv("Question,A,B,Correct\n,One,Two,A");
  assert.match(validateQuestions(missingQuestion.questions).errors[0].message, /no question text/u);
  const blankAnswer = parseCsv("Question,A,B,Correct\nPick one?,One,,A");
  assert.equal(validateQuestions(blankAnswer.questions).errors.some(({ message }) => /at least two non-empty answers/u.test(message)), true);
  const duplicate = parseCsv("Question,A,B,Correct\nPick one?,Same,same,A");
  assert.equal(validateQuestions(duplicate.questions).warnings.some(({ message }) => /same text/u.test(message)), true);
});

test("canonical A-F stress fixture supports mixed 2/3/4/5/6-option questions", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixture = await readFile(new URL("fixtures/uniquiz-advanced-settings-stress-test.csv", import.meta.url), "utf8");
  const parsed = parseCsv(fixture);
  const validation = validateQuestions(parsed.questions);
  const optionCounts = new Set(parsed.questions.map((question) => question.answers.length));

  assert.equal(parsed.questions.length, 30);
  assert.deepEqual([...optionCounts].sort((left, right) => left - right), [2, 3, 4, 5, 6]);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.warnings.length, 0);
  assert.equal(parsed.questions.some((question) => question.answers.some((answer) => !answer.originalText)), false);

  const prepared = ready(parsed.questions);
  const xml = generateMoodleXml(prepared, settings);
  assert.equal((xml.match(/<question type="multichoice">/gu) ?? []).length, 30);
  assert.equal((xml.match(/<answer fraction=/gu) ?? []).length,
    parsed.questions.reduce((total, question) => total + question.answers.length, 0));
  assert.doesNotMatch(xml, /<text>\s*<\/text>\s*<feedback/gu);
});

test("rejects a correct-answer reference to an empty mapped CSV slot", () => {
  const parsed = parseCsv("Question,Answer A,Answer B,Answer C,Answer D,Correct\nPick one?,One,Two,,Four,C");
  const validation = validateQuestions(parsed.questions);

  assert.deepEqual(parsed.questions[0].answers.map(({ label }) => label), ["A", "B", "D"]);
  assert.deepEqual(parsed.questions[0].correctLabels, ["C"]);
  assert.equal(parsed.questions[0].answers.some(({ isCorrect }) => isCorrect), false);
  assert.equal(validation.errors.length, 1);
  assert.match(validation.errors[0].message, /refers to answer C, but the available answers are A, B, D/u);
});

test("calculates multiple-answer fractions from non-empty valid choices only", () => {
  const parsed = parseCsv('Question,A,B,C,D,E,F,Correct\nPick two?,One,,Three,Four,,,"A,D"');
  const validation = validateQuestions(parsed.questions);

  assert.equal(validation.errors.length, 0);
  assert.deepEqual(parsed.questions[0].answers.map(({ label }) => label), ["A", "C", "D"]);
  assert.deepEqual(parsed.questions[0].answers.filter(({ isCorrect }) => isCorrect).map(({ label }) => label), ["A", "D"]);
  const xml = generateMoodleXml(ready(parsed.questions), settings);
  assert.equal((xml.match(/<answer fraction="50"/gu) ?? []).length, 2);
  assert.equal((xml.match(/<answer fraction="0"/gu) ?? []).length, 1);
  assert.equal((xml.match(/<answer fraction=/gu) ?? []).length, 3);
});

test("ignores fully blank CSV rows and accepts numeric answer keys", () => {
  const parsed = parseCsv("Prompt,Option 1,Option 2,Key\nPick one?,Wrong,Right,2\n,,,\n");
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].answers[1].isCorrect, true);
});

test("parses TXT answer prefixes A., A), and A:", () => {
  const fixtures = ["A. One\nB. Two", "A) One\nB) Two", "A: One\nB: Two"];
  fixtures.forEach((answers) => {
    const result = parseTxt(`Pick one?\n${answers}\nANSWER: B`);
    assert.equal(result.questions[0].answers.length, 2);
    assert.equal(result.questions[0].answers[1].isCorrect, true);
  });
});

test("parses case-insensitive answer keys, separators, and blank lines", () => {
  for (const key of ["a,b", "A, B", "A;B", "A + B", "A & B"]) {
    const result = parseTxt(`Pick two?\n\nA. One\nB. Two\nC. Three\nanswer: ${key}\n`);
    assert.deepEqual(result.questions[0].correctLabels, ["A", "B"]);
  }
});

test("reports malformed TXT blocks", () => {
  const result = parseTxt("Question without an answer key\nA. One\nB. Two");
  assert.equal(result.fileIssues.some((item) => /missing an ANSWER/u.test(item.message)), true);
  assert.equal(validateQuestions(result.questions, result.fileIssues).errors.length > 0, true);
});

test("round-trips representative Unicode through parser, model, and XML", () => {
  const samples = [
    "Árvíztűrő tükörfúrógép", "Будапешт", "Αθήνα", "القاهرة", "ירושלים",
    "北京", "東京", "서울", "Hà Nội",
  ];
  for (const sample of samples) {
    const parsed = parseCsv(`Question,A,B,Correct\n"${sample}?","${sample}",Other,A`);
    const xml = generateMoodleXml(ready(parsed.questions), settings);
    assert.equal(xml.includes(sample), true, `XML should preserve ${sample}`);
  }
});

test("Unicode-safe names use 50 code points and capitalization is non-destructive", () => {
  const long = "😀".repeat(55);
  assert.equal(Array.from(unicodeExcerpt(long)).length, 50);
  assert.equal(capitalizeFirst("árvíz"), "Árvíz");
  const parsed = parseCsv("Question,A,B,Correct\nCapital?,budapest,vienna,A");
  const capitalized = ready(parsed.questions, { capitalizeAnswers: true });
  assert.equal(capitalized[0].answers[0].transformedText, "Budapest");
  assert.equal(capitalized[0].answers[0].originalText, "budapest");
  const original = ready(parsed.questions, { capitalizeAnswers: false });
  assert.equal(original[0].answers[0].transformedText, "budapest");
});

test("generates Moodle multichoice XML for one, two, and three correct answers", () => {
  const source = parseCsv('Question,A,B,C,D,Correct\nOne?,A,B,C,D,A\nTwo?,A,B,C,D,"A,B"\nThree?,A,B,C,D,"A,B,C"');
  const xml = generateMoodleXml(ready(source.questions), settings);
  assert.equal((xml.match(/<single>true<\/single>/gu) ?? []).length, 1);
  assert.equal((xml.match(/<single>false<\/single>/gu) ?? []).length, 2);
  assert.equal((xml.match(/fraction="50"/gu) ?? []).length, 2);
  assert.equal((xml.match(/fraction="33\.3333333"/gu) ?? []).length, 3);
  assert.equal(formatFraction(3), "33.3333333");
});

test("supports shuffle, answer numbering, empty category, and long question names", () => {
  const parsed = parseCsv(`Question,A,B,Correct\n${"Long question ".repeat(10)},Yes,No,A`);
  const prepared = ready(parsed.questions, { shuffleAnswers: false, answerNumbering: "123" });
  const xml = generateMoodleXml(prepared, { ...settings, shuffleAnswers: false, answerNumbering: "123" });
  assert.match(xml, /<shuffleanswers>0<\/shuffleanswers>/u);
  assert.match(xml, /<answernumbering>123<\/answernumbering>/u);
  assert.equal(xml.includes('question type="category"'), false);
  assert.equal(Array.from(prepared[0].name).length, 50);
});

test("escapes XML-special characters without changing source text", () => {
  const parsed = parseCsv('Question,A,B,Correct\n"2 < 3 & 4 > 1?","Yes & \'sure\'","No <maybe>",A');
  const xml = generateMoodleXml(ready(parsed.questions), settings);
  assert.match(xml, /2 &lt; 3 &amp; 4 &gt; 1\?/u);
  assert.match(xml, /Yes &amp;amp; &apos;sure&apos;/u);
  assert.match(xml, /No &amp;lt;maybe&amp;gt;/u);
  assert.equal(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<quiz>'), true);
  assert.equal(xml.endsWith("</quiz>"), true);
});

test("matches the known-good Moodle multichoice fixture structure", async () => {
  const fixture = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("fixtures/moodle-multichoice.xml", import.meta.url), "utf8"));
  const parsed = parseCsv("Question,A,B,Correct\nCapital?,Vienna,Budapest,B");
  const xml = generateMoodleXml(ready(parsed.questions), settings);
  for (const tag of ["<quiz>", '<question type="multichoice">', "<single>true</single>", "<shuffleanswers>1</shuffleanswers>", "<answernumbering>abc</answernumbering>"]) {
    assert.equal(fixture.includes(tag), true);
    assert.equal(xml.includes(tag), true);
  }
});

test("canonical Moodle fixture exactly matches the independent semantic oracle", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = parseCsv(await readFile(new URL("fixtures/moodle-compatibility.csv", import.meta.url), "utf8"));
  const expected = JSON.parse(await readFile(new URL("fixtures/moodle-compatibility.expected.json", import.meta.url), "utf8"));
  assert.equal(source.questions.length, expected.questionCount);
  assert.equal(validateQuestions(source.questions).errors.length, 0);
  source.questions.forEach((question, index) => {
    const oracle = expected.questions[index];
    assert.equal(question.text, oracle.text, `question ${index + 1} text`);
    assert.deepEqual(question.answers.map(({ originalText }) => originalText), oracle.answers, `question ${index + 1} answers`);
    assert.deepEqual(question.answers.flatMap((answer, answerIndex) => answer.isCorrect ? [answerIndex] : []), oracle.correct,
      `question ${index + 1} correct answers`);
  });
  const prepared = ready(source.questions);
  const xml = generateMoodleXml(prepared, settings);
  assert.equal((xml.match(/<question type="multichoice">/gu) ?? []).length, expected.questionCount);
  assert.equal(xml.includes("\u00c1rv\u00edzt\u0171r\u0151 t\u00fck\u00f6rf\u00far\u00f3g\u00e9p"), true);
  assert.equal(xml.includes("2 &lt; 3 &amp; 4 &gt; 1"), true);
});
