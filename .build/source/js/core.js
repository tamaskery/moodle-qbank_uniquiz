export const ANSWER_NUMBERING = new Set(["none", "abc", "ABCD", "123"]);
export const SUPPORTED_QUESTION_TYPES = new Set([
  "multichoice", "truefalse", "shortanswer", "numerical", "essay", "description",
]);

const CSV_BASE_FIELDS = new Set([
  "type", "category", "question_name", "question_text", "general_feedback", "default_mark",
  "shuffle_answers", "answer_numbering", "single", "correct_feedback", "partially_correct_feedback",
  "incorrect_feedback", "tags", "correct", "boolean_value",
  "case_sensitive",
]);

export const CSV_CANONICAL_HEADERS = Object.freeze([
  "type", "category", "question_name", "question_text", "general_feedback", "default_mark",
  "shuffle_answers", "answer_numbering", "single", "correct_feedback", "partially_correct_feedback",
  "incorrect_feedback",
  ...Array.from({ length: 6 }, (_, index) => [
    `answer_${index + 1}`, `answer_${index + 1}_fraction`, `answer_${index + 1}_tolerance`,
    `answer_${index + 1}_feedback`,
  ]).flat(),
  "case_sensitive", "tags",
]);

export const CSV_HEADER_ALIASES = Object.freeze({
  question: "question_text",
  questiontext: "question_text",
  prompt: "question_text",
  correct_answer: "correct",
  correct_answers: "correct",
  correctanswer: "correct",
  correctanswers: "correct",
  answer_key: "correct",
  answerkey: "correct",
  key: "correct",
  answer: "boolean_value",
  boolean: "boolean_value",
  boolean_answer: "boolean_value",
  booleananswer: "boolean_value",
  truth_value: "boolean_value",
  truthvalue: "boolean_value",
});

export const DIAGNOSTIC_CODES = Object.freeze({
  UNKNOWN_HEADER: "UNKNOWN_HEADER",
  DUPLICATE_HEADER: "DUPLICATE_HEADER",
  INVALID_BOOLEAN_VALUE: "INVALID_BOOLEAN_VALUE",
  INVALID_ANSWER_NUMBERING: "INVALID_ANSWER_NUMBERING",
  ANSWER_DATA_WITHOUT_TEXT: "ANSWER_DATA_WITHOUT_TEXT",
  SCORING_METHOD_CONFLICT: "SCORING_METHOD_CONFLICT",
  MISSING_ANSWER_FRACTION: "MISSING_ANSWER_FRACTION",
  INVALID_NUMERICAL_ANSWER: "INVALID_NUMERICAL_ANSWER",
  INVALID_NUMERICAL_TOLERANCE: "INVALID_NUMERICAL_TOLERANCE",
  UNSUPPORTED_QUESTION_TYPE: "UNSUPPORTED_QUESTION_TYPE",
  QUESTION_TEXT_MISSING: "QUESTION_TEXT_MISSING",
  DUPLICATE_ANSWER_LABEL: "DUPLICATE_ANSWER_LABEL",
  TOO_FEW_ANSWERS: "TOO_FEW_ANSWERS",
  DUPLICATE_ANSWER_TEXT: "DUPLICATE_ANSWER_TEXT",
  INVALID_ANSWER_FRACTION: "INVALID_ANSWER_FRACTION",
  NO_POSITIVE_ANSWER: "NO_POSITIVE_ANSWER",
  POSITIVE_FRACTION_TOTAL_INVALID: "POSITIVE_FRACTION_TOTAL_INVALID",
  SINGLE_MODE_CONFLICT: "SINGLE_MODE_CONFLICT",
  INVALID_DEFAULT_MARK: "INVALID_DEFAULT_MARK",
  CORRECT_ANSWER_REFERENCE_INVALID: "CORRECT_ANSWER_REFERENCE_INVALID",
  DUPLICATE_CORRECT_REFERENCE: "DUPLICATE_CORRECT_REFERENCE",
  TXT_ANSWER_KEY_WITHOUT_QUESTION: "TXT_ANSWER_KEY_WITHOUT_QUESTION",
  TXT_AMBIGUOUS_STRUCTURE: "TXT_AMBIGUOUS_STRUCTURE",
  TXT_ANSWER_KEY_MISSING: "TXT_ANSWER_KEY_MISSING",
  NO_SUPPORTED_QUESTIONS: "NO_SUPPORTED_QUESTIONS",
  CSV_UNEXPECTED_AFTER_QUOTE: "CSV_UNEXPECTED_AFTER_QUOTE",
  CSV_UNCLOSED_QUOTE: "CSV_UNCLOSED_QUOTE",
  NO_USABLE_ROWS: "NO_USABLE_ROWS",
  IMPORT_WARNING: "IMPORT_WARNING",
  IMPORT_ERROR: "IMPORT_ERROR",
  XML_INVALID_CHARACTER: "XML_INVALID_CHARACTER",
  INVALID_TAG: "INVALID_TAG",
  QUESTION_NAME_TOO_LONG: "QUESTION_NAME_TOO_LONG",
});

// With the Unicode flag, the surrogate range matches only unpaired surrogates,
// not valid supplementary characters such as emoji. Never silently drop source data.
const INVALID_XML_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;

function checkXmlSource(value) {
  const text = String(value ?? "");
  const match = INVALID_XML_CHARACTER.exec(text);
  if (match) {
    const codepoint = `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
    const line = text.slice(0, match.index).split(/\r\n|\r|\n/u).length;
    throw inputDiagnosticError(DIAGNOSTIC_CODES.XML_INVALID_CHARACTER, "Unsupported text character",
      `The source contains ${codepoint}, which XML cannot represent. Replace it in the source before continuing.`,
      { line, codepoint });
  }
  return text;
}

function validMoodleTag(value) {
  const text = String(value);
  return Array.from(text).length <= 255 && text === text.replace(/[\p{Cc}<>`]/gu, "").replace(/\s+/gu, " ").trim();
}

export function createDiagnostic({
  code, severity, title, message, sourceIndex = null, scope = "question", field, answerIndex, metadata,
}) {
  const diagnostic = { code, severity, title, message, sourceIndex, scope };
  if (field !== undefined) diagnostic.field = field;
  if (answerIndex !== undefined) diagnostic.answerIndex = answerIndex;
  if (metadata !== undefined) diagnostic.metadata = metadata;
  return diagnostic;
}

function importDiagnostic(code, severity, title, message, context = {}) {
  return createDiagnostic({ code, severity, title, message, scope: "import", ...context });
}

function questionDiagnostic(code, severity, title, message, sourceIndex, context = {}) {
  return createDiagnostic({ code, severity, title, message, sourceIndex, scope: "question", ...context });
}

function inputDiagnosticError(code, title, message, metadata) {
  const error = new Error(message);
  error.name = "InputDiagnosticError";
  error.diagnostic = importDiagnostic(code, "error", title, message, metadata ? { metadata } : {});
  return error;
}

