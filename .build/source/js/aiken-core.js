export const AIKEN_SEVERITY = Object.freeze({
  SAFE_FIX: "SAFE_FIX",
  REVIEW: "REVIEW",
  ERROR: "ERROR",
});

export function formatAikenIssueContext(item) {
  const context = [String(item?.code ?? "AIKEN issue")];
  if (Number.isSafeInteger(item?.questionNumber) && item.questionNumber > 0) {
    context.push("Question " + item.questionNumber);
  }
  if (Number.isSafeInteger(item?.line) && item.line > 0) context.push("source line " + item.line);
  return context.join(" · ");
}

function issue(code, severity, questionNumber, line, explanation, originalText = "", proposedText = "", replacement = null) {
  return {
    id: `${code}:${line}:${questionNumber ?? 0}`,
    code,
    severity,
    questionNumber,
    line,
    explanation,
    originalText,
    proposedText,
    replacement,
  };
}

function normalizeNewlines(value) {
  return String(value ?? "").replace(/\r\n?|\u2028|\u2029/gu, "\n");
}

function optionParts(raw) {
  const match = raw.match(/^[ \t]*([A-Za-z])([.)])([ \t]*)(.*?)[ \t]*$/u);
  if (!match) return null;
  return {
    label: match[1], punctuation: match[2], spacing: match[3], text: match[4],
    leading: raw.match(/^[ \t]*/u)?.[0] ?? "",
    trailing: raw.match(/[ \t]+$/u)?.[0] ?? "",
  };
}

function answerParts(raw) {
  const match = raw.match(/^[ \t]*(answer)[ \t]*:[ \t]*(.*?)[ \t]*$/iu);
  if (!match) return null;
  return {
    keyword: match[1], value: match[2],
    leading: raw.match(/^[ \t]*/u)?.[0] ?? "",
    trailing: raw.match(/[ \t]+$/u)?.[0] ?? "",
  };
}

function startsQuestionNumbering(text) {
  const patterns = [
    /^(\d+[.)][ \t]+)(.+)$/u,
    /^(Q\s*\d+[.):]?[ \t]+)(.+)$/iu,
    /^(Question[ \t]+\d+[.:)]?[ \t]+)(.+)$/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { prefix: match[1], text: match[2] };
  }
  return null;
}

function lineRecord(raw, index) {
  return { raw, line: index + 1, index };
}

function parseStructure(text) {
  const normalized = normalizeNewlines(text);
  const hasBom = normalized.startsWith("\uFEFF");
  const clean = hasBom ? normalized.slice(1) : normalized;
  const lines = clean.split("\n").map(lineRecord);
  const questions = [];
  const looseIssues = [];
  let current = null;

  function createCurrent(record = null) {
    return {
      sourceLine: record?.line ?? null,
      questionLines: record ? [record] : [],
      answers: [],
      answerKeys: [],
      structureIssues: [],
    };
  }

  function finish() {
    if (!current) return;
    questions.push(current);
    current = null;
  }

  lines.forEach((record) => {
    const raw = record.raw;
    if (!raw.trim()) return;
    const option = optionParts(raw);
    const answer = answerParts(raw);

    if (option) {
      if (current?.answerKeys.length) finish();
      if (!current) {
        current = createCurrent();
        current.sourceLine = record.line;
        current.structureIssues.push(issue(
          "QUESTION_NOT_STARTED", AIKEN_SEVERITY.ERROR, null, record.line,
          `Line ${record.line}: answer ${option.label.toUpperCase()} appears before any question text.`, raw,
        ));
      }
      current.answers.push({ ...record, ...option, continuationLines: [] });
      return;
    }

    if (answer) {
      if (!current) {
        current = createCurrent();
        current.sourceLine = record.line;
        current.structureIssues.push(issue(
          "QUESTION_NOT_STARTED", AIKEN_SEVERITY.ERROR, null, record.line,
          `Line ${record.line}: an ANSWER line appears before any question text.`, raw,
        ));
      }
      current.answerKeys.push({ ...record, ...answer });
      return;
    }

    if (!current) {
      current = createCurrent(record);
    } else if (current.answerKeys.length) {
      finish();
      current = createCurrent(record);
    } else if (!current.answers.length) {
      current.questionLines.push(record);
    } else {
      current.answers.at(-1).continuationLines.push(record);
    }
  });
  finish();

  if (hasBom) {
    looseIssues.push(issue(
      "UTF8_BOM", AIKEN_SEVERITY.SAFE_FIX, questions.length ? 1 : null, 1,
      "The UTF-8 BOM can be removed safely.", "UTF-8 BOM", "No BOM",
    ));
  }

  let blankRunStart = -1;
  let blankRunLength = 0;
  lines.forEach((record, index) => {
    if (!record.raw.trim()) {
      if (!blankRunLength) blankRunStart = index;
      blankRunLength += 1;
      return;
    }
    if (blankRunLength > 1) {
      looseIssues.push(issue(
        "REPEATED_BLANK_LINES", AIKEN_SEVERITY.SAFE_FIX, null, blankRunStart + 1,
        `Lines ${blankRunStart + 1}-${blankRunStart + blankRunLength}: repeated blank lines can be normalized to one.`,
        `${blankRunLength} blank lines`, "1 blank line",
      ));
    }
    blankRunLength = 0;
  });

  return { normalized, clean, lines, questions, looseIssues };
}

