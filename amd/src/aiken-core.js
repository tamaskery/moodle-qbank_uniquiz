/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
import {string as uiString} from "qbank_uniquiz/i18n";
export const AIKEN_SEVERITY = Object.freeze({
    ["SAFE_FIX"]: "SAFE_FIX",
    REVIEW: "REVIEW",
    ERROR: "ERROR",
});
/**
 *
 * @param {*} item
 */
export function formatAikenIssueContext(item) {
    const context = [String(item?.code ?? uiString("js_aiken_core_aiken_issue"))];
    if (Number.isSafeInteger(item?.questionNumber) && item.questionNumber > 0) {
        context.push(uiString("js_aiken_core_question") + item.questionNumber);
    }
    if (Number.isSafeInteger(item?.line) && item.line > 0) {
        context.push(uiString("js_aiken_core_source_line") + item.line);
    }
    return context.join(" · ");
}
/**
 *
 * @param {*} code
 * @param {*} severity
 * @param {*} questionNumber
 * @param {*} line
 * @param {*} explanation
 * @param {*} originalText
 * @param {*} proposedText
 * @param {*} replacement
 */
function issue(
    code,
    severity,
    questionNumber,
    line,
    explanation,
    originalText = "",
    proposedText = "",
    replacement = null,
) {
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
/**
 *
 * @param {*} value
 */
function normalizeNewlines(value) {
    return String(value ?? "").replace(/\r\n?|\u2028|\u2029/gu, "\n");
}
/**
 *
 * @param {*} raw
 */
function optionParts(raw) {
    const match = raw.match(/^[ \t]*([A-Za-z])([.)])([ \t]*)(.*?)[ \t]*$/u);
    if (!match) {
        return null;
    }
    return {
        label: match[1],
        punctuation: match[2],
        spacing: match[3],
        text: match[4],
        leading: raw.match(/^[ \t]*/u)?.[0] ?? "",
        trailing: raw.match(/[ \t]+$/u)?.[0] ?? "",
    };
}
/**
 *
 * @param {*} raw
 */
function answerParts(raw) {
    const match = raw.match(/^[ \t]*(answer)[ \t]*:[ \t]*(.*?)[ \t]*$/iu);
    if (!match) {
        return null;
    }
    return {
        keyword: match[1],
        value: match[2],
        leading: raw.match(/^[ \t]*/u)?.[0] ?? "",
        trailing: raw.match(/[ \t]+$/u)?.[0] ?? "",
    };
}
/**
 *
 * @param {*} text
 */
function startsQuestionNumbering(text) {
    const patterns = [
        /^(\d+[.)][ \t]+)(.+)$/u,
        /^(Q\s*\d+[.):]?[ \t]+)(.+)$/iu,
        /^(Question[ \t]+\d+[.:)]?[ \t]+)(.+)$/iu,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return {
                prefix: match[1],
                text: match[2],
            };
        }
    }
    return null;
}
/**
 *
 * @param {*} raw
 * @param {*} index
 */
function lineRecord(raw, index) {
    return {
        raw,
        line: index + 1,
        index,
    };
}
/**
 *
 * @param {*} text
 */