export function getInputDiagnostic(error) {
  const diagnostic = error?.diagnostic;
  return diagnostic?.code && diagnostic?.severity && diagnostic?.title && diagnostic?.message
    ? diagnostic
    : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function formatDiagnostic(diagnostic, { includeTitle = true, includeQuestion = true } = {}) {
  const message = String(diagnostic?.message ?? "Review this issue before exporting.").trim();
  const metadata = diagnostic?.metadata ?? {};
  const context = [];
  const csvRow = positiveInteger(metadata.csvRow);
  const csvColumn = positiveInteger(metadata.csvColumn);
  const line = positiveInteger(metadata.line);
  const question = positiveInteger(diagnostic?.sourceIndex);
  if (csvRow && !message.includes(`CSV row ${csvRow}`)) {
    context.push(`CSV row ${csvRow}${csvColumn ? `, column ${csvColumn}` : ""}`);
  } else if (csvColumn && !message.includes(`column ${csvColumn}`)) {
    context.push(`CSV column ${csvColumn}`);
  }
  if (line && !new RegExp(`\\bLine ${line}\\b`, "u").test(message)) context.push(`Line ${line}`);
  if (includeQuestion && question && !new RegExp(`\\bQuestion ${question}\\b`, "u").test(message)) {
    context.push(`Question ${question}`);
  }
  if (diagnostic?.field) context.push(String(diagnostic.field));
  else if (diagnostic?.answerIndex !== undefined) context.push(`Answer ${diagnostic.answerIndex}`);
  const title = includeTitle ? String(diagnostic?.title ?? "").trim() : "";
  const detail = title && !message.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())
    ? `${title}: ${message}`
    : message;
  return context.length ? `${context.join(" · ")}: ${detail}` : detail;
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function columnLetter(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function answerIndexForHeader(normalizedHeader) {
  let match = normalizedHeader.match(/^answer_(\d+)(?:_(?:fraction|tolerance|feedback))?$/u);
  if (match && Number(match[1]) >= 1) return Number(match[1]);
  match = normalizedHeader.match(/^(?:answer|option)_?([a-z])$/u);
  if (match) return match[1].charCodeAt(0) - 96;
  match = normalizedHeader.match(/^(?:answer|option)_?(\d+)$/u);
  if (match && Number(match[1]) >= 1) return Number(match[1]);
  if (/^[a-z]$/u.test(normalizedHeader)) return normalizedHeader.charCodeAt(0) - 96;
  return null;
}

export function resolveCsvHeader(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  const alias = CSV_HEADER_ALIASES[normalized];
  if (alias) return alias;
  if (CSV_BASE_FIELDS.has(normalized)) return normalized;
  const canonicalAnswer = normalized.match(/^answer_(\d+)(?:_(fraction|tolerance|feedback))?$/u);
  if (canonicalAnswer && Number(canonicalAnswer[1]) >= 1) return normalized;
  const answerIndex = answerIndexForHeader(normalized);
  return answerIndex ? `answer_${answerIndex}` : null;
}

function roleForCsvField(field) {
  if (field === "question_text") return "question";
  if (field === "correct") return "correct";
  if (field === "boolean_value") return "boolean-candidate";
  const answer = field.match(/^answer_(\d+)(?:_(fraction|tolerance|feedback))?$/u);
  if (answer) {
    const label = columnLetter(Number(answer[1]) - 1);
    if (answer[2] === "fraction") return `answer-fraction:${label}`;
    if (answer[2] === "tolerance") return `answer-tolerance:${label}`;
    if (answer[2] === "feedback") return `answer-feedback:${label}`;
    return `answer:${label}`;
  }
  return `field:${field}`;
}

function countDelimiterOutsideQuotes(text, delimiter) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectDelimiter(text) {
  const sample = String(text).split(/\r?\n/u).slice(0, 8).join("\n");
  const delimiters = [",", ";", "\t"];
  return delimiters
    .map((delimiter) => ({ delimiter, count: countDelimiterOutsideQuotes(sample, delimiter) }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  const rowLocations = [];
  let row = [];
  let field = "";
  let quoted = false;
  let justClosedQuote = false;
  let csvRow = 1;
  let recordStartRow = 1;
  let quoteStart = null;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else {
        field += char;
        if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) csvRow += 1;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      justClosedQuote = false;
      quoteStart = { csvRow, csvColumn: row.length + 1 };
    } else if (char === delimiter) {
      row.push(field);
      field = "";
      justClosedQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
        rowLocations.push({ csvRow: recordStartRow });
      }
      row = [];
      field = "";
      justClosedQuote = false;
      quoteStart = null;
      csvRow += 1;
      recordStartRow = csvRow;
    } else if (justClosedQuote && /\s/u.test(char)) {
      // Whitespace between a closing quote and the delimiter is harmless.
    } else if (justClosedQuote) {
      throw inputDiagnosticError(
        DIAGNOSTIC_CODES.CSV_UNEXPECTED_AFTER_QUOTE,
        "Unexpected text after a quoted CSV value",
        "A quoted CSV field contains unexpected text after its closing quote. Remove the extra text or place it inside the quotes.",
        { csvRow, csvColumn: row.length + 1 },
      );
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw inputDiagnosticError(
      DIAGNOSTIC_CODES.CSV_UNCLOSED_QUOTE,
      "Quoted CSV value is not closed",
      "A quoted CSV field is not closed. Add the closing double quote before the end of the file.",
      quoteStart ?? { csvRow, csvColumn: row.length + 1 },
    );
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
    rowLocations.push({ csvRow: recordStartRow });
  }
  if (rows.length === 0) {
    throw inputDiagnosticError(
      DIAGNOSTIC_CODES.NO_USABLE_ROWS,
      "No usable rows",
      "The file does not contain any usable rows. Add a header row and at least one question row.",
    );
  }
  return { rows, delimiter, rowLocations };
}

export function detectCsvMapping(headers, headerLocation = { csvRow: 1 }) {
  const roles = headers.map(() => "ignore");
  const issues = [];
  const fields = headers.map((header) => resolveCsvHeader(header));
  const seenFields = new Set();
  headers.forEach((header, index) => {
    const field = fields[index];
    if (!field) {
      issues.push(importDiagnostic(
        DIAGNOSTIC_CODES.UNKNOWN_HEADER,
        "warning",
        "Unrecognized column ignored",
        `Unrecognized column ignored: \`${String(header).trim()}\`. Review the heading or leave it ignored.`,
        { field: String(header).trim(), metadata: {
          csvRow: headerLocation?.csvRow ?? 1, csvColumn: index + 1, columnIndex: index,
        } },
      ));
      return;
    }
    if (seenFields.has(field)) {
      issues.push(importDiagnostic(
        DIAGNOSTIC_CODES.DUPLICATE_HEADER,
        "error",
        "Duplicate column detected",
        `Duplicate column detected: \`${field}\`. Keep only one column for this field before exporting.`,
        { field, metadata: {
          csvRow: headerLocation?.csvRow ?? 1, csvColumn: index + 1, columnIndex: index,
        } },
      ));
      return;
    }
    seenFields.add(field);
    roles[index] = roleForCsvField(field);
  });

  const answerLabels = new Set(roles.filter((role) => role.startsWith("answer:")).map((role) => role.slice(7)));
  const fractionLabels = new Set(roles.filter((role) => role.startsWith("answer-fraction:"))
    .map((role) => role.slice(16)));
  const booleanCandidates = roles.flatMap((role, index) => role === "boolean-candidate" ? [index] : []);
  let booleanFound = false;
  if (answerLabels.size === 0 && booleanCandidates.length === 1) {
    roles[booleanCandidates[0]] = "boolean";
    booleanFound = true;
  } else {
    booleanCandidates.forEach((index) => { roles[index] = "ignore"; });
  }

  const questionFound = roles.includes("question");
  const typeFound = roles.includes("field:type");
  const correctFound = roles.includes("correct");
  const explicitSchema = correctFound && answerLabels.size >= 2;
  const fractionSchema = fractionLabels.size >= 1 && answerLabels.size >= 2;
  const booleanSchema = booleanFound && answerLabels.size === 0;
  const typedAdvancedSchema = typeFound && questionFound;
  const certain = questionFound && (explicitSchema || fractionSchema || booleanSchema || typedAdvancedSchema);
  const missingRequirements = [];
  if (!questionFound) missingRequirements.push("Question text column not identified");
  if (!booleanSchema && !typedAdvancedSchema && answerLabels.size < 2) {
    missingRequirements.push(answerLabels.size === 0
      ? "Answer columns not identified; add at least two answer columns or one True/False answer column"
      : "At least two answer columns are required");
  }
  if (!booleanSchema && !typedAdvancedSchema && answerLabels.size >= 2 && !correctFound && fractionLabels.size === 0) {
    missingRequirements.push("Correct-answer column not identified; add a correct column or explicit answer fractions");
  }
  return {
    roles,
    fields,
    issues,
    certain,
    missingRequirements,
    schema: booleanSchema ? "boolean" : fractionSchema ? "fraction"
      : explicitSchema ? "basic" : typedAdvancedSchema ? "typed" : "unknown",
    message: certain
      ? "All required columns were recognized."
      : `${missingRequirements.join(". ")}. Rename the column or use manual column mapping.`,
  };
}

export function resolveCsvMappingIssues(issues, roles) {
  return issues.filter((issue) => issue.code !== DIAGNOSTIC_CODES.UNKNOWN_HEADER
    || roles[issue.metadata?.columnIndex] === "ignore");
}

function fieldIndex(roles, field) {
  return roles.indexOf(`field:${field}`);
}

function optionalText(row, index) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function parseNumericalTolerance(value, field, questionNumber, issues) {
  const source = String(value ?? "").trim();
  if (!source) return 0;
  if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(source)) {
    issues.push(questionDiagnostic(
      DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE,
      "error",
      "Invalid numerical tolerance",
      `\`${source}\` is not a valid numerical tolerance. Use zero or a non-negative decimal number.`,
      questionNumber,
      { field, answerIndex: field.match(/^answer_(.+)_tolerance$/u)?.[1], metadata: { rawValue: source } },
    ));
    return Number.NaN;
  }
  const number = Number(source);
  if (!Number.isFinite(number) || number < 0) {
    issues.push(questionDiagnostic(
      DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE,
      "error",
      "Invalid numerical tolerance",
      "Numerical tolerance must be zero or a non-negative decimal number.",
      questionNumber,
      { field, answerIndex: field.match(/^answer_(.+)_tolerance$/u)?.[1], metadata: { rawValue: source } },
    ));
    return Number.NaN;
  }
  return number;
}

function parseOptionalNumber(value, field, questionNumber, issues, { minimum = -Infinity, maximum = Infinity } = {}) {
  const source = String(value ?? "").trim();
  if (!source) return null;
  const isFraction = /^answer_.+_fraction$/u.test(field);
  const code = isFraction ? DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION : DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK;
  const title = isFraction ? "Invalid answer fraction" : "Invalid default mark";
  const answerLabel = isFraction ? field.match(/^answer_(.+)_fraction$/u)?.[1] : undefined;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(source)) {
    issues.push(questionDiagnostic(code, "error", title, isFraction
      ? `\`${source}\` is not a valid answer fraction. Use a number from -100 to 100.`
      : `\`${source}\` is not a valid default mark. Enter a number greater than 0.`, questionNumber,
    { field, answerIndex: answerLabel, metadata: { rawValue: source } }));
    return Number.NaN;
  }
  const number = Number(source);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    issues.push(questionDiagnostic(code, "error", title, isFraction
      ? `\`${source}\` is not a valid answer fraction. Use a number from -100 to 100.`
      : "The default mark must be greater than 0. Enter a positive number before exporting.", questionNumber,
    { field, answerIndex: answerLabel, metadata: { rawValue: source, minimum, maximum } }));
    return Number.NaN;
  }
  return number;
}