function canonicalOption(answer, punctuation = answer.punctuation) {
  return `${answer.label.toUpperCase()}${punctuation} ${answer.text}`;
}

function canonicalAnswerKey(answerKey) {
  return `ANSWER: ${answerKey.value.trim().toUpperCase()}`;
}

function replacement(startLine, endLine, lines) {
  return { startLine, endLine, lines };
}

export function analyzeAiken(source) {
  const parsed = parseStructure(source);
  const issues = [...parsed.looseIssues];

  if (!parsed.questions.length) {
    issues.push(issue(
      "NO_QUESTIONS", AIKEN_SEVERITY.ERROR, null, 1,
      "No AIKEN questions were detected. Upload or paste at least one complete question.", "", "",
    ));
  }

  parsed.questions.forEach((question, questionIndex) => {
    const number = questionIndex + 1;
    question.number = number;
    question.structureIssues.forEach((item) => {
      item.questionNumber = number;
      item.id = `${item.code}:${item.line}:${number}`;
      issues.push(item);
    });

    if (!question.questionLines.length) {
      issues.push(issue(
        "MISSING_QUESTION", AIKEN_SEVERITY.ERROR, number, question.sourceLine,
        `Question ${number}: question text is missing.`, "", "",
      ));
    } else {
      const first = question.questionLines[0];
      const trimmed = first.raw.trim();
      if (question.questionLines.length > 1) {
        const joined = question.questionLines.map((line) => line.raw.trim()).join(" ");
        issues.push(issue(
          "MULTILINE_QUESTION", AIKEN_SEVERITY.REVIEW, number, first.line,
          `Question ${number}: the question spans ${question.questionLines.length} lines; Moodle AIKEN requires one line. Review the proposed join.`,
          question.questionLines.map((line) => line.raw).join("\n"), joined,
          replacement(first.line, question.questionLines.at(-1).line, [joined]),
        ));
      }
      const numbering = startsQuestionNumbering(trimmed);
      if (numbering) {
        issues.push(issue(
          "QUESTION_NUMBERING", AIKEN_SEVERITY.REVIEW, number, first.line,
          `Question ${number}: a question-number prefix was detected. Remove it only if it is not educational content.`,
          first.raw, numbering.text,
          replacement(first.line, first.line, [numbering.text]),
        ));
      }
      if (/[ \t]+$/u.test(first.raw)) {
        issues.push(issue(
          "TRAILING_WHITESPACE", AIKEN_SEVERITY.SAFE_FIX, number, first.line,
          `Question ${number}: trailing structural whitespace can be removed.`, first.raw, first.raw.trimEnd(),
        ));
      }
    }

    if (question.answers.length < 2) {
      issues.push(issue(
        "TOO_FEW_ANSWERS", AIKEN_SEVERITY.ERROR, number, question.sourceLine,
        `Question ${number}: at least two usable answers are required.`, String(question.answers.length), "2 or more answers",
      ));
    }
    if (question.answers.length > 26) {
      issues.push(issue(
        "TOO_MANY_ANSWERS", AIKEN_SEVERITY.ERROR, number, question.sourceLine,
        `Question ${number}: AIKEN supports at most 26 single-letter answer labels.`, String(question.answers.length), "26 or fewer answers",
      ));
    }

    const labels = question.answers.map((answer) => answer.label.toUpperCase());
    const expectedLabels = question.answers.map((_, index) => String.fromCharCode(65 + index));
    const duplicateLabels = [...new Set(labels.filter((label, index) => labels.indexOf(label) !== index))];
    duplicateLabels.forEach((label) => {
      const answer = question.answers.find((candidate) => candidate.label.toUpperCase() === label);
      issues.push(issue(
        "DUPLICATE_LABEL", AIKEN_SEVERITY.ERROR, number, answer?.line,
        `Question ${number}: answer label ${label} is duplicated.`, label, "",
      ));
    });
    if (!duplicateLabels.length && labels.some((label, index) => label !== expectedLabels[index])) {
      issues.push(issue(
        "LABEL_SEQUENCE", AIKEN_SEVERITY.ERROR, number, question.answers[0]?.line,
        `Question ${number}: answer labels must run consecutively from A; Moodle grades AIKEN answers by position.`,
        labels.join(", "), expectedLabels.join(", "),
      ));
    }

    const punctuationCounts = question.answers.reduce((counts, answer) => {
      counts[answer.punctuation] = (counts[answer.punctuation] ?? 0) + 1;
      return counts;
    }, {});
    const preferredPunctuation = (punctuationCounts[")"] ?? 0) > (punctuationCounts["."] ?? 0) ? ")" : ".";
    const mixedPunctuation = Object.keys(punctuationCounts).length > 1;

    question.answers.forEach((answer) => {
      const label = answer.label.toUpperCase();
      if (!answer.text.trim()) {
        issues.push(issue(
          "EMPTY_ANSWER", AIKEN_SEVERITY.ERROR, number, answer.line,
          `Question ${number}: answer ${label} has no text.`, answer.raw, "",
        ));
      }
      if (answer.continuationLines.length) {
        const allLines = [answer.text, ...answer.continuationLines.map((line) => line.raw.trim())];
        const joinedText = allLines.join(" ").trim();
        const joined = `${label}${answer.punctuation} ${joinedText}`;
        issues.push(issue(
          "MULTILINE_ANSWER", AIKEN_SEVERITY.REVIEW, number, answer.line,
          `Question ${number}: answer ${label} spans multiple lines; Moodle AIKEN requires one line. Review the proposed join.`,
          [answer.raw, ...answer.continuationLines.map((line) => line.raw)].join("\n"), joined,
          replacement(answer.line, answer.continuationLines.at(-1).line, [joined]),
        ));
      }
      if (answer.label !== label) {
        issues.push(issue(
          "LOWERCASE_OPTION_LABEL", AIKEN_SEVERITY.SAFE_FIX, number, answer.line,
          `Question ${number}: answer ${label} uses a lowercase option label.`, answer.raw,
          canonicalOption({ ...answer, label }, mixedPunctuation ? preferredPunctuation : answer.punctuation),
        ));
      }
      if (answer.spacing !== " " || answer.leading || answer.trailing) {
        issues.push(issue(
          "OPTION_WHITESPACE", AIKEN_SEVERITY.SAFE_FIX, number, answer.line,
          `Question ${number}: answer ${label} needs one normal space after ${label}${answer.punctuation}.`, answer.raw,
          canonicalOption(answer, mixedPunctuation ? preferredPunctuation : answer.punctuation),
        ));
      }
      if (mixedPunctuation && answer.punctuation !== preferredPunctuation) {
        issues.push(issue(
          "OPTION_PUNCTUATION", AIKEN_SEVERITY.SAFE_FIX, number, answer.line,
          `Question ${number}: answer ${label} uses inconsistent option punctuation.`, answer.raw,
          canonicalOption(answer, preferredPunctuation),
        ));
      }
    });

    if (!question.answerKeys.length) {
      issues.push(issue(
        "MISSING_ANSWER_KEY", AIKEN_SEVERITY.ERROR, number,
        question.answers.at(-1)?.continuationLines.at(-1)?.line ?? question.answers.at(-1)?.line ?? question.sourceLine,
        `Question ${number}: the ANSWER: line is missing.`, "", "ANSWER: X",
      ));
    } else {
      if (question.answerKeys.length > 1) {
        const values = question.answerKeys.map((key) => key.value.trim()).join(", ");
        issues.push(issue(
          "CONFLICTING_ANSWER_KEYS", AIKEN_SEVERITY.ERROR, number, question.answerKeys[1].line,
          `Question ${number}: multiple ANSWER: lines conflict or duplicate the answer key.`, values, "One ANSWER: line",
        ));
      }
      question.answerKeys.forEach((answerKey) => {
        const rawValue = answerKey.value.trim();
        if (/^[A-Za-z]\s*[,;+&/]\s*[A-Za-z]/u.test(rawValue) || /\b(?:and)\b/iu.test(rawValue)) {
          issues.push(issue(
            "MULTIPLE_CORRECT_UNSUPPORTED", AIKEN_SEVERITY.ERROR, number, answerKey.line,
            `Question ${number}: standard Moodle AIKEN supports exactly one correct answer, not “${rawValue}”.`,
            answerKey.raw, "Use a single answer label or another Moodle format",
          ));
        } else if (!/^[A-Za-z]$/u.test(rawValue)) {
          issues.push(issue(
            "MALFORMED_ANSWER_KEY", AIKEN_SEVERITY.ERROR, number, answerKey.line,
            `Question ${number}: ANSWER must contain exactly one answer letter.`, answerKey.raw, "ANSWER: X",
          ));
        } else {
          const correct = rawValue.toUpperCase();
          if (!labels.includes(correct)) {
            issues.push(issue(
              "ANSWER_NOT_FOUND", AIKEN_SEVERITY.ERROR, number, answerKey.line,
              `Question ${number}: ANSWER references ${correct}, but that answer does not exist.`, answerKey.raw, "",
            ));
          }
          if (answerKey.raw !== `ANSWER: ${correct}`) {
            issues.push(issue(
              "ANSWER_NORMALIZATION", AIKEN_SEVERITY.SAFE_FIX, number, answerKey.line,
              `Question ${number}: normalize the answer key to “ANSWER: ${correct}”.`, answerKey.raw, `ANSWER: ${correct}`,
            ));
          }
        }
      });
    }
  });

  issues.sort((a, b) => (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER)
    || a.severity.localeCompare(b.severity));
  const bySeverity = {
    SAFE_FIX: issues.filter((item) => item.severity === AIKEN_SEVERITY.SAFE_FIX),
    REVIEW: issues.filter((item) => item.severity === AIKEN_SEVERITY.REVIEW),
    ERROR: issues.filter((item) => item.severity === AIKEN_SEVERITY.ERROR),
  };
  const questionIssueSets = parsed.questions.map((question) => issues.filter((item) => item.questionNumber === question.number));
  return {
    source: String(source ?? ""),
    questions: parsed.questions,
    issues,
    bySeverity,
    summary: {
      total: parsed.questions.length,
      valid: questionIssueSets.filter((items) => items.length === 0).length,
      safelyFixable: new Set(bySeverity.SAFE_FIX.map((item) => item.questionNumber).filter(Boolean)).size,
      review: new Set(bySeverity.REVIEW.map((item) => item.questionNumber).filter(Boolean)).size,
      errors: bySeverity.ERROR.length,
    },
    validForDownload: parsed.questions.length > 0 && issues.length === 0,
  };
}