function parseStructure(text) {
    const normalized = normalizeNewlines(text);
    const hasBom = normalized.startsWith("\uFEFF");
    const clean = hasBom ? normalized.slice(1) : normalized;
    const lines = clean.split("\n").map(lineRecord);
    const questions = [];
    const looseIssues = [];
    let current = null;
    /**
     *
     * @param {*} record
     */
    function createCurrent(record = null) {
        return {
            sourceLine: record?.line ?? null,
            questionLines: record ? [record] : [],
            answers: [],
            answerKeys: [],
            structureIssues: [],
        };
    }
    /**
     *
     */
    function finish() {
        if (!current) {
            return;
        }
        questions.push(current);
        current = null;
    }
    lines.forEach((record) => {
        const raw = record.raw;
        if (!raw.trim()) {
            return;
        }
        const option = optionParts(raw);
        const answer = answerParts(raw);
        if (option) {
            if (current?.answerKeys.length) {
                finish();
            }
            if (!current) {
                current = createCurrent();
                current.sourceLine = record.line;
                current.structureIssues.push(
                    issue(
                        "QUESTION_NOT_STARTED",
                        AIKEN_SEVERITY.ERROR,
                        null,
                        record.line,
                        uiString("js_aiken_core_line_answer_appears_before_any_question_text", {
                            p0: record.line,
                            p1: option.label.toUpperCase(),
                        }),
                        raw,
                    ),
                );
            }
            current.answers.push({
                ...record,
                ...option,
                continuationLines: [],
            });
            return;
        }
        if (answer) {
            if (!current) {
                current = createCurrent();
                current.sourceLine = record.line;
                current.structureIssues.push(
                    issue(
                        "QUESTION_NOT_STARTED",
                        AIKEN_SEVERITY.ERROR,
                        null,
                        record.line,
                        uiString("js_aiken_core_line_an_answer_line_appears_before_any_question_", {
                            p0: record.line,
                        }),
                        raw,
                    ),
                );
            }
            current.answerKeys.push({
                ...record,
                ...answer,
            });
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
        looseIssues.push(
            issue(
                "UTF8_BOM",
                AIKEN_SEVERITY.SAFE_FIX,
                questions.length ? 1 : null,
                1,
                uiString("js_aiken_core_the_utf_8_bom_can_be_removed_safely"),
                uiString("js_aiken_core_utf_8_bom"),
                uiString("js_aiken_core_no_bom"),
            ),
        );
    }
    let blankRunStart = -1;
    let blankRunLength = 0;
    lines.forEach((record, index) => {
        if (!record.raw.trim()) {
            if (!blankRunLength) {
                blankRunStart = index;
            }
            blankRunLength += 1;
            return;
        }
        if (blankRunLength > 1) {
            looseIssues.push(
                issue(
                    "REPEATED_BLANK_LINES",
                    AIKEN_SEVERITY.SAFE_FIX,
                    null,
                    blankRunStart + 1,
                    uiString("js_aiken_core_lines_repeated_blank_lines_can_be_normalized_to_", {
                        p0: blankRunStart + 1,
                        p1: blankRunStart + blankRunLength,
                    }),
                    uiString("js_aiken_core_blank_lines", {
                        p0: blankRunLength,
                    }),
                    uiString("js_aiken_core_1_blank_line"),
                ),
            );
        }
        blankRunLength = 0;
    });
    return {
        normalized,
        clean,
        lines,
        questions,
        looseIssues,
    };
}
/**
 *
 * @param {*} answer
 * @param {*} punctuation
 */
function canonicalOption(answer, punctuation = answer.punctuation) {
    return `${answer.label.toUpperCase()}${punctuation} ${answer.text}`;
}
/**
 *
 * @param {*} answerKey
 */
function canonicalAnswerKey(answerKey) {
    return `ANSWER: ${answerKey.value.trim().toUpperCase()}`;
}
/**
 *
 * @param {*} startLine
 * @param {*} endLine
 * @param {*} lines
 */
function replacement(startLine, endLine, lines) {
    return {
        startLine,
        endLine,
        lines,
    };
}
/**
 *
 * @param {*} source
 */
export function analyzeAiken(source) {
    const parsed = parseStructure(source);
    const issues = [...parsed.looseIssues];
    if (!parsed.questions.length) {
        issues.push(
            issue(
                "NO_QUESTIONS",
                AIKEN_SEVERITY.ERROR,
                null,
                1,
                uiString("js_aiken_core_no_aiken_questions_were_detected_upload_or_paste"),
                "",
                "",
            ),
        );
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
            issues.push(
                issue(
                    "MISSING_QUESTION",
                    AIKEN_SEVERITY.ERROR,
                    number,
                    question.sourceLine,
                    uiString("js_aiken_core_question_question_text_is_missing", {
                        p0: number,
                    }),
                    "",
                    "",
                ),
            );
        } else {
            const first = question.questionLines[0];
            const trimmed = first.raw.trim();
            if (question.questionLines.length > 1) {
                const joined = question.questionLines.map((line) => line.raw.trim()).join(" ");
                issues.push(
                    issue(
                        "MULTILINE_QUESTION",
                        AIKEN_SEVERITY.REVIEW,
                        number,
                        first.line,
                        uiString("js_aiken_core_question_the_question_spans_lines_moodle_aiken_r", {
                            p0: number,
                            p1: question.questionLines.length,
                        }),
                        question.questionLines.map((line) => line.raw).join("\n"),
                        joined,
                        replacement(first.line, question.questionLines.at(-1).line, [joined]),
                    ),
                );
            }
            const numbering = startsQuestionNumbering(trimmed);
            if (numbering) {
                issues.push(
                    issue(
                        "QUESTION_NUMBERING",
                        AIKEN_SEVERITY.REVIEW,
                        number,
                        first.line,
                        uiString("js_aiken_core_question_a_question_number_prefix_was_detected_r", {
                            p0: number,
                        }),
                        first.raw,
                        numbering.text,
                        replacement(first.line, first.line, [numbering.text]),
                    ),
                );
            }
            if (/[ \t]+$/u.test(first.raw)) {
                issues.push(
                    issue(
                        "TRAILING_WHITESPACE",
                        AIKEN_SEVERITY.SAFE_FIX,
                        number,
                        first.line,
                        uiString("js_aiken_core_question_trailing_structural_whitespace_can_be_r", {
                            p0: number,
                        }),
                        first.raw,
                        first.raw.trimEnd(),
                    ),
                );
            }
        }
        if (question.answers.length < 2) {
            issues.push(
                issue(
                    "TOO_FEW_ANSWERS",
                    AIKEN_SEVERITY.ERROR,
                    number,
                    question.sourceLine,
                    uiString("js_aiken_core_question_at_least_two_usable_answers_are_require", {
                        p0: number,
                    }),
                    String(question.answers.length),
                    uiString("js_aiken_core_2_or_more_answers"),
                ),
            );
        }
        if (question.answers.length > 26) {
            issues.push(
                issue(
                    "TOO_MANY_ANSWERS",
                    AIKEN_SEVERITY.ERROR,
                    number,
                    question.sourceLine,
                    uiString("js_aiken_core_question_aiken_supports_at_most_26_single_letter", {
                        p0: number,
                    }),
                    String(question.answers.length),
                    uiString("js_aiken_core_26_or_fewer_answers"),
                ),
            );
        }
        const labels = question.answers.map((answer) => answer.label.toUpperCase());
        const expectedLabels = question.answers.map((_, index) => String.fromCharCode(65 + index));
        const duplicateLabels = [
            ...new Set(labels.filter((label, index) => labels.indexOf(label) !== index)),
        ];
        duplicateLabels.forEach((label) => {
            const answer = question.answers.find((candidate) => candidate.label.toUpperCase() === label);
            issues.push(
                issue(
                    "DUPLICATE_LABEL",
                    AIKEN_SEVERITY.ERROR,
                    number,
                    answer?.line,
                    uiString("js_aiken_core_question_answer_label_is_duplicated", {
                        p0: number,
                        p1: label,
                    }),
                    label,
                    "",
                ),
            );
        });
        if (!duplicateLabels.length && labels.some((label, index) => label !== expectedLabels[index])) {
            issues.push(
                issue(
                    "LABEL_SEQUENCE",
                    AIKEN_SEVERITY.ERROR,
                    number,
                    question.answers[0]?.line,
                    uiString("js_aiken_core_question_answer_labels_must_run_consecutively_fr", {
                        p0: number,
                    }),
                    labels.join(", "),
                    expectedLabels.join(", "),
                ),
            );
        }
        const punctuationCounts = question.answers.reduce((counts, answer) => {
            counts[answer.punctuation] = (counts[answer.punctuation] ?? 0) + 1;
            return counts;
        }, {});
        const preferredPunctuation =
            (punctuationCounts[")"] ?? 0) > (punctuationCounts["."] ?? 0) ? ")" : ".";
        const mixedPunctuation = Object.keys(punctuationCounts).length > 1;
        question.answers.forEach((answer) => {
            const label = answer.label.toUpperCase();
            if (!answer.text.trim()) {
                issues.push(
                    issue(
                        "EMPTY_ANSWER",
                        AIKEN_SEVERITY.ERROR,
                        number,
                        answer.line,
                        uiString("js_aiken_core_question_answer_has_no_text", {
                            p0: number,
                            p1: label,
                        }),
                        answer.raw,
                        "",
                    ),
                );
            }
            if (answer.continuationLines.length) {
                const allLines = [answer.text, ...answer.continuationLines.map((line) => line.raw.trim())];
                const joinedText = allLines.join(" ").trim();
                const joined = `${label}${answer.punctuation} ${joinedText}`;
                issues.push(
                    issue(
                        "MULTILINE_ANSWER",
                        AIKEN_SEVERITY.REVIEW,
                        number,
                        answer.line,
                        uiString("js_aiken_core_question_answer_spans_multiple_lines_moodle_aike", {
                            p0: number,
                            p1: label,
                        }),
                        [answer.raw, ...answer.continuationLines.map((line) => line.raw)].join("\n"),
                        joined,
                        replacement(answer.line, answer.continuationLines.at(-1).line, [joined]),
                    ),
                );
            }
            if (answer.label !== label) {
                issues.push(
                    issue(
                        "LOWERCASE_OPTION_LABEL",
                        AIKEN_SEVERITY.SAFE_FIX,
                        number,
                        answer.line,
                        uiString("js_aiken_core_question_answer_uses_a_lowercase_option_label", {
                            p0: number,
                            p1: label,
                        }),
                        answer.raw,
                        canonicalOption(
                            {
                                ...answer,
                                label,
                            },
                            mixedPunctuation ? preferredPunctuation : answer.punctuation,
                        ),
                    ),
                );
            }
            if (answer.spacing !== " " || answer.leading || answer.trailing) {
                issues.push(
                    issue(
                        "OPTION_WHITESPACE",
                        AIKEN_SEVERITY.SAFE_FIX,
                        number,
                        answer.line,
                        uiString("js_aiken_core_question_answer_needs_one_normal_space_after", {
                            p0: number,
                            p1: label,
                            p2: label,
                            p3: answer.punctuation,
                        }),
                        answer.raw,
                        canonicalOption(answer, mixedPunctuation ? preferredPunctuation : answer.punctuation),
                    ),
                );
            }
            if (mixedPunctuation && answer.punctuation !== preferredPunctuation) {
                issues.push(
                    issue(
                        "OPTION_PUNCTUATION",
                        AIKEN_SEVERITY.SAFE_FIX,
                        number,
                        answer.line,
                        uiString("js_aiken_core_question_answer_uses_inconsistent_option_punctua", {
                            p0: number,
                            p1: label,
                        }),
                        answer.raw,
                        canonicalOption(answer, preferredPunctuation),
                    ),
                );
            }
        });
        if (!question.answerKeys.length) {
            issues.push(
                issue(
                    "MISSING_ANSWER_KEY",
                    AIKEN_SEVERITY.ERROR,
                    number,
                    question.answers.at(-1)?.continuationLines.at(-1)?.line ??
                        question.answers.at(-1)?.line ??
                        question.sourceLine,
                    uiString("js_aiken_core_question_the_answer_line_is_missing", {
                        p0: number,
                    }),
                    "",
                    "ANSWER: X",
                ),
            );
        } else {
            if (question.answerKeys.length > 1) {
                const values = question.answerKeys.map((key) => key.value.trim()).join(", ");
                issues.push(
                    issue(
                        "CONFLICTING_ANSWER_KEYS",
                        AIKEN_SEVERITY.ERROR,
                        number,
                        question.answerKeys[1].line,
                        uiString("js_aiken_core_question_multiple_answer_lines_conflict_or_dupli", {
                            p0: number,
                        }),
                        values,
                        uiString("js_aiken_core_one_answer_line"),
                    ),
                );
            }
            question.answerKeys.forEach((answerKey) => {
                const rawValue = answerKey.value.trim();
                if (/^[A-Za-z]\s*[,;+&/]\s*[A-Za-z]/u.test(rawValue) || /\b(?:and)\b/iu.test(rawValue)) {
                    issues.push(
                        issue(
                            "MULTIPLE_CORRECT_UNSUPPORTED",
                            AIKEN_SEVERITY.ERROR,
                            number,
                            answerKey.line,
                            uiString("js_aiken_core_question_standard_moodle_aiken_supports_exactly_", {
                                p0: number,
                                p1: rawValue,
                            }),
                            answerKey.raw,
                            uiString("js_aiken_core_use_a_single_answer_label_or_another_moodle_form"),
                        ),
                    );
                } else if (!/^[A-Za-z]$/u.test(rawValue)) {
                    issues.push(
                        issue(
                            "MALFORMED_ANSWER_KEY",
                            AIKEN_SEVERITY.ERROR,
                            number,
                            answerKey.line,
                            uiString("js_aiken_core_question_answer_must_contain_exactly_one_answer_", {
                                p0: number,
                            }),
                            answerKey.raw,
                            "ANSWER: X",
                        ),
                    );
                } else {
                    const correct = rawValue.toUpperCase();
                    if (!labels.includes(correct)) {
                        issues.push(
                            issue(
                                "ANSWER_NOT_FOUND",
                                AIKEN_SEVERITY.ERROR,
                                number,
                                answerKey.line,
                                uiString("js_aiken_core_question_answer_references_but_that_answer_does_", {
                                    p0: number,
                                    p1: correct,
                                }),
                                answerKey.raw,
                                "",
                            ),
                        );
                    }
                    if (answerKey.raw !== `ANSWER: ${correct}`) {
                        issues.push(
                            issue(
                                "ANSWER_NORMALIZATION",
                                AIKEN_SEVERITY.SAFE_FIX,
                                number,
                                answerKey.line,
                                uiString("js_aiken_core_question_normalize_the_answer_key_to_answer", {
                                    p0: number,
                                    p1: correct,
                                }),
                                answerKey.raw,
                                `ANSWER: ${correct}`,
                            ),
                        );
                    }
                }
            });
        }
    });
    issues.sort(
        (a, b) =>
            (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
            a.severity.localeCompare(b.severity),
    );
    const bySeverity = {
        ["SAFE_FIX"]: issues.filter((item) => item.severity === AIKEN_SEVERITY.SAFE_FIX),
        REVIEW: issues.filter((item) => item.severity === AIKEN_SEVERITY.REVIEW),
        ERROR: issues.filter((item) => item.severity === AIKEN_SEVERITY.ERROR),
    };
    const questionIssueSets = parsed.questions.map((question) =>
        issues.filter((item) => item.questionNumber === question.number),
    );
    return {
        source: String(source ?? ""),
        questions: parsed.questions,
        issues,
        bySeverity,
        summary: {
            total: parsed.questions.length,
            valid: questionIssueSets.filter((items) => items.length === 0).length,
            safelyFixable: new Set(bySeverity.SAFE_FIX.map((item) => item.questionNumber).filter(Boolean))
                .size,
            review: new Set(bySeverity.REVIEW.map((item) => item.questionNumber).filter(Boolean)).size,
            errors: bySeverity.ERROR.length,
        },
        validForDownload: parsed.questions.length > 0 && issues.length === 0,
    };
}
/**
 *
 * @param {*} source
 */
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
        if (option) {
            return canonicalOption(option, punctuationByLine.get(index + 1) ?? option.punctuation);
        }
        const answer = answerParts(raw);
        if (answer && /^[A-Za-z]$/u.test(answer.value.trim())) {
            return canonicalAnswerKey(answer);
        }
        return raw.trimEnd();
    });
    const normalizedBlanks = [];
    fixed.forEach((line) => {
        if (!line.trim() && (!normalizedBlanks.length || !normalizedBlanks.at(-1).trim())) {
            return;
        }
        normalizedBlanks.push(line);
    });
    while (normalizedBlanks.length && !normalizedBlanks.at(-1).trim()) {
        normalizedBlanks.pop();
    }
    return `${normalizedBlanks.join("\n")}\n`;
}
/**
 *
 * @param {*} source
 * @param {*} reviewIssue
 */
export function applyAikenReviewFix(source, reviewIssue) {
    if (reviewIssue?.severity !== AIKEN_SEVERITY.REVIEW || !reviewIssue.replacement) {
        throw new Error(uiString("js_aiken_core_a_review_issue_with_a_proposed_replacement_is_re"));
    }
    const lines = normalizeNewlines(source).split("\n");
    const {startLine, endLine, lines: proposedLines} = reviewIssue.replacement;
    lines.splice(startLine - 1, endLine - startLine + 1, ...proposedLines);
    return lines.join("\n");
}
/**
 *
 * @param {*} now
 */
export function createAikenFilename(now = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return (
        "uniquiz-aiken-fixed-" +
        `${now.getFullYear()}` +
        `${pad(now.getMonth() + 1)}` +
        `${pad(now.getDate())}` +
        "-" +
        `${pad(now.getHours())}` +
        `${pad(now.getMinutes())}` +
        ".txt"
    );
}