function parseOptionalBoolean(value, field, questionNumber, issues) {
  const source = String(value ?? "").trim().toLocaleLowerCase();
  if (!source) return null;
  if (["true", "1"].includes(source)) return true;
  if (["false", "0"].includes(source)) return false;
  issues.push(questionDiagnostic(
    DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
    "error",
    "Invalid true/false value",
    `${field} must be true, false, 1, or 0. Update the value before exporting.`,
    questionNumber,
    { field, metadata: { rawValue: source } },
  ));
  return null;
}

function parseCaseSensitive(value, questionNumber, issues) {
  const source = String(value ?? "").trim().toLocaleLowerCase();
  if (!source) return false;
  if (["true", "1"].includes(source)) return true;
  if (["false", "0"].includes(source)) return false;
  issues.push(questionDiagnostic(
    DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
    "error",
    "Unsupported case-sensitive value",
    "case_sensitive must be true, false, 1, or 0. Update the value before exporting.",
    questionNumber,
    { field: "case_sensitive", metadata: { rawValue: source } },
  ));
  return false;
}

function parseOptionalAnswerNumbering(value, questionNumber, issues) {
  const source = String(value ?? "").trim();
  if (!source) return null;
  const aliases = new Map([
    ["abc", "abc"], ["a,b,c", "abc"], ["ABCD", "ABCD"], ["abcd", "ABCD"], ["A,B,C", "ABCD"],
    ["123", "123"], ["1,2,3", "123"], ["none", "none"], ["no numbering", "none"],
  ]);
  const normalized = aliases.get(source) ?? aliases.get(source.toLocaleLowerCase());
  if (normalized) return normalized;
  issues.push(questionDiagnostic(
    DIAGNOSTIC_CODES.INVALID_ANSWER_NUMBERING,
    "error",
    "Unsupported answer numbering",
    "Answer numbering must be abc, ABCD, 123, or none. Choose one of the supported values.",
    questionNumber,
    { field: "answer_numbering", metadata: { rawValue: source } },
  ));
  return null;
}

function parseTags(value) {
  const seen = new Set();
  return String(value ?? "").split(";").map((tag) => tag.trim()).filter((tag) => {
    const key = tag.normalize("NFKC").toLocaleLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeBooleanValue(value) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

export function normalizeCorrectLabels(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return [];
  return cleaned
    .replace(/\b(?:answers?|options?)\b/giu, "")
    .split(/\s*(?:,|;|\+|&|\/|\band\b)\s*/giu)
    .map((token) => token.replace(/^[\s.():-]+|[\s.():-]+$/gu, "").toUpperCase())
    .filter(Boolean)
    .map((token) => (/^\d+$/u.test(token) ? columnLetter(Number(token) - 1) : token));
}

function makeQuestion(sourceIndex, text, answers, correctLabels = [], metadata = {}) {
  const correct = new Set(correctLabels);
  const explicitScoring = answers.some((answer) => Object.hasOwn(answer, "fraction"));
  const basicPositiveFraction = correct.size ? Number(formatFraction(correct.size)) : 0;
  const normalizedAnswers = answers.map((answer) => {
    const label = answer.label.toUpperCase();
    const fraction = explicitScoring
      ? answer.fraction
      : correct.has(label) ? basicPositiveFraction : 0;
    return {
      label,
      originalText: String(answer.text ?? "").trim(),
      transformedText: String(answer.text ?? "").trim(),
      fraction,
      feedback: String(answer.feedback ?? "").trim(),
      tolerance: answer.tolerance ?? null,
      isCorrect: Number.isFinite(fraction) && fraction > 0,
    };
  });
  const positiveLabels = normalizedAnswers.filter(({ fraction }) => Number.isFinite(fraction) && fraction > 0)
    .map(({ label }) => label);
  return {
    type: String(metadata.type || "multichoice").trim().toLocaleLowerCase(),
    sourceIndex,
    sourceRow: metadata.sourceRow ?? null,
    sourceLine: metadata.sourceLine ?? null,
    questionName: String(metadata.questionName ?? "").trim(),
    name: "",
    text: String(text ?? "").trim(),
    category: String(metadata.category ?? "").trim(),
    defaultMark: metadata.defaultMark ?? null,
    generalFeedback: String(metadata.generalFeedback ?? "").trim(),
    answers: normalizedAnswers,
    correctLabels: explicitScoring ? positiveLabels : [...correct],
    correctFeedback: String(metadata.correctFeedback ?? "").trim(),
    partiallyCorrectFeedback: String(metadata.partiallyCorrectFeedback ?? "").trim(),
    incorrectFeedback: String(metadata.incorrectFeedback ?? "").trim(),
    shuffleAnswers: metadata.shuffleAnswers ?? null,
    answerNumbering: metadata.answerNumbering ?? null,
    single: metadata.single ?? null,
    tags: Array.isArray(metadata.tags) ? [...metadata.tags] : [],
    caseSensitive: metadata.caseSensitive ?? false,
    explicitScoring,
    sourceIssues: Array.isArray(metadata.sourceIssues) ? metadata.sourceIssues : [],
    settings: {},
    validationIssues: [],
  };
}

const SOURCE_QUESTION_NUMBER_PATTERNS = [
  { style: "numeric-dot", expression: /^(\d+)\.\s+(.+)$/su },
  { style: "numeric-parenthesis", expression: /^(\d+)\)\s+(.+)$/su },
  { style: "q-prefix", expression: /^q(\d+)\.\s+(.+)$/isu },
  { style: "question-label", expression: /^question\s+(\d+):\s+(.+)$/isu },
];

export function cleanSourceQuestionNumbering(questions) {
  const detected = questions.map((question) => {
    for (const { style, expression } of SOURCE_QUESTION_NUMBER_PATTERNS) {
      const match = question.text.match(expression);
      if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) >= 1) {
        return { style, number: Number(match[1]), text: match[2].trim() };
      }
    }
    return null;
  });
  if (detected.every((item) => item === null)) return questions;
  return questions.map((question, index) => detected[index]
    ? { ...question, text: detected[index].text }
    : question);
}