export function applySafeAikenFixes(source) {
  const clean = normalizeNewlines(source).replace(/^\uFEFF/u, "");
  const lines = clean.split("\n");
  const parsed = parseStructure(clean);
  const punctuationByLine = new Map();
  parsed.questions.forEach((question) => {
    const counts = question.answers.reduce((result, answer) => {
      result[answer.punctuation] = (result[answer.punctuation] ?? 0) + 1;
      return result;
    }, {});
    const preferred = (counts[")"] ?? 0) > (counts["."] ?? 0) ? ")" : ".";
    question.answers.forEach((answer) => punctuationByLine.set(answer.line, preferred));
  });

  const fixed = lines.map((raw, index) => {
    const option = optionParts(raw);
    if (option) return canonicalOption(option, punctuationByLine.get(index + 1) ?? option.punctuation);
    const answer = answerParts(raw);
    if (answer && /^[A-Za-z]$/u.test(answer.value.trim())) return canonicalAnswerKey(answer);
    return raw.trimEnd();
  });
  const normalizedBlanks = [];
  fixed.forEach((line) => {
    if (!line.trim() && (!normalizedBlanks.length || !normalizedBlanks.at(-1).trim())) return;
    normalizedBlanks.push(line);
  });
  while (normalizedBlanks.length && !normalizedBlanks.at(-1).trim()) normalizedBlanks.pop();
  return `${normalizedBlanks.join("\n")}\n`;
}

export function applyAikenReviewFix(source, reviewIssue) {
  if (reviewIssue?.severity !== AIKEN_SEVERITY.REVIEW || !reviewIssue.replacement) {
    throw new Error("A review issue with a proposed replacement is required.");
  }
  const lines = normalizeNewlines(source).split("\n");
  const { startLine, endLine, lines: proposedLines } = reviewIssue.replacement;
  lines.splice(startLine - 1, endLine - startLine + 1, ...proposedLines);
  return lines.join("\n");
}

export function createAikenFilename(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `uniquiz-aiken-fixed-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`;
}