export function questionsFromCsvRows(rows, roles, rowLocations = []) {
  if (rows.length < 2) return [];
  const questionIndex = roles.indexOf("question");
  const correctIndex = roles.indexOf("correct");
  const booleanIndex = roles.indexOf("boolean");
  const answerGroups = new Map();
  roles.forEach((role, index) => {
    const match = role.match(/^answer(?:-(fraction|tolerance|feedback))?:(.+)$/u);
    if (!match) return;
    const group = answerGroups.get(match[2]) ?? {
      label: match[2], textIndex: -1, fractionIndex: -1, toleranceIndex: -1, feedbackIndex: -1,
    };
    if (match[1] === "fraction") group.fractionIndex = index;
    else if (match[1] === "tolerance") group.toleranceIndex = index;
    else if (match[1] === "feedback") group.feedbackIndex = index;
    else group.textIndex = index;
    answerGroups.set(match[2], group);
  });
  const answerColumns = [...answerGroups.values()].filter(({ textIndex }) => textIndex >= 0);
  const orphanAnswerMetadataColumns = [...answerGroups.values()].filter(({ textIndex }) => textIndex < 0);

  const booleanShorthand = answerColumns.length === 0 && booleanIndex >= 0;
  const metadataIndexes = Object.fromEntries([
    "type", "category", "question_name", "general_feedback", "default_mark", "shuffle_answers",
    "answer_numbering", "single", "correct_feedback", "partially_correct_feedback", "incorrect_feedback",
    "case_sensitive", "tags",
  ].map((field) => [field, fieldIndex(roles, field)]));

  return rows.slice(1).map((row, index) => {
    const questionNumber = index + 1;
    const sourceRow = rowLocations[index + 1]?.csvRow ?? index + 2;
    const sourceIssues = [];
    const questionType = optionalText(row, metadataIndexes.type).toLocaleLowerCase() || "multichoice";
    orphanAnswerMetadataColumns.forEach(({ label, fractionIndex, toleranceIndex, feedbackIndex }) => {
      if (optionalText(row, fractionIndex) || optionalText(row, toleranceIndex) || optionalText(row, feedbackIndex)) {
        sourceIssues.push(questionDiagnostic(
          DIAGNOSTIC_CODES.ANSWER_DATA_WITHOUT_TEXT,
          "error",
          "Answer data without answer text",
          `Answer ${label} contains scoring or feedback but has no answer text. Add the missing answer or remove its scoring and feedback.`,
          questionNumber,
          { answerIndex: label },
        ));
      }
    });
    if (booleanShorthand) {
      const rawValue = String(row[booleanIndex] ?? "").trim();
      const semanticValue = normalizeBooleanValue(rawValue);
      const question = makeQuestion(
        questionNumber,
        questionIndex >= 0 ? row[questionIndex] : "",
        semanticValue === null ? [] : [
          { label: "A", text: "true" },
          { label: "B", text: "false" },
        ],
        semanticValue === null ? [] : [semanticValue ? "A" : "B"],
        { sourceRow, type: questionType === "truefalse" ? "truefalse" : "multichoice" },
      );
      return {
        ...question,
        booleanShorthand: { rawValue, semanticValue },
      };
    }

    const correctLabels = correctIndex >= 0 ? normalizeCorrectLabels(row[correctIndex]) : [];
    const hasFractionColumns = answerColumns.some(({ fractionIndex }) => fractionIndex >= 0);
    const hasExplicitFractionValues = answerColumns.some(({ fractionIndex }) => optionalText(row, fractionIndex) !== "");
    if (hasExplicitFractionValues && correctLabels.length) {
      sourceIssues.push(questionDiagnostic(
        DIAGNOSTIC_CODES.SCORING_METHOD_CONFLICT,
        "error",
        "Conflicting scoring methods",
        "This question uses both Correct and explicit answer fractions. Keep one scoring method before exporting.",
        questionNumber,
        { field: "correct" },
      ));
    }
    const answers = answerColumns.flatMap(({ label, textIndex, fractionIndex, toleranceIndex, feedbackIndex }) => {
      const text = optionalText(row, textIndex);
      const fractionText = optionalText(row, fractionIndex);
      const toleranceText = optionalText(row, toleranceIndex);
      const feedback = optionalText(row, feedbackIndex);
      if (!text) {
        if (fractionText || toleranceText || feedback) {
          sourceIssues.push(questionDiagnostic(
            DIAGNOSTIC_CODES.ANSWER_DATA_WITHOUT_TEXT,
            "error",
            "Answer data without answer text",
            `Answer ${label} contains scoring or feedback but has no answer text. Add the missing answer or remove its scoring and feedback.`,
            questionNumber,
            { answerIndex: label },
          ));
        }
        return [];
      }
      const answer = { label, text, feedback };
      if (["shortanswer", "numerical"].includes(questionType) && !correctLabels.length) {
        answer.fraction = fractionText
          ? parseOptionalNumber(fractionText, `answer_${label}_fraction`, questionNumber, sourceIssues,
            { minimum: -100, maximum: 100 })
          : 100;
      } else if (hasFractionColumns && !correctLabels.length) {
        if (!fractionText) {
          sourceIssues.push(questionDiagnostic(
            DIAGNOSTIC_CODES.MISSING_ANSWER_FRACTION,
            "error",
            "Answer fraction is missing",
            `Answer ${label} has answer text but no explicit fraction. Add a fraction from -100 to 100.`,
            questionNumber,
            { field: `answer_${label}_fraction`, answerIndex: label },
          ));
          answer.fraction = Number.NaN;
        } else {
          answer.fraction = parseOptionalNumber(fractionText, `answer_${label}_fraction`, questionNumber, sourceIssues,
            { minimum: -100, maximum: 100 });
        }
      }
      if (questionType === "numerical") {
        answer.tolerance = parseNumericalTolerance(toleranceText, `answer_${label}_tolerance`, questionNumber, sourceIssues);
      }
      return [answer];
    });
    const defaultMark = parseOptionalNumber(optionalText(row, metadataIndexes.default_mark), "default_mark", questionNumber,
      sourceIssues);
    const metadata = {
      type: questionType,
      category: optionalText(row, metadataIndexes.category),
      questionName: optionalText(row, metadataIndexes.question_name),
      generalFeedback: optionalText(row, metadataIndexes.general_feedback),
      defaultMark,
      shuffleAnswers: parseOptionalBoolean(optionalText(row, metadataIndexes.shuffle_answers), "shuffle_answers",
        questionNumber, sourceIssues),
      answerNumbering: parseOptionalAnswerNumbering(optionalText(row, metadataIndexes.answer_numbering), questionNumber,
        sourceIssues),
      single: parseOptionalBoolean(optionalText(row, metadataIndexes.single), "single", questionNumber, sourceIssues),
      correctFeedback: optionalText(row, metadataIndexes.correct_feedback),
      partiallyCorrectFeedback: optionalText(row, metadataIndexes.partially_correct_feedback),
      incorrectFeedback: optionalText(row, metadataIndexes.incorrect_feedback),
      caseSensitive: questionType === "shortanswer"
        ? parseCaseSensitive(optionalText(row, metadataIndexes.case_sensitive), questionNumber, sourceIssues)
        : false,
      tags: parseTags(optionalText(row, metadataIndexes.tags)),
      sourceRow,
      sourceIssues,
    };
    return makeQuestion(questionNumber, questionIndex >= 0 ? row[questionIndex] : "", answers,
      hasExplicitFractionValues ? [] : correctLabels, metadata);
  });
}

export function parseCsv(text, rolesOverride = null) {
  const cleanText = checkXmlSource(text).replace(/^\uFEFF/u, "");
  const parsed = parseDelimited(cleanText);
  const width = Math.max(...parsed.rows.map((row) => row.length));
  const headers = parsed.rows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
  const mapping = detectCsvMapping(headers, parsed.rowLocations[0]);
  const roles = rolesOverride ?? mapping.roles;
  return {
    format: "CSV",
    encoding: "UTF-8",
    delimiter: parsed.delimiter,
    headers,
    rows: parsed.rows,
    rowLocations: parsed.rowLocations,
    mapping: { ...mapping, roles },
    questions: questionsFromCsvRows(parsed.rows, roles, parsed.rowLocations),
    fileIssues: rolesOverride ? resolveCsvMappingIssues(mapping.issues, roles) : mapping.issues,
  };
}

export function parseTxt(text) {
  const lines = checkXmlSource(text).replace(/^\uFEFF/u, "").split(/\r\n|\r|\n/u);
  const questions = [];
  const fileIssues = [];
  let promptLines = [];
  let answers = [];
  let sourceLine = 1;

  function reset(nextLine) {
    promptLines = [];
    answers = [];
    sourceLine = nextLine;
  }

  function finish(correctValue, answerLine) {
    const textValue = promptLines.join("\n").trim();
    if (!textValue && answers.length === 0) {
      fileIssues.push(importDiagnostic(
        DIAGNOSTIC_CODES.TXT_ANSWER_KEY_WITHOUT_QUESTION,
        "error",
        "Answer key without a question",
        `Line ${answerLine} has an answer key without a question. Add the question and answers before this key.`,
        { metadata: { line: answerLine } },
      ));
    } else {
      questions.push(makeQuestion(questions.length + 1, textValue, answers, normalizeCorrectLabels(correctValue),
        { sourceLine }));
    }
    reset(answerLine + 1);
  }

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) return;
    const keyMatch = line.match(/^(?:answer|correct\s*answers?|answer\s*key|key)\s*:\s*(.*)$/iu);
    if (keyMatch) {
      finish(keyMatch[1], lineNumber);
      return;
    }
    const answerMatch = line.match(/^([\p{L}\d])\s*[.):]\s*(.*)$/iu);
    if (answerMatch && promptLines.length > 0) {
      answers.push({ label: answerMatch[1].toUpperCase(), text: answerMatch[2] });
      return;
    }
    if (answers.length > 0) {
      fileIssues.push(importDiagnostic(
        DIAGNOSTIC_CODES.TXT_AMBIGUOUS_STRUCTURE,
        "error",
        "Ambiguous TXT structure",
        `Line ${lineNumber} is ambiguous. Add an ANSWER: line before the next question.`,
        { metadata: { line: lineNumber } },
      ));
    }
    if (promptLines.length === 0) sourceLine = lineNumber;
    promptLines.push(line);
  });

  if (promptLines.length || answers.length) {
    fileIssues.push(importDiagnostic(
      DIAGNOSTIC_CODES.TXT_ANSWER_KEY_MISSING,
      "error",
      "Answer key is missing",
      `The question beginning on line ${sourceLine} is missing an ANSWER: line. Add its answer key before exporting.`,
      { metadata: { line: sourceLine } },
    ));
    questions.push(makeQuestion(questions.length + 1, promptLines.join("\n"), answers, [], { sourceLine }));
  }
  if (questions.length === 0 && fileIssues.length === 0) {
    fileIssues.push(importDiagnostic(
      DIAGNOSTIC_CODES.NO_SUPPORTED_QUESTIONS,
      "error",
      "No questions detected",
      "UniQuiz could not identify any supported questions in this input. Check the file structure or try another supported format.",
    ));
  }
  return { format: "TXT", encoding: "UTF-8", questions, fileIssues };
}

export function unicodeExcerpt(text, maximum = 50) {
  const normalized = String(text ?? "").trim().replace(/\s+/gu, " ");
  return Array.from(normalized).slice(0, maximum).join("");
}

export function capitalizeFirst(text, locale) {
  const characters = Array.from(String(text ?? ""));
  if (characters.length === 0) return "";
  return characters[0].toLocaleUpperCase(locale) + characters.slice(1).join("");
}

export function applySettings(questions, settings) {
  const normalizedQuestions = settings.removeQuestionNumbering === false
    ? questions
    : cleanSourceQuestionNumbering(questions);
  return normalizedQuestions.map((question, index) => ({
    ...question,
    name: question.questionName || (settings.generateNames
      ? unicodeExcerpt(question.text, 50) || `Question ${question.sourceIndex ?? index + 1}`
      : `Question ${question.sourceIndex ?? index + 1}`),
    category: question.category || String(settings.category ?? "").trim(),
    defaultMark: question.type === "description" ? 0 : question.defaultMark ?? 1,
    shuffleAnswers: question.shuffleAnswers ?? Boolean(settings.shuffleAnswers),
    answerNumbering: question.answerNumbering ?? settings.answerNumbering,
    single: question.single ?? question.answers.filter(({ fraction }) => Number(fraction) > 0).length === 1,
    settings: {
      ...settings,
      shuffleAnswers: question.shuffleAnswers ?? Boolean(settings.shuffleAnswers),
      answerNumbering: question.answerNumbering ?? settings.answerNumbering,
    },
    answers: question.answers.map((answer) => ({
      ...answer,
      transformedText: settings.capitalizeAnswers && ["multichoice", "truefalse"].includes(question.type)
        ? capitalizeFirst(answer.originalText)
        : answer.originalText,
    })),
  }));
}

function normalizeDiagnostic(value, scope, sourceIndex = null) {
  if (value?.code && value?.title && value?.message) {
    return {
      ...value,
      scope,
      sourceIndex: scope === "question" ? (value.sourceIndex ?? sourceIndex) : null,
    };
  }
  const severity = value?.severity === "warning" ? "warning" : "error";
  return createDiagnostic({
    code: scope === "import"
      ? (severity === "warning" ? DIAGNOSTIC_CODES.IMPORT_WARNING : DIAGNOSTIC_CODES.IMPORT_ERROR)
      : (severity === "warning" ? DIAGNOSTIC_CODES.IMPORT_WARNING : DIAGNOSTIC_CODES.IMPORT_ERROR),
    severity,
    title: severity === "warning" ? "Review recommended" : "Issue requires attention",
    message: String(value?.message ?? "Review this issue before exporting."),
    sourceIndex: scope === "question" ? sourceIndex : null,
    scope,
  });
}

function deduplicateDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const key = [diagnostic.code, diagnostic.severity, diagnostic.sourceIndex, diagnostic.field,
      diagnostic.answerIndex].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function classifyQuestionStatus(diagnostics = []) {
  if (diagnostics.some(({ severity }) => severity === "error")) return "error";
  if (diagnostics.some(({ severity }) => severity === "warning")) return "warning";
  return "ready";
}

function diagnosticNumber(value) {
  return Number(value.toFixed(7)).toString();
}

export function summarizeDiagnostics(questions, importDiagnostics = []) {
  const counts = { ready: 0, warning: 0, error: 0 };
  questions.forEach((question) => {
    const status = question.status ?? classifyQuestionStatus(question.diagnostics ?? question.validationIssues ?? []);
    counts[status] += 1;
  });
  const importErrors = importDiagnostics.filter(({ severity }) => severity === "error");
  const importWarnings = importDiagnostics.filter(({ severity }) => severity === "warning");
  return {
    total: questions.length,
    ready: counts.ready,
    warning: counts.warning,
    error: counts.error,
    importErrorCount: importErrors.length,
    importWarningCount: importWarnings.length,
    canExport: questions.length > 0 && counts.error === 0 && importErrors.length === 0,
  };
}

export function formatReadinessSummary(summary) {
  if (summary.total === 0) {
    return {
      heading: "No questions detected",
      counts: "",
      supporting: "UniQuiz could not identify any supported questions in this input. Check the file structure or try another supported format.",
      status: "Export blocked",
      blocked: true,
    };
  }
  const total = summary.total.toLocaleString("en-US");
  const questionNoun = summary.total === 1 ? "question" : "questions";
  const hasErrors = summary.error > 0 || summary.importErrorCount > 0;
  const hasWarnings = summary.warning > 0 || summary.importWarningCount > 0;
  if (!hasErrors && !hasWarnings) {
    return {
      heading: `${total} ${questionNoun} ready for Moodle`,
      counts: "",
      supporting: "No issues detected.",
      status: "Ready to export",
      blocked: false,
    };
  }
  const warningLabel = summary.warning === 1 ? "with warning" : "with warnings";
  const errorLabel = summary.error === 1 ? "with error" : "with errors";
  const counts = `${summary.ready.toLocaleString("en-US")} ready · ${summary.warning.toLocaleString("en-US")} ${warningLabel} · ${summary.error.toLocaleString("en-US")} ${errorLabel}`;
  if (hasErrors) {
    let supporting;
    if (summary.error === 1) supporting = "1 question contains an error that must be resolved before export.";
    else if (summary.error > 1) supporting = `${summary.error.toLocaleString("en-US")} questions contain errors that must be resolved before export.`;
    else supporting = "Import errors must be resolved before export.";
    return { heading: `${total} ${questionNoun} found`, counts, supporting, status: "Export blocked", blocked: true };
  }
  return {
    heading: `${total} ${questionNoun} found`,
    counts,
    supporting: "Warnings do not prevent export, but reviewing them is recommended.",
    status: "Ready to export with warnings",
    blocked: false,
  };
}

function addQuestionSourceLocation(diagnostic, question) {
  const csvRow = positiveInteger(question.sourceRow);
  const line = positiveInteger(question.sourceLine);
  if (!csvRow && !line) return diagnostic;
  return {
    ...diagnostic,
    metadata: {
      ...(diagnostic.metadata ?? {}),
      ...(csvRow ? { csvRow } : {}),
      ...(line ? { line } : {}),
    },
  };
}

export function validateQuestions(questions, fileIssues = []) {
  const importDiagnostics = fileIssues.map((value) => normalizeDiagnostic(value, "import"));
  const validated = questions.map((question, index) => {
    const number = question.sourceIndex ?? index + 1;
    const own = (question.sourceIssues ?? []).map((value) => normalizeDiagnostic(value, "question", number));
    const textFields = {
      question_text: question.text, question_name: question.questionName, name: question.name,
      category: question.category, general_feedback: question.generalFeedback,
      correct_feedback: question.correctFeedback, partially_correct_feedback: question.partiallyCorrectFeedback,
      incorrect_feedback: question.incorrectFeedback,
    };
    question.answers.forEach((answer, i) => {
      textFields[`answer_${i + 1}`] = answer.transformedText ?? answer.originalText;
      textFields[`answer_${i + 1}_feedback`] = answer.feedback;
    });
    (question.tags ?? []).forEach((tag, i) => { textFields[`tag_${i + 1}`] = tag; });
    for (const [field, value] of Object.entries(textFields)) {
      if (INVALID_XML_CHARACTER.test(String(value ?? ""))) {
        own.push(questionDiagnostic(DIAGNOSTIC_CODES.XML_INVALID_CHARACTER, "error", "Unsupported text character",
          "This field contains a character that XML cannot represent. Correct the source before exporting.", number, { field }));
      }
    }
    if (Array.from(question.questionName || question.name || "").length > 255) {
      own.push(questionDiagnostic(DIAGNOSTIC_CODES.QUESTION_NAME_TOO_LONG, "error", "Question name is too long",
        "Use at most 255 characters for the question name.", number, { field: "question_name" }));
    }
    if ((question.tags ?? []).some((tag) => !validMoodleTag(tag))) {
      own.push(questionDiagnostic(DIAGNOSTIC_CODES.INVALID_TAG, "error", "Tag would be changed by Moodle",
        "Use tags of at most 255 characters, with single spaces and no control characters, angle brackets or backticks.",
        number, { field: "tags" }));
    }
    if (!SUPPORTED_QUESTION_TYPES.has(question.type)) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.UNSUPPORTED_QUESTION_TYPE, "error", "Unsupported question type",
        `This question uses the unsupported type \`${question.type}\`. Use multichoice, truefalse, shortanswer, numerical, essay, or description.`, number,
        { field: "type", metadata: { rawValue: question.type } },
      ));
    }
    if (!question.text.trim()) {
      const missingCopy = question.type === "description"
        ? ["Description content is missing", "This Description has no content. Add question_text before exporting."]
        : question.type === "essay"
          ? ["Essay question text is missing", "This Essay question is missing question text. Add question_text before exporting."]
          : question.type === "shortanswer"
            ? ["Short Answer question text is missing", "This Short Answer question is missing question text. Add question_text before exporting."]
            : question.type === "numerical"
              ? ["Numerical question text is missing", "This Numerical question is missing question text. Add question_text before exporting."]
              : ["Question text is missing", "This question has no question text. Add question text before exporting."];
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.QUESTION_TEXT_MISSING, "error", missingCopy[0],
        missingCopy[1], number, { field: "question_text" },
      ));
    }
    if (["essay", "description"].includes(question.type)) {
      if (question.type === "essay" && question.defaultMark !== null
        && (!Number.isFinite(question.defaultMark) || question.defaultMark <= 0)) {
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK, "error", "Invalid default mark",
          "The default mark must be greater than 0. Enter a positive number before exporting.",
          number, { field: "default_mark", metadata: { rawValue: question.defaultMark } },
        ));
      }
      const diagnostics = deduplicateDiagnostics(own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)));
      const status = classifyQuestionStatus(diagnostics);
      return { ...question, diagnostics, validationIssues: diagnostics, status };
    }
    const invalidBooleanShorthand = question.booleanShorthand?.semanticValue === null;
    if (invalidBooleanShorthand) {
      const found = question.booleanShorthand.rawValue;
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE, "error", "Invalid true/false answer",
        found
          ? `\`${found}\` is not a supported true/false answer. Use true or false.`
          : "The true/false answer is empty. Enter true or false before exporting.",
        number, { field: "boolean_value", metadata: { rawValue: found } },
      ));
      const diagnostics = deduplicateDiagnostics(own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)));
      const status = classifyQuestionStatus(diagnostics);
      return { ...question, diagnostics, validationIssues: diagnostics, status };
    }
    const labels = question.answers.map((answer) => answer.label);
    const duplicateLabels = labels.filter((label, labelIndex) => labels.indexOf(label) !== labelIndex);
    if (duplicateLabels.length) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.DUPLICATE_ANSWER_LABEL, "error", "Duplicate answer label",
        `Answer label ${duplicateLabels[0]} is used more than once. Give each answer a unique label.`, number,
        { answerIndex: duplicateLabels[0] },
      ));
    }
    const usable = question.answers.filter((answer) => answer.originalText.trim());
    if (["multichoice", "truefalse"].includes(question.type) && usable.length < 2) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.TOO_FEW_ANSWERS, "error", "Not enough answers",
        "Multiple-choice questions need at least two non-empty answers.", number, { field: "answers" },
      ));
    }
    const seenTexts = new Map();
    usable.forEach((answer, answerIndex) => {
      const key = answer.originalText.normalize("NFKC").trim().toLocaleLowerCase();
      if (seenTexts.has(key)) {
        const first = seenTexts.get(key);
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_ANSWER_TEXT, "warning", "Duplicate answer text",
          `Answers ${first + 1} and ${answerIndex + 1} contain the same text. The question can still be exported, but you may want to review it.`,
          number, { answerIndex: answerIndex + 1, metadata: { matchingAnswerIndex: first + 1 } },
        ));
      } else seenTexts.set(key, answerIndex);
    });
    if (["shortanswer", "numerical"].includes(question.type)) {
      question.answers.forEach((answer, answerIndex) => {
        if (!Number.isFinite(answer.fraction) || answer.fraction < -100 || answer.fraction > 100) {
          own.push(questionDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION, "error", "Invalid answer fraction",
            `\`${String(answer.fraction)}\` is not a valid answer fraction. Use a number from -100 to 100.`, number,
            { field: `answer_${answer.label}_fraction`, answerIndex: answer.label,
              metadata: { answerPosition: answerIndex + 1, rawValue: answer.fraction } },
          ));
        }
        if (question.type === "numerical") {
          const numericText = answer.originalText.trim();
          if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(numericText) || !Number.isFinite(Number(numericText))) {
            own.push(questionDiagnostic(
              DIAGNOSTIC_CODES.INVALID_NUMERICAL_ANSWER, "error", "Invalid numerical answer",
              `\`${numericText}\` is not a valid number. Enter a finite integer or decimal value.`, number,
              { field: `answer_${answer.label}`, answerIndex: answer.label,
                metadata: { answerPosition: answerIndex + 1, rawValue: numericText } },
            ));
          }
          if (!Number.isFinite(answer.tolerance) || answer.tolerance < 0) {
            own.push(questionDiagnostic(
              DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE, "error", "Invalid numerical tolerance",
              "Numerical tolerance must be zero or a non-negative decimal number.", number,
              { field: `answer_${answer.label}_tolerance`, answerIndex: answer.label,
                metadata: { answerPosition: answerIndex + 1, rawValue: answer.tolerance } },
            ));
          }
        }
      });
      const positiveAnswers = question.answers.filter(({ fraction }) => Number.isFinite(fraction) && fraction > 0);
      if (positiveAnswers.length === 0) {
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.NO_POSITIVE_ANSWER, "error",
          question.type === "shortanswer" ? "No accepted Short Answer" : "No accepted numerical answer",
          question.type === "shortanswer"
            ? "Short Answer question has no accepted answer. Add at least one answer with a positive fraction."
            : "Numerical question has no accepted answer. Add at least one numeric answer with a positive fraction.",
          number, { field: "answers" },
        ));
      }
      if (question.defaultMark !== null
        && (!Number.isFinite(question.defaultMark) || question.defaultMark <= 0)) {
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK, "error", "Invalid default mark",
          "The default mark must be greater than 0. Enter a positive number before exporting.",
          number, { field: "default_mark", metadata: { rawValue: question.defaultMark } },
        ));
      }
      const diagnostics = deduplicateDiagnostics(own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)));
      const status = classifyQuestionStatus(diagnostics);
      return { ...question, diagnostics, validationIssues: diagnostics, status };
    }
    if (question.type === "truefalse") {
      const normalized = usable.map(({ originalText }) => originalText.trim().toLocaleLowerCase()).sort();
      if (usable.length !== 2 || normalized[0] !== "false" || normalized[1] !== "true") {
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.TOO_FEW_ANSWERS, "error", "Invalid True/False answers",
          "Native True/False questions need exactly two answers named true and false.", number, { field: "answers" },
        ));
      }
    }
    question.answers.forEach((answer, answerIndex) => {
      if (!Number.isFinite(answer.fraction) || answer.fraction < -100 || answer.fraction > 100) {
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION, "error", "Invalid answer fraction",
          `\`${String(answer.fraction)}\` is not a valid answer fraction. Use a number from -100 to 100.`, number,
          { field: `answer_${answer.label}_fraction`, answerIndex: answer.label,
            metadata: { answerPosition: answerIndex + 1, rawValue: answer.fraction } },
        ));
      }
    });
    const positiveAnswers = question.answers.filter(({ fraction }) => Number.isFinite(fraction) && fraction > 0);
    const positiveTotal = positiveAnswers.reduce((sum, { fraction }) => sum + fraction, 0);
    if (positiveAnswers.length === 0) {
      if (question.correctLabels.length === 0) {
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.NO_POSITIVE_ANSWER, "error", "No correct answer",
          "This question has no positively scored answer. Mark at least one answer as correct before exporting.",
          number, { field: "correct" },
        ));
      }
    } else if (Math.abs(positiveTotal - 100) > 0.0011) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.POSITIVE_FRACTION_TOTAL_INVALID, "error", "Answer fractions do not total 100%",
        `Positive answer fractions must total 100%. The current total is ${diagnosticNumber(positiveTotal)}%.`,
        number, { field: "answer_fractions", metadata: { positiveTotal } },
      ));
    }
    if (question.single === true && positiveAnswers.length > 1) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.SINGLE_MODE_CONFLICT, "error", "Conflicting answer mode",
        "This question is marked as single-answer but its scoring defines multiple positively scored answers.",
        number, { field: "single", metadata: { positiveAnswerCount: positiveAnswers.length } },
      ));
    }
    if (question.defaultMark !== null
      && (!Number.isFinite(question.defaultMark) || question.defaultMark <= 0)) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK, "error", "Invalid default mark",
        "The default mark must be greater than 0. Enter a positive number before exporting.",
        number, { field: "default_mark", metadata: { rawValue: question.defaultMark } },
      ));
    }
    if (question.answerNumbering !== null && !ANSWER_NUMBERING.has(question.answerNumbering)) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.INVALID_ANSWER_NUMBERING, "error", "Unsupported answer numbering",
        "Answer numbering must be abc, ABCD, 123, or none. Choose one of the supported values.",
        number, { field: "answer_numbering", metadata: { rawValue: question.answerNumbering } },
      ));
    }
    question.correctLabels.forEach((label) => {
      if (!labels.includes(label)) {
        const range = labels.length ? labels.join(", ") : "no answer labels";
        own.push(questionDiagnostic(
          DIAGNOSTIC_CODES.CORRECT_ANSWER_REFERENCE_INVALID, "error", "Correct answer reference is invalid",
          `The correct-answer field refers to answer ${label}, but the available answers are ${range}. Choose a non-empty answer.`,
          number, { field: "correct", answerIndex: label, metadata: { availableLabels: labels } },
        ));
      }
    });
    if (new Set(question.correctLabels).size !== question.correctLabels.length) {
      own.push(questionDiagnostic(
        DIAGNOSTIC_CODES.DUPLICATE_CORRECT_REFERENCE, "error", "Duplicate correct-answer reference",
        "The same correct answer is listed more than once. Keep each correct-answer reference only once.",
        number, { field: "correct" },
      ));
    }
    const diagnostics = deduplicateDiagnostics(own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)));
    const status = classifyQuestionStatus(diagnostics);
    return { ...question, diagnostics, validationIssues: diagnostics, status };
  });
  const questionDiagnostics = validated.flatMap(({ diagnostics }) => diagnostics);
  const issues = [...importDiagnostics, ...questionDiagnostics];
  const readiness = summarizeDiagnostics(validated, importDiagnostics);
  return {
    questions: validated,
    importDiagnostics,
    questionDiagnostics,
    issues,
    errors: issues.filter(({ severity }) => severity === "error"),
    warnings: issues.filter(({ severity }) => severity === "warning"),
    readiness,
    canExport: readiness.canExport,
  };
}

export function summarizeQuestions(questions) {
  const choiceQuestions = questions.filter(({ type }) => ["multichoice", "truefalse"].includes(type));
  const single = choiceQuestions.filter((question) => question.single
    ?? question.answers.filter(({ fraction }) => Number(fraction) > 0).length === 1).length;
  const multiple = choiceQuestions.length - single;
  return { total: questions.length, single, multiple, other: questions.length - choiceQuestions.length };
}

export function escapeXml(value) {
  return checkXmlSource(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

/** Encode plain source text as HTML, then encode that HTML for the XML envelope. */
export function escapeMoodleHtml(value) {
  const html = checkXmlSource(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/\r\n|\r|\n/gu, "<br>");
  return escapeXml(html);
}

export function formatFraction(correctCount) {
  if (!Number.isInteger(correctCount) || correctCount < 1) throw new Error("A question must have a correct answer.");
  return (100 / correctCount).toFixed(7).replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
}

function formatMoodleNumber(value, decimals = 7) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Moodle numeric values must be finite.");
  return number.toFixed(decimals).replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
}

function categoryPath(category) {
  const trimmed = String(category ?? "").trim().replace(/^\$course\$\/top\/?/u, "");
  return trimmed ? `$course$/top/${trimmed}` : "$course$/top";
}

function appendQuestionTags(lines, question) {
  if (!question.tags?.length) return;
  lines.push("    <tags>");
  question.tags.forEach((tag) => lines.push(`      <tag><text>${escapeXml(tag)}</text></tag>`));
  lines.push("    </tags>");
}

export function generateMoodleXml(questions, settings) {
  if (!ANSWER_NUMBERING.has(settings.answerNumbering)) throw new Error("Unsupported answer numbering setting.");
  const validation = validateQuestions(questions);
  if (validation.errors.length) throw new Error(validation.errors[0].message);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<quiz>"];
  let activeCategory = null;
  questions.forEach((question) => {
    const questionCategory = String(question.category || settings.category || "").trim();
    if (questionCategory !== activeCategory) {
      if (questionCategory || activeCategory !== null) {
        lines.push(
          '  <question type="category">',
          `    <category><text>${escapeXml(categoryPath(questionCategory))}</text></category>`,
          "  </question>",
        );
      }
      activeCategory = questionCategory;
    }
    if (["shortanswer", "numerical"].includes(question.type)) {
      lines.push(
        `  <question type="${question.type}">`,
        `    <name><text>${escapeXml(question.name)}</text></name>`,
        `    <questiontext format="html"><text>${escapeMoodleHtml(question.text)}</text></questiontext>`,
        `    <generalfeedback format="html"><text>${escapeMoodleHtml(question.generalFeedback)}</text></generalfeedback>`,
        `    <defaultgrade>${formatMoodleNumber(question.defaultMark ?? 1)}</defaultgrade>`,
        "    <penalty>0.3333333</penalty>",
        "    <hidden>0</hidden>",
        "    <idnumber></idnumber>",
      );
      if (question.type === "shortanswer") lines.push(`    <usecase>${question.caseSensitive ? "1" : "0"}</usecase>`);
      question.answers.forEach((answer) => {
        lines.push(
          `    <answer fraction="${formatMoodleNumber(answer.fraction)}" format="html">`,
          `      <text>${escapeXml(answer.transformedText)}</text>`,
          `      <feedback format="html"><text>${escapeMoodleHtml(answer.feedback)}</text></feedback>`,
        );
        if (question.type === "numerical") {
          lines.push(`      <tolerance>${formatMoodleNumber(answer.tolerance ?? 0)}</tolerance>`);
        }
        lines.push("    </answer>");
      });
      appendQuestionTags(lines, question);
      lines.push("  </question>");
      return;
    }
    if (question.type === "essay") {
      lines.push(
        '  <question type="essay">',
        `    <name><text>${escapeXml(question.name)}</text></name>`,
        `    <questiontext format="html"><text>${escapeMoodleHtml(question.text)}</text></questiontext>`,
        `    <generalfeedback format="html"><text>${escapeMoodleHtml(question.generalFeedback)}</text></generalfeedback>`,
        `    <defaultgrade>${formatMoodleNumber(question.defaultMark ?? 1)}</defaultgrade>`,
        "    <penalty>0</penalty>",
        "    <hidden>0</hidden>",
        "    <idnumber></idnumber>",
        "    <responseformat>editor</responseformat>",
        "    <responserequired>1</responserequired>",
        "    <responsefieldlines>15</responsefieldlines>",
        "    <attachments>0</attachments>",
        "    <attachmentsrequired>0</attachmentsrequired>",
        '    <graderinfo format="html"><text></text></graderinfo>',
        '    <responsetemplate format="html"><text></text></responsetemplate>',
      );
      appendQuestionTags(lines, question);
      lines.push("  </question>");
      return;
    }
    if (question.type === "description") {
      lines.push(
        '  <question type="description">',
        `    <name><text>${escapeXml(question.name)}</text></name>`,
        `    <questiontext format="html"><text>${escapeMoodleHtml(question.text)}</text></questiontext>`,
        `    <generalfeedback format="html"><text>${escapeMoodleHtml(question.generalFeedback)}</text></generalfeedback>`,
        "    <defaultgrade>0</defaultgrade>",
        "    <penalty>0</penalty>",
        "    <hidden>0</hidden>",
        "    <idnumber></idnumber>",
      );
      appendQuestionTags(lines, question);
      lines.push("  </question>");
      return;
    }
    if (question.type === "truefalse") {
      lines.push(
        '  <question type="truefalse">',
        `    <name><text>${escapeXml(question.name)}</text></name>`,
        `    <questiontext format="html"><text>${escapeMoodleHtml(question.text)}</text></questiontext>`,
        `    <generalfeedback format="html"><text>${escapeMoodleHtml(question.generalFeedback)}</text></generalfeedback>`,
        `    <defaultgrade>${formatMoodleNumber(question.defaultMark ?? 1)}</defaultgrade>`,
        "    <penalty>1</penalty>",
        "    <hidden>0</hidden>",
        "    <idnumber></idnumber>",
      );
      ["true", "false"].forEach((value) => {
        const answer = question.answers.find(({ originalText }) => originalText.trim().toLocaleLowerCase() === value);
        lines.push(
          `    <answer fraction="${formatMoodleNumber(answer?.fraction ?? 0)}" format="html">`,
          `      <text>${value}</text>`,
          `      <feedback format="html"><text>${escapeMoodleHtml(answer?.feedback ?? "")}</text></feedback>`,
          "    </answer>",
        );
      });
      appendQuestionTags(lines, question);
      lines.push("  </question>");
      return;
    }
    const questionNumbering = question.answerNumbering ?? settings.answerNumbering;
    const questionShuffle = question.shuffleAnswers ?? Boolean(settings.shuffleAnswers);
    const positiveCount = question.answers.filter(({ fraction }) => Number(fraction) > 0).length;
    const isSingle = question.single ?? positiveCount === 1;
    lines.push(
      '  <question type="multichoice">',
      `    <name><text>${escapeXml(question.name)}</text></name>`,
      `    <questiontext format="html"><text>${escapeMoodleHtml(question.text)}</text></questiontext>`,
      `    <generalfeedback format="html"><text>${escapeMoodleHtml(question.generalFeedback)}</text></generalfeedback>`,
      `    <defaultgrade>${formatMoodleNumber(question.defaultMark ?? 1)}</defaultgrade>`,
      "    <penalty>0.3333333</penalty>",
      "    <hidden>0</hidden>",
      "    <idnumber></idnumber>",
      `    <single>${isSingle ? "true" : "false"}</single>`,
      `    <shuffleanswers>${questionShuffle ? "1" : "0"}</shuffleanswers>`,
      `    <answernumbering>${questionNumbering}</answernumbering>`,
    );
    question.answers.forEach((answer) => {
      lines.push(
        `    <answer fraction="${formatMoodleNumber(answer.fraction)}" format="html">`,
        `      <text>${escapeMoodleHtml(answer.transformedText)}</text>`,
        `      <feedback format="html"><text>${escapeMoodleHtml(answer.feedback)}</text></feedback>`,
        "    </answer>",
      );
    });
    if (question.correctFeedback) {
      lines.push(`    <correctfeedback format="html"><text>${escapeMoodleHtml(question.correctFeedback)}</text></correctfeedback>`);
    }
    if (question.partiallyCorrectFeedback) {
      lines.push(`    <partiallycorrectfeedback format="html"><text>${escapeMoodleHtml(question.partiallyCorrectFeedback)}</text></partiallycorrectfeedback>`);
    }
    if (question.incorrectFeedback) {
      lines.push(`    <incorrectfeedback format="html"><text>${escapeMoodleHtml(question.incorrectFeedback)}</text></incorrectfeedback>`);
    }
    appendQuestionTags(lines, question);
    lines.push("  </question>");
  });
  lines.push("</quiz>");
  return lines.join("\n");
}

export function validateGeneratedXml(xml, Parser = globalThis.DOMParser) {
  const errors = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    errors.push("The XML declaration is missing or is not the first content in the file.");
  }
  if (typeof Parser !== "function") return { valid: false, errors: ["An XML parser is not available in this browser."] };
  const document = new Parser().parseFromString(xml, "application/xml");
  const parseError = document.querySelector("parsererror");
  if (parseError) return { valid: false, errors: ["The generated XML is not well-formed."] };
  if (document.documentElement?.tagName !== "quiz") errors.push("The generated XML does not have a quiz root.");
  const questions = [...document.querySelectorAll('question[type="multichoice"]')];
  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.querySelector("name > text")?.textContent?.trim()) errors.push(`${label} has no name.`);
    if (!question.querySelector("questiontext > text")?.textContent?.trim()) errors.push(`${label} has no question text.`);
    const answers = [...question.querySelectorAll(":scope > answer")];
    if (answers.length < 2) errors.push(`${label} has fewer than two answers.`);
    const fractions = answers.map((answer) => Number(answer.getAttribute("fraction")));
    const positive = fractions.filter((value) => value > 0);
    if (!positive.length || fractions.some((value) => !Number.isFinite(value) || value < -100 || value > 100)) {
      errors.push(`${label} has invalid grading fractions.`);
    }
    const total = positive.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 0.0011) errors.push(`${label} grading totals ${total}, not 100.`);
    const single = question.querySelector(":scope > single")?.textContent === "true";
    if (single && positive.length !== 1) errors.push(`${label} has an inconsistent single-answer setting.`);
    const numbering = question.querySelector(":scope > answernumbering")?.textContent;
    if (!ANSWER_NUMBERING.has(numbering)) errors.push(`${label} has unsupported answer numbering.`);
    const defaultGrade = Number(question.querySelector(":scope > defaultgrade")?.textContent);
    if (!Number.isFinite(defaultGrade) || defaultGrade <= 0) errors.push(`${label} has an invalid default grade.`);
  });
  const additionalQuestions = [...document.querySelectorAll(
    'question[type="truefalse"], question[type="shortanswer"], question[type="numerical"], question[type="essay"], question[type="description"]',
  )];
  additionalQuestions.forEach((question, index) => {
    const type = question.getAttribute("type");
    const label = `Question ${questions.length + index + 1}`;
    if (!question.querySelector("name > text")?.textContent?.trim()) errors.push(`${label} has no name.`);
    if (!question.querySelector("questiontext > text")?.textContent?.trim()) errors.push(`${label} has no question text.`);
    const defaultGrade = Number(question.querySelector(":scope > defaultgrade")?.textContent);
    if (type === "description") {
      if (defaultGrade !== 0) errors.push(`${label} description has a non-zero default grade.`);
    } else if (!Number.isFinite(defaultGrade) || defaultGrade <= 0) {
      errors.push(`${label} has an invalid default grade.`);
    }
    const answers = [...question.querySelectorAll(":scope > answer")];
    if (["shortanswer", "numerical"].includes(type)) {
      if (answers.length < 1) errors.push(`${label} has no accepted answers.`);
      const fractions = answers.map((answer) => Number(answer.getAttribute("fraction")));
      if (!fractions.some((value) => value > 0)
        || fractions.some((value) => !Number.isFinite(value) || value < -100 || value > 100)) {
        errors.push(`${label} has invalid grading fractions.`);
      }
    }
    if (type === "shortanswer" && !["0", "1"].includes(question.querySelector(":scope > usecase")?.textContent)) {
      errors.push(`${label} has an invalid case-sensitivity setting.`);
    }
    if (type === "numerical") {
      answers.forEach((answer) => {
        const numericAnswer = Number(answer.querySelector(":scope > text")?.textContent);
        const tolerance = Number(answer.querySelector(":scope > tolerance")?.textContent);
        if (!Number.isFinite(numericAnswer)) errors.push(`${label} has an invalid numerical answer.`);
        if (!Number.isFinite(tolerance) || tolerance < 0) errors.push(`${label} has an invalid numerical tolerance.`);
      });
    }
    if (type === "truefalse") {
      const values = answers.map((answer) => answer.querySelector(":scope > text")?.textContent?.trim()).sort();
      const fractions = answers.map((answer) => Number(answer.getAttribute("fraction")));
      if (answers.length !== 2 || values[0] !== "false" || values[1] !== "true"
        || fractions.filter((value) => value > 0).length !== 1) {
        errors.push(`${label} has invalid True/False answers.`);
      }
    }
    if (["essay", "description"].includes(type) && answers.length > 0) {
      errors.push(`${label} should not contain automatically graded answers.`);
    }
  });
  const questionCount = questions.length + additionalQuestions.length;
  if (questionCount === 0) errors.push("The XML contains no supported questions.");
  return { valid: errors.length === 0, errors, questionCount };
}

export function createDownloadFilename(now = new Date()) {
  const pad = (number) => String(number).padStart(2, "0");
  return `uniquiz-questions-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.xml`;
}
