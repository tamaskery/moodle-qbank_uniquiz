/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
import {string as uiString, locale as uiLocale} from "qbank_uniquiz/i18n";
/**
 *
 * @param {*} char
 */
function isCsvLineEnding(char) {
    return char === "\n" || char === "\r";
}
/**
 *
 * @param {*} value
 */
function isPositiveFinite(value) {
    return Number.isFinite(value) && value > 0;
}
/**
 *
 * @param {*} lines
 * @param {*} question
 * @param {*} settings
 * @param {*} activeCategory
 */
function appendCategory(lines, question, settings, activeCategory) {
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
    return activeCategory;
}
/**
 *
 * @param {*} question
 * @param {*} selector
 */
function hasXmlText(question, selector) {
    return Boolean(question.querySelector(selector)?.textContent?.trim());
}
/**
 *
 * @param {*} questionFound
 * @param {*} booleanSchema
 * @param {*} typedAdvancedSchema
 * @param {*} answerLabels
 * @param {*} correctFound
 * @param {*} fractionLabels
 */
function mappingRequirements(
    questionFound,
    booleanSchema,
    typedAdvancedSchema,
    answerLabels,
    correctFound,
    fractionLabels,
) {
    const missingRequirements = [];
    if (!questionFound) {
        missingRequirements.push(uiString("js_core_question_text_column_not_identified"));
    }
    if (!booleanSchema && !typedAdvancedSchema && answerLabels.size < 2) {
        missingRequirements.push(
            answerLabels.size === 0
                ? uiString("js_core_answer_columns_not_identified_add_at_least_two_a")
                : uiString("js_core_at_least_two_answer_columns_are_required"),
        );
    }
    if (
        !booleanSchema &&
        !typedAdvancedSchema &&
        answerLabels.size >= 2 &&
        !correctFound &&
        fractionLabels.size === 0
    ) {
        missingRequirements.push(uiString("js_core_correct_answer_column_not_identified_add_a_corre"));
    }
    return missingRequirements;
}
/**
 *
 * @param {*} char
 * @param {*} next
 */
function isCsvRecordBreak(char, next) {
    return char === "\n" || (char === "\r" && next !== "\n");
}
/**
 *
 * @param {*} question
 * @param {*} number
 * @param {*} own
 * @param {*} usable
 * @param {*} labels
 */
function validateChoiceQuestion(question, number, own, usable, labels) {
    if (question.type === "truefalse") {
        const normalized = usable.map(({originalText}) => originalText.trim().toLocaleLowerCase()).sort();
        if (usable.length !== 2 || normalized[0] !== "false" || normalized[1] !== "true") {
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.TOO_FEW_ANSWERS,
                    "error",
                    uiString("js_core_invalid_true_false_answers"),
                    uiString("js_core_native_true_false_questions_need_exactly_two_ans"),
                    number,
                    {
                        field: "answers",
                    },
                ),
            );
        }
    }
    question.answers.forEach((answer, answerIndex) => {
        if (!Number.isFinite(answer.fraction) || answer.fraction < -100 || answer.fraction > 100) {
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION,
                    "error",
                    uiString("js_core_invalid_answer_fraction"),
                    uiString("js_core_is_not_a_valid_answer_fraction_use_a_number_from", {
                        p0: String(answer.fraction),
                    }),
                    number,
                    {
                        field: `answer_${answer.label}_fraction`,
                        answerIndex: answer.label,
                        metadata: {
                            answerPosition: answerIndex + 1,
                            rawValue: answer.fraction,
                        },
                    },
                ),
            );
        }
    });
    const positiveAnswers = question.answers.filter(
        ({fraction}) => Number.isFinite(fraction) && fraction > 0,
    );
    const positiveTotal = positiveAnswers.reduce((sum, {fraction}) => sum + fraction, 0);
    if (positiveAnswers.length === 0) {
        if (question.correctLabels.length === 0) {
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.NO_POSITIVE_ANSWER,
                    "error",
                    uiString("js_core_no_correct_answer"),
                    uiString("js_core_this_question_has_no_positively_scored_answer_ma"),
                    number,
                    {
                        field: "correct",
                    },
                ),
            );
        }
    } else if (Math.abs(positiveTotal - 100) > 0.0011) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.POSITIVE_FRACTION_TOTAL_INVALID,
                "error",
                uiString("js_core_answer_fractions_do_not_total_100"),
                uiString("js_core_positive_answer_fractions_must_total_100_the_cur", {
                    p0: diagnosticNumber(positiveTotal),
                }),
                number,
                {
                    field: "answer_fractions",
                    metadata: {
                        positiveTotal,
                    },
                },
            ),
        );
    }
    if (question.single === true && positiveAnswers.length > 1) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.SINGLE_MODE_CONFLICT,
                "error",
                uiString("js_core_conflicting_answer_mode"),
                uiString("js_core_this_question_is_marked_as_single_answer_but_its"),
                number,
                {
                    field: "single",
                    metadata: {
                        positiveAnswerCount: positiveAnswers.length,
                    },
                },
            ),
        );
    }
    if (
        question.defaultMark !== null &&
        (!Number.isFinite(question.defaultMark) || question.defaultMark <= 0)
    ) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK,
                "error",
                uiString("js_core_invalid_default_mark"),
                uiString("js_core_the_default_mark_must_be_greater_than_0_enter_a_"),
                number,
                {
                    field: "default_mark",
                    metadata: {
                        rawValue: question.defaultMark,
                    },
                },
            ),
        );
    }
    if (question.answerNumbering !== null && !ANSWER_NUMBERING.has(question.answerNumbering)) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.INVALID_ANSWER_NUMBERING,
                "error",
                uiString("js_core_unsupported_answer_numbering"),
                uiString("js_core_answer_numbering_must_be_abc_abcd_123_or_none_ch"),
                number,
                {
                    field: "answer_numbering",
                    metadata: {
                        rawValue: question.answerNumbering,
                    },
                },
            ),
        );
    }
    question.correctLabels.forEach((label) => {
        if (!labels.includes(label)) {
            const range = labels.length ? labels.join(", ") : uiString("js_core_no_answer_labels");
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.CORRECT_ANSWER_REFERENCE_INVALID,
                    "error",
                    uiString("js_core_correct_answer_reference_is_invalid"),
                    uiString("js_core_the_correct_answer_field_refers_to_answer_but_th", {
                        p0: label,
                        p1: range,
                    }),
                    number,
                    {
                        field: "correct",
                        answerIndex: label,
                        metadata: {
                            availableLabels: labels,
                        },
                    },
                ),
            );
        }
    });
    if (new Set(question.correctLabels).size !== question.correctLabels.length) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.DUPLICATE_CORRECT_REFERENCE,
                "error",
                uiString("js_core_duplicate_correct_answer_reference"),
                uiString("js_core_the_same_correct_answer_is_listed_more_than_once"),
                number,
                {
                    field: "correct",
                },
            ),
        );
    }
    const diagnostics = deduplicateDiagnostics(
        own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)),
    );
    const status = classifyQuestionStatus(diagnostics);
    return {
        ...question,
        diagnostics,
        validationIssues: diagnostics,
        status,
    };
}
/**
 *
 * @param {*} question
 * @param {*} number
 * @param {*} own
 */
function validateQuestionContent(question, number, own) {
    const textFields = {
        ["question_text"]: question.text,
        ["question_name"]: question.questionName,
        name: question.name,
        category: question.category,
        ["general_feedback"]: question.generalFeedback,
        ["correct_feedback"]: question.correctFeedback,
        ["partially_correct_feedback"]: question.partiallyCorrectFeedback,
        ["incorrect_feedback"]: question.incorrectFeedback,
    };
    question.answers.forEach((answer, i) => {
        textFields[`answer_${i + 1}`] = answer.transformedText ?? answer.originalText;
        textFields[`answer_${i + 1}_feedback`] = answer.feedback;
    });
    (question.tags ?? []).forEach((tag, i) => {
        textFields[`tag_${i + 1}`] = tag;
    });
    for (const [field, value] of Object.entries(textFields)) {
        if (INVALID_XML_CHARACTER.test(String(value ?? ""))) {
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.XML_INVALID_CHARACTER,
                    "error",
                    uiString("js_core_unsupported_text_character"),
                    uiString("js_core_this_field_contains_a_character_that_xml_cannot_"),
                    number,
                    {
                        field,
                    },
                ),
            );
        }
    }
    if (Array.from(question.questionName || question.name || "").length > 255) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.QUESTION_NAME_TOO_LONG,
                "error",
                uiString("js_core_question_name_is_too_long"),
                uiString("js_core_use_at_most_255_characters_for_the_question_name"),
                number,
                {
                    field: "question_name",
                },
            ),
        );
    }
    if ((question.tags ?? []).some((tag) => !validMoodleTag(tag))) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.INVALID_TAG,
                "error",
                uiString("js_core_tag_would_be_changed_by_moodle"),
                uiString("js_core_use_tags_of_at_most_255_characters_with_single_s"),
                number,
                {
                    field: "tags",
                },
            ),
        );
    }
    if (!SUPPORTED_QUESTION_TYPES.has(question.type)) {
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.UNSUPPORTED_QUESTION_TYPE,
                "error",
                uiString("js_core_unsupported_question_type"),
                uiString("js_core_this_question_uses_the_unsupported_type_use_mult", {
                    p0: question.type,
                }),
                number,
                {
                    field: "type",
                    metadata: {
                        rawValue: question.type,
                    },
                },
            ),
        );
    }
    if (!question.text.trim()) {
        const missingCopy = (() => {
            if (question.type === "description") {
                return [
                    uiString("js_core_description_content_is_missing"),
                    uiString("js_core_this_description_has_no_content_add_question_tex"),
                ];
            } else {
                if (question.type === "essay") {
                    return [
                        uiString("js_core_essay_question_text_is_missing"),
                        uiString("js_core_this_essay_question_is_missing_question_text_add"),
                    ];
                } else {
                    return (() => {
                        if (question.type === "shortanswer") {
                            return [
                                uiString("js_core_short_answer_question_text_is_missing"),
                                uiString("js_core_this_short_answer_question_is_missing_question_t"),
                            ];
                        } else {
                            if (question.type === "numerical") {
                                return [
                                    uiString("js_core_numerical_question_text_is_missing"),
                                    uiString("js_core_this_numerical_question_is_missing_question_text"),
                                ];
                            } else {
                                return [
                                    uiString("js_core_question_text_is_missing"),
                                    uiString("js_core_this_question_has_no_question_text_add_question_"),
                                ];
                            }
                        }
                    })();
                }
            }
        })();
        own.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.QUESTION_TEXT_MISSING,
                "error",
                missingCopy[0],
                missingCopy[1],
                number,
                {
                    field: "question_text",
                },
            ),
        );
    }
}
export const ANSWER_NUMBERING = new Set(["none", "abc", "ABCD", "123"]);
export const SUPPORTED_QUESTION_TYPES = new Set([
    "multichoice",
    "truefalse",
    "shortanswer",
    "numerical",
    "essay",
    "description",
]);
const CSV_BASE_FIELDS = new Set([
    "type",
    "category",
    "question_name",
    "question_text",
    "general_feedback",
    "default_mark",
    "shuffle_answers",
    "answer_numbering",
    "single",
    "correct_feedback",
    "partially_correct_feedback",
    "incorrect_feedback",
    "tags",
    "correct",
    "boolean_value",
    "case_sensitive",
]);
export const CSV_CANONICAL_HEADERS = Object.freeze([
    "type",
    "category",
    "question_name",
    "question_text",
    "general_feedback",
    "default_mark",
    "shuffle_answers",
    "answer_numbering",
    "single",
    "correct_feedback",
    "partially_correct_feedback",
    "incorrect_feedback",
    ...Array.from(
        {
            length: 6,
        },
        (_, index) => [
            `answer_${index + 1}`,
            `answer_${index + 1}_fraction`,
            `answer_${index + 1}_tolerance`,
            `answer_${index + 1}_feedback`,
        ],
    ).flat(),
    "case_sensitive",
    "tags",
]);
export const CSV_HEADER_ALIASES = Object.freeze({
    question: "question_text",
    questiontext: "question_text",
    prompt: "question_text",
    ["correct_answer"]: "correct",
    ["correct_answers"]: "correct",
    correctanswer: "correct",
    correctanswers: "correct",
    ["answer_key"]: "correct",
    answerkey: "correct",
    key: "correct",
    answer: "boolean_value",
    "boolean": "boolean_value",
    ["boolean_answer"]: "boolean_value",
    booleananswer: "boolean_value",
    ["truth_value"]: "boolean_value",
    truthvalue: "boolean_value",
});
export const DIAGNOSTIC_CODES = Object.freeze({
    ["UNKNOWN_HEADER"]: "UNKNOWN_HEADER",
    ["DUPLICATE_HEADER"]: "DUPLICATE_HEADER",
    ["INVALID_BOOLEAN_VALUE"]: "INVALID_BOOLEAN_VALUE",
    ["INVALID_ANSWER_NUMBERING"]: "INVALID_ANSWER_NUMBERING",
    ["ANSWER_DATA_WITHOUT_TEXT"]: "ANSWER_DATA_WITHOUT_TEXT",
    ["SCORING_METHOD_CONFLICT"]: "SCORING_METHOD_CONFLICT",
    ["MISSING_ANSWER_FRACTION"]: "MISSING_ANSWER_FRACTION",
    ["INVALID_NUMERICAL_ANSWER"]: "INVALID_NUMERICAL_ANSWER",
    ["INVALID_NUMERICAL_TOLERANCE"]: "INVALID_NUMERICAL_TOLERANCE",
    ["UNSUPPORTED_QUESTION_TYPE"]: "UNSUPPORTED_QUESTION_TYPE",
    ["QUESTION_TEXT_MISSING"]: "QUESTION_TEXT_MISSING",
    ["DUPLICATE_ANSWER_LABEL"]: "DUPLICATE_ANSWER_LABEL",
    ["TOO_FEW_ANSWERS"]: "TOO_FEW_ANSWERS",
    ["DUPLICATE_ANSWER_TEXT"]: "DUPLICATE_ANSWER_TEXT",
    ["INVALID_ANSWER_FRACTION"]: "INVALID_ANSWER_FRACTION",
    ["NO_POSITIVE_ANSWER"]: "NO_POSITIVE_ANSWER",
    ["POSITIVE_FRACTION_TOTAL_INVALID"]: "POSITIVE_FRACTION_TOTAL_INVALID",
    ["SINGLE_MODE_CONFLICT"]: "SINGLE_MODE_CONFLICT",
    ["INVALID_DEFAULT_MARK"]: "INVALID_DEFAULT_MARK",
    ["CORRECT_ANSWER_REFERENCE_INVALID"]: "CORRECT_ANSWER_REFERENCE_INVALID",
    ["DUPLICATE_CORRECT_REFERENCE"]: "DUPLICATE_CORRECT_REFERENCE",
    ["TXT_ANSWER_KEY_WITHOUT_QUESTION"]: "TXT_ANSWER_KEY_WITHOUT_QUESTION",
    ["TXT_AMBIGUOUS_STRUCTURE"]: "TXT_AMBIGUOUS_STRUCTURE",
    ["TXT_ANSWER_KEY_MISSING"]: "TXT_ANSWER_KEY_MISSING",
    ["NO_SUPPORTED_QUESTIONS"]: "NO_SUPPORTED_QUESTIONS",
    ["CSV_UNEXPECTED_AFTER_QUOTE"]: "CSV_UNEXPECTED_AFTER_QUOTE",
    ["CSV_UNCLOSED_QUOTE"]: "CSV_UNCLOSED_QUOTE",
    ["NO_USABLE_ROWS"]: "NO_USABLE_ROWS",
    ["IMPORT_WARNING"]: "IMPORT_WARNING",
    ["IMPORT_ERROR"]: "IMPORT_ERROR",
    ["XML_INVALID_CHARACTER"]: "XML_INVALID_CHARACTER",
    ["INVALID_TAG"]: "INVALID_TAG",
    ["QUESTION_NAME_TOO_LONG"]: "QUESTION_NAME_TOO_LONG",
});

// With the Unicode flag, the surrogate range matches only unpaired surrogates,
// not valid supplementary characters such as emoji. Never silently drop source data.
// eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters; reject them explicitly.
const INVALID_XML_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;
/**
 *
 * @param {*} value
 */
function checkXmlSource(value) {
    const text = String(value ?? "");
    const match = INVALID_XML_CHARACTER.exec(text);
    if (match) {
        const codepoint = `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
        const line = text.slice(0, match.index).split(/\r\n|\r|\n/u).length;
        throw inputDiagnosticError(
            DIAGNOSTIC_CODES.XML_INVALID_CHARACTER,
            uiString("js_core_unsupported_text_character"),
            uiString("js_core_the_source_contains_which_xml_cannot_represent_r", {
                p0: codepoint,
            }),
            {
                line,
                codepoint,
            },
        );
    }
    return text;
}
/**
 *
 * @param {*} value
 */
function validMoodleTag(value) {
    const text = String(value);
    return (
        Array.from(text).length <= 255 &&
        text ===
            text
                .replace(/[\p{Cc}<>`]/gu, "")
                .replace(/\s+/gu, " ")
                .trim()
    );
}
/**
 *
 * @param {*} root0
 * @param {*} root0.code
 * @param {*} root0.severity
 * @param {*} root0.title
 * @param {*} root0.message
 * @param {*} root0.sourceIndex
 * @param {*} root0.scope
 * @param {*} root0.field
 * @param {*} root0.answerIndex
 * @param {*} root0.metadata
 */
export function createDiagnostic({
    code,
    severity,
    title,
    message,
    sourceIndex = null,
    scope = "question",
    field,
    answerIndex,
    metadata,
}) {
    const diagnostic = {
        code,
        severity,
        title,
        message,
        sourceIndex,
        scope,
    };
    if (field !== undefined) {
        diagnostic.field = field;
    }
    if (answerIndex !== undefined) {
        diagnostic.answerIndex = answerIndex;
    }
    if (metadata !== undefined) {
        diagnostic.metadata = metadata;
    }
    return diagnostic;
}
/**
 *
 * @param {*} code
 * @param {*} severity
 * @param {*} title
 * @param {*} message
 * @param {*} context
 */
function importDiagnostic(code, severity, title, message, context = {}) {
    return createDiagnostic({
        code,
        severity,
        title,
        message,
        scope: "import",
        ...context,
    });
}
/**
 *
 * @param {*} code
 * @param {*} severity
 * @param {*} title
 * @param {*} message
 * @param {*} sourceIndex
 * @param {*} context
 */
function questionDiagnostic(code, severity, title, message, sourceIndex, context = {}) {
    return createDiagnostic({
        code,
        severity,
        title,
        message,
        sourceIndex,
        scope: "question",
        ...context,
    });
}
/**
 *
 * @param {*} code
 * @param {*} title
 * @param {*} message
 * @param {*} metadata
 */
function inputDiagnosticError(code, title, message, metadata) {
    const error = new Error(message);
    error.name = "InputDiagnosticError";
    error.diagnostic = importDiagnostic(
        code,
        "error",
        title,
        message,
        metadata
            ? {
                  metadata,
              }
            : {},
    );
    return error;
}
/**
 *
 * @param {*} error
 */
export function getInputDiagnostic(error) {
    const diagnostic = error?.diagnostic;
    return diagnostic?.code && diagnostic?.severity && diagnostic?.title && diagnostic?.message
        ? diagnostic
        : null;
}
/**
 *
 * @param {*} value
 */
function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}
/**
 *
 * @param {*} diagnostic
 * @param {*} root0
 * @param {*} root0.includeTitle
 * @param {*} root0.includeQuestion
 */
export function formatDiagnostic(diagnostic, {includeTitle = true, includeQuestion = true} = {}) {
    const message = String(
        diagnostic?.message ?? uiString("js_core_review_this_issue_before_exporting"),
    ).trim();
    const metadata = diagnostic?.metadata ?? {};
    const context = [];
    const csvRow = positiveInteger(metadata.csvRow);
    const csvColumn = positiveInteger(metadata.csvColumn);
    const line = positiveInteger(metadata.line);
    const question = positiveInteger(diagnostic?.sourceIndex);
    if (
        csvRow &&
        !message.includes(
            uiString("js_core_csv_row", {
                p0: csvRow,
            }),
        )
    ) {
        context.push(
            uiString("js_core_csv_row_2", {
                p0: csvRow,
                p1: csvColumn
                    ? uiString("js_core_column", {
                          p0: csvColumn,
                      })
                    : "",
            }),
        );
    } else if (
        csvColumn &&
        !message.includes(
            uiString("js_core_column_2", {
                p0: csvColumn,
            }),
        )
    ) {
        context.push(
            uiString("js_core_csv_column", {
                p0: csvColumn,
            }),
        );
    }
    if (line && !new RegExp(`\\bLine ${line}\\b`, "u").test(message)) {
        context.push(
            uiString("js_core_line", {
                p0: line,
            }),
        );
    }
    if (includeQuestion && question && !new RegExp(`\\bQuestion ${question}\\b`, "u").test(message)) {
        context.push(
            uiString("js_core_question", {
                p0: question,
            }),
        );
    }
    if (diagnostic?.field) {
        context.push(String(diagnostic.field));
    } else if (diagnostic?.answerIndex !== undefined) {
        context.push(
            uiString("js_core_answer", {
                p0: diagnostic.answerIndex,
            }),
        );
    }
    const title = includeTitle ? String(diagnostic?.title ?? "").trim() : "";
    const detail =
        title && !message.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())
            ? `${title}: ${message}`
            : message;
    return context.length ? `${context.join(" · ")}: ${detail}` : detail;
}
/**
 *
 * @param {*} value
 */
export function normalizeHeader(value) {
    return String(value ?? "")
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase()
        .replace(/[\s-]+/gu, "_")
        .replace(/_+/gu, "_")
        .replace(/^_+|_+$/gu, "");
}
/**
 *
 * @param {*} index
 */
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
/**
 *
 * @param {*} normalizedHeader
 */
function answerIndexForHeader(normalizedHeader) {
    let match = normalizedHeader.match(/^answer_(\d+)(?:_(?:fraction|tolerance|feedback))?$/u);
    if (match && Number(match[1]) >= 1) {
        return Number(match[1]);
    }
    match = normalizedHeader.match(/^(?:answer|option)_?([a-z])$/u);
    if (match) {
        return match[1].charCodeAt(0) - 96;
    }
    match = normalizedHeader.match(/^(?:answer|option)_?(\d+)$/u);
    if (match && Number(match[1]) >= 1) {
        return Number(match[1]);
    }
    if (/^[a-z]$/u.test(normalizedHeader)) {
        return normalizedHeader.charCodeAt(0) - 96;
    }
    return null;
}
/**
 *
 * @param {*} value
 */
export function resolveCsvHeader(value) {
    const normalized = normalizeHeader(value);
    if (!normalized) {
        return null;
    }
    const alias = CSV_HEADER_ALIASES[normalized];
    if (alias) {
        return alias;
    }
    if (CSV_BASE_FIELDS.has(normalized)) {
        return normalized;
    }
    const canonicalAnswer = normalized.match(/^answer_(\d+)(?:_(fraction|tolerance|feedback))?$/u);
    if (canonicalAnswer && Number(canonicalAnswer[1]) >= 1) {
        return normalized;
    }
    const answerIndex = answerIndexForHeader(normalized);
    return answerIndex ? `answer_${answerIndex}` : null;
}
/**
 *
 * @param {*} field
 */
function roleForCsvField(field) {
    if (field === "question_text") {
        return "question";
    }
    if (field === "correct") {
        return "correct";
    }
    if (field === "boolean_value") {
        return "boolean-candidate";
    }
    const answer = field.match(/^answer_(\d+)(?:_(fraction|tolerance|feedback))?$/u);
    if (answer) {
        const label = columnLetter(Number(answer[1]) - 1);
        if (answer[2] === "fraction") {
            return `answer-fraction:${label}`;
        }
        if (answer[2] === "tolerance") {
            return `answer-tolerance:${label}`;
        }
        if (answer[2] === "feedback") {
            return `answer-feedback:${label}`;
        }
        return `answer:${label}`;
    }
    return `field:${field}`;
}
/**
 *
 * @param {*} text
 * @param {*} delimiter
 */
function countDelimiterOutsideQuotes(text, delimiter) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') {
                i += 1;
            } else {
                quoted = !quoted;
            }
        } else if (!quoted && char === delimiter) {
            count += 1;
        }
    }
    return count;
}
/**
 *
 * @param {*} text
 */
export function detectDelimiter(text) {
    const sample = String(text).split(/\r?\n/u).slice(0, 8).join("\n");
    const delimiters = [",", ";", "\t"];
    return delimiters
        .map((delimiter) => ({
            delimiter,
            count: countDelimiterOutsideQuotes(sample, delimiter),
        }))
        .sort((a, b) => b.count - a.count)[0].delimiter;
}
/**
 *
 * @param {*} text
 * @param {*} delimiter
 */
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
                if (isCsvRecordBreak(char, text[i + 1])) {
                    csvRow += 1;
                }
            }
            continue;
        }
        if (char === '"' && field.length === 0) {
            quoted = true;
            justClosedQuote = false;
            quoteStart = {
                csvRow,
                csvColumn: row.length + 1,
            };
        } else if (char === delimiter) {
            row.push(field);
            field = "";
            justClosedQuote = false;
        } else if (isCsvLineEnding(char)) {
            if (char === "\r" && text[i + 1] === "\n") {
                i += 1;
            }
            row.push(field);
            if (row.some((cell) => cell.trim() !== "")) {
                rows.push(row);
                rowLocations.push({
                    csvRow: recordStartRow,
                });
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
                uiString("js_core_unexpected_text_after_a_quoted_csv_value"),
                uiString("js_core_a_quoted_csv_field_contains_unexpected_text_afte"),
                {
                    csvRow,
                    csvColumn: row.length + 1,
                },
            );
        } else {
            field += char;
        }
    }
    if (quoted) {
        throw inputDiagnosticError(
            DIAGNOSTIC_CODES.CSV_UNCLOSED_QUOTE,
            uiString("js_core_quoted_csv_value_is_not_closed"),
            uiString("js_core_a_quoted_csv_field_is_not_closed_add_the_closing"),
            quoteStart ?? {
                csvRow,
                csvColumn: row.length + 1,
            },
        );
    }
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
        rowLocations.push({
            csvRow: recordStartRow,
        });
    }
    if (rows.length === 0) {
        throw inputDiagnosticError(
            DIAGNOSTIC_CODES.NO_USABLE_ROWS,
            uiString("js_core_no_usable_rows"),
            uiString("js_core_the_file_does_not_contain_any_usable_rows_add_a_"),
        );
    }
    return {
        rows,
        delimiter,
        rowLocations,
    };
}
/**
 *
 * @param {*} headers
 * @param {*} headerLocation
 */
export function detectCsvMapping(
    headers,
    headerLocation = {
        csvRow: 1,
    },
) {
    const roles = headers.map(() => "ignore");
    const issues = [];
    const fields = headers.map((header) => resolveCsvHeader(header));
    const seenFields = new Set();
    headers.forEach((header, index) => {
        const field = fields[index];
        if (!field) {
            issues.push(
                importDiagnostic(
                    DIAGNOSTIC_CODES.UNKNOWN_HEADER,
                    "warning",
                    uiString("js_core_unrecognized_column_ignored"),
                    uiString("js_core_unrecognized_column_ignored_review_the_heading_o", {
                        p0: String(header).trim(),
                    }),
                    {
                        field: String(header).trim(),
                        metadata: {
                            csvRow: headerLocation?.csvRow ?? 1,
                            csvColumn: index + 1,
                            columnIndex: index,
                        },
                    },
                ),
            );
            return;
        }
        if (seenFields.has(field)) {
            issues.push(
                importDiagnostic(
                    DIAGNOSTIC_CODES.DUPLICATE_HEADER,
                    "error",
                    uiString("js_core_duplicate_column_detected"),
                    uiString("js_core_duplicate_column_detected_keep_only_one_column_f", {
                        p0: field,
                    }),
                    {
                        field,
                        metadata: {
                            csvRow: headerLocation?.csvRow ?? 1,
                            csvColumn: index + 1,
                            columnIndex: index,
                        },
                    },
                ),
            );
            return;
        }
        seenFields.add(field);
        roles[index] = roleForCsvField(field);
    });
    const answerLabels = new Set(
        roles.filter((role) => role.startsWith("answer:")).map((role) => role.slice(7)),
    );
    const fractionLabels = new Set(
        roles.filter((role) => role.startsWith("answer-fraction:")).map((role) => role.slice(16)),
    );
    const booleanCandidates = roles.flatMap((role, index) => (role === "boolean-candidate" ? [index] : []));
    let booleanFound = false;
    if (answerLabels.size === 0 && booleanCandidates.length === 1) {
        roles[booleanCandidates[0]] = "boolean";
        booleanFound = true;
    } else {
        booleanCandidates.forEach((index) => {
            roles[index] = "ignore";
        });
    }
    const questionFound = roles.includes("question");
    const typeFound = roles.includes("field:type");
    const correctFound = roles.includes("correct");
    const explicitSchema = correctFound && answerLabels.size >= 2;
    const fractionSchema = fractionLabels.size >= 1 && answerLabels.size >= 2;
    const booleanSchema = booleanFound && answerLabels.size === 0;
    const typedAdvancedSchema = typeFound && questionFound;
    const certain =
        questionFound && (explicitSchema || fractionSchema || booleanSchema || typedAdvancedSchema);
    const missingRequirements = mappingRequirements(
        questionFound,
        booleanSchema,
        typedAdvancedSchema,
        answerLabels,
        correctFound,
        fractionLabels,
    );
    return {
        roles,
        fields,
        issues,
        certain,
        missingRequirements,
        schema: (() => {
            if (booleanSchema) {
                return "boolean";
            } else {
                if (fractionSchema) {
                    return "fraction";
                } else {
                    return (() => {
                        if (explicitSchema) {
                            return "basic";
                        } else {
                            if (typedAdvancedSchema) {
                                return "typed";
                            } else {
                                return "unknown";
                            }
                        }
                    })();
                }
            }
        })(),
        message: certain
            ? uiString("js_core_all_required_columns_were_recognized")
            : uiString("js_core_rename_the_column_or_use_manual_column_mapping", {
                  p0: missingRequirements.join(". "),
              }),
    };
}
/**
 *
 * @param {*} issues
 * @param {*} roles
 */
export function resolveCsvMappingIssues(issues, roles) {
    return issues.filter(
        (issue) =>
            issue.code !== DIAGNOSTIC_CODES.UNKNOWN_HEADER || roles[issue.metadata?.columnIndex] === "ignore",
    );
}
/**
 *
 * @param {*} roles
 * @param {*} field
 */
function fieldIndex(roles, field) {
    return roles.indexOf(`field:${field}`);
}
/**
 *
 * @param {*} row
 * @param {*} index
 */
function optionalText(row, index) {
    return index >= 0 ? String(row[index] ?? "").trim() : "";
}
/**
 *
 * @param {*} value
 * @param {*} field
 * @param {*} questionNumber
 * @param {*} issues
 */
function parseNumericalTolerance(value, field, questionNumber, issues) {
    const source = String(value ?? "").trim();
    if (!source) {
        return 0;
    }
    if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(source)) {
        issues.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE,
                "error",
                uiString("js_core_invalid_numerical_tolerance"),
                uiString("js_core_is_not_a_valid_numerical_tolerance_use_zero_or_a", {
                    p0: source,
                }),
                questionNumber,
                {
                    field,
                    answerIndex: field.match(/^answer_(.+)_tolerance$/u)?.[1],
                    metadata: {
                        rawValue: source,
                    },
                },
            ),
        );
        return Number.NaN;
    }
    const number = Number(source);
    if (!Number.isFinite(number) || number < 0) {
        issues.push(
            questionDiagnostic(
                DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE,
                "error",
                uiString("js_core_invalid_numerical_tolerance"),
                uiString("js_core_numerical_tolerance_must_be_zero_or_a_non_negati"),
                questionNumber,
                {
                    field,
                    answerIndex: field.match(/^answer_(.+)_tolerance$/u)?.[1],
                    metadata: {
                        rawValue: source,
                    },
                },
            ),
        );
        return Number.NaN;
    }
    return number;
}
/**
 *
 * @param {*} value
 * @param {*} field
 * @param {*} questionNumber
 * @param {*} issues
 * @param {*} root0
 * @param {*} root0.minimum
 * @param {*} root0.maximum
 */
function parseOptionalNumber(
    value,
    field,
    questionNumber,
    issues,
    {minimum = -Infinity, maximum = Infinity} = {},
) {
    const source = String(value ?? "").trim();
    if (!source) {
        return null;
    }
    const isFraction = /^answer_.+_fraction$/u.test(field);
    const code = isFraction
        ? DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION
        : DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK;
    const title = isFraction
        ? uiString("js_core_invalid_answer_fraction")
        : uiString("js_core_invalid_default_mark");
    const answerLabel = isFraction ? field.match(/^answer_(.+)_fraction$/u)?.[1] : undefined;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(source)) {
        issues.push(
            questionDiagnostic(
                code,
                "error",
                title,
                isFraction
                    ? uiString("js_core_is_not_a_valid_answer_fraction_use_a_number_from", {
                          p0: source,
                      })
                    : uiString("js_core_is_not_a_valid_default_mark_enter_a_number_great", {
                          p0: source,
                      }),
                questionNumber,
                {
                    field,
                    answerIndex: answerLabel,
                    metadata: {
                        rawValue: source,
                    },
                },
            ),
        );
        return Number.NaN;
    }
    const number = Number(source);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
        issues.push(
            questionDiagnostic(
                code,
                "error",
                title,
                isFraction
                    ? uiString("js_core_is_not_a_valid_answer_fraction_use_a_number_from", {
                          p0: source,
                      })
                    : uiString("js_core_the_default_mark_must_be_greater_than_0_enter_a_"),
                questionNumber,
                {
                    field,
                    answerIndex: answerLabel,
                    metadata: {
                        rawValue: source,
                        minimum,
                        maximum,
                    },
                },
            ),
        );
        return Number.NaN;
    }
    return number;
}
/**
 *
 * @param {*} value
 * @param {*} field
 * @param {*} questionNumber
 * @param {*} issues
 */
function parseOptionalBoolean(value, field, questionNumber, issues) {
    const source = String(value ?? "")
        .trim()
        .toLocaleLowerCase();
    if (!source) {
        return null;
    }
    if (["true", "1"].includes(source)) {
        return true;
    }
    if (["false", "0"].includes(source)) {
        return false;
    }
    issues.push(
        questionDiagnostic(
            DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
            "error",
            uiString("js_core_invalid_true_false_value"),
            uiString("js_core_must_be_true_false_1_or_0_update_the_value_befor", {
                p0: field,
            }),
            questionNumber,
            {
                field,
                metadata: {
                    rawValue: source,
                },
            },
        ),
    );
    return null;
}
/**
 *
 * @param {*} value
 * @param {*} questionNumber
 * @param {*} issues
 */
function parseCaseSensitive(value, questionNumber, issues) {
    const source = String(value ?? "")
        .trim()
        .toLocaleLowerCase();
    if (!source) {
        return false;
    }
    if (["true", "1"].includes(source)) {
        return true;
    }
    if (["false", "0"].includes(source)) {
        return false;
    }
    issues.push(
        questionDiagnostic(
            DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
            "error",
            uiString("js_core_unsupported_case_sensitive_value"),
            uiString("js_core_case_sensitive_must_be_true_false_1_or_0_update_"),
            questionNumber,
            {
                field: "case_sensitive",
                metadata: {
                    rawValue: source,
                },
            },
        ),
    );
    return false;
}
/**
 *
 * @param {*} value
 * @param {*} questionNumber
 * @param {*} issues
 */
function parseOptionalAnswerNumbering(value, questionNumber, issues) {
    const source = String(value ?? "").trim();
    if (!source) {
        return null;
    }
    const aliases = new Map([
        ["abc", "abc"],
        ["a,b,c", "abc"],
        ["ABCD", "ABCD"],
        ["abcd", "ABCD"],
        ["A,B,C", "ABCD"],
        ["123", "123"],
        ["1,2,3", "123"],
        ["none", "none"],
        ["no numbering", "none"],
    ]);
    const normalized = aliases.get(source) ?? aliases.get(source.toLocaleLowerCase());
    if (normalized) {
        return normalized;
    }
    issues.push(
        questionDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ANSWER_NUMBERING,
            "error",
            uiString("js_core_unsupported_answer_numbering"),
            uiString("js_core_answer_numbering_must_be_abc_abcd_123_or_none_ch"),
            questionNumber,
            {
                field: "answer_numbering",
                metadata: {
                    rawValue: source,
                },
            },
        ),
    );
    return null;
}
/**
 *
 * @param {*} value
 */
function parseTags(value) {
    const seen = new Set();
    return String(value ?? "")
        .split(";")
        .map((tag) => tag.trim())
        .filter((tag) => {
            const key = tag.normalize("NFKC").toLocaleLowerCase();
            if (!tag || seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}
/**
 *
 * @param {*} value
 */
export function normalizeBooleanValue(value) {
    const normalized = String(value ?? "")
        .trim()
        .toLocaleLowerCase();
    if (normalized === "true") {
        return true;
    }
    if (normalized === "false") {
        return false;
    }
    return null;
}
/**
 *
 * @param {*} value
 */
export function normalizeCorrectLabels(value) {
    const cleaned = String(value ?? "").trim();
    if (!cleaned) {
        return [];
    }
    return cleaned
        .replace(/\b(?:answers?|options?)\b/giu, "")
        .split(/\s*(?:,|;|\+|&|\/|\band\b)\s*/giu)
        .map((token) => token.replace(/^[\s.():-]+|[\s.():-]+$/gu, "").toUpperCase())
        .filter(Boolean)
        .map((token) => (/^\d+$/u.test(token) ? columnLetter(Number(token) - 1) : token));
}
/**
 *
 * @param {*} sourceIndex
 * @param {*} text
 * @param {*} answers
 * @param {*} correctLabels
 * @param {*} metadata
 */
function makeQuestion(sourceIndex, text, answers, correctLabels = [], metadata = {}) {
    const correct = new Set(correctLabels);
    const explicitScoring = answers.some((answer) => Object.hasOwn(answer, "fraction"));
    const basicPositiveFraction = correct.size ? Number(formatFraction(correct.size)) : 0;
    const normalizedAnswers = answers.map((answer) => {
        const label = answer.label.toUpperCase();
        const fraction = (() => {
            if (explicitScoring) {
                return answer.fraction;
            } else {
                if (correct.has(label)) {
                    return basicPositiveFraction;
                } else {
                    return 0;
                }
            }
        })();
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
    const positiveLabels = normalizedAnswers
        .filter(({fraction}) => Number.isFinite(fraction) && fraction > 0)
        .map(({label}) => label);
    return {
        type: String(metadata.type || "multichoice")
            .trim()
            .toLocaleLowerCase(),
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
    {
        style: "numeric-dot",
        expression: /^(\d+)\.\s+(.+)$/su,
    },
    {
        style: "numeric-parenthesis",
        expression: /^(\d+)\)\s+(.+)$/su,
    },
    {
        style: "q-prefix",
        expression: /^q(\d+)\.\s+(.+)$/isu,
    },
    {
        style: "question-label",
        expression: /^question\s+(\d+):\s+(.+)$/isu,
    },
];
/**
 *
 * @param {*} questions
 */
export function cleanSourceQuestionNumbering(questions) {
    const detected = questions.map((question) => {
        for (const {style, expression} of SOURCE_QUESTION_NUMBER_PATTERNS) {
            const match = question.text.match(expression);
            if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) >= 1) {
                return {
                    style,
                    number: Number(match[1]),
                    text: match[2].trim(),
                };
            }
        }
        return null;
    });
    if (detected.every((item) => item === null)) {
        return questions;
    }
    return questions.map((question, index) =>
        detected[index]
            ? {
                  ...question,
                  text: detected[index].text,
              }
            : question,
    );
}
/**
 *
 * @param {*} rows
 * @param {*} roles
 * @param {*} rowLocations
 */
export function questionsFromCsvRows(rows, roles, rowLocations = []) {
    if (rows.length < 2) {
        return [];
    }
    const questionIndex = roles.indexOf("question");
    const correctIndex = roles.indexOf("correct");
    const booleanIndex = roles.indexOf("boolean");
    const answerGroups = new Map();
    roles.forEach((role, index) => {
        const match = role.match(/^answer(?:-(fraction|tolerance|feedback))?:(.+)$/u);
        if (!match) {
            return;
        }
        const group = answerGroups.get(match[2]) ?? {
            label: match[2],
            textIndex: -1,
            fractionIndex: -1,
            toleranceIndex: -1,
            feedbackIndex: -1,
        };
        if (match[1] === "fraction") {
            group.fractionIndex = index;
        } else if (match[1] === "tolerance") {
            group.toleranceIndex = index;
        } else if (match[1] === "feedback") {
            group.feedbackIndex = index;
        } else {
            group.textIndex = index;
        }
        answerGroups.set(match[2], group);
    });
    const answerColumns = [...answerGroups.values()].filter(({textIndex}) => textIndex >= 0);
    const orphanAnswerMetadataColumns = [...answerGroups.values()].filter(({textIndex}) => textIndex < 0);
    const booleanShorthand = answerColumns.length === 0 && booleanIndex >= 0;
    const metadataIndexes = Object.fromEntries(
        [
            "type",
            "category",
            "question_name",
            "general_feedback",
            "default_mark",
            "shuffle_answers",
            "answer_numbering",
            "single",
            "correct_feedback",
            "partially_correct_feedback",
            "incorrect_feedback",
            "case_sensitive",
            "tags",
        ].map((field) => [field, fieldIndex(roles, field)]),
    );
    return rows.slice(1).map((row, index) => {
        const questionNumber = index + 1;
        const sourceRow = rowLocations[index + 1]?.csvRow ?? index + 2;
        const sourceIssues = [];
        const questionType = optionalText(row, metadataIndexes.type).toLocaleLowerCase() || "multichoice";
        orphanAnswerMetadataColumns.forEach(({label, fractionIndex, toleranceIndex, feedbackIndex}) => {
            if (
                optionalText(row, fractionIndex) ||
                optionalText(row, toleranceIndex) ||
                optionalText(row, feedbackIndex)
            ) {
                sourceIssues.push(
                    questionDiagnostic(
                        DIAGNOSTIC_CODES.ANSWER_DATA_WITHOUT_TEXT,
                        "error",
                        uiString("js_core_answer_data_without_answer_text"),
                        uiString("js_core_answer_contains_scoring_or_feedback_but_has_no_a", {
                            p0: label,
                        }),
                        questionNumber,
                        {
                            answerIndex: label,
                        },
                    ),
                );
            }
        });
        if (booleanShorthand) {
            const rawValue = String(row[booleanIndex] ?? "").trim();
            const semanticValue = normalizeBooleanValue(rawValue);
            const question = makeQuestion(
                questionNumber,
                questionIndex >= 0 ? row[questionIndex] : "",
                semanticValue === null
                    ? []
                    : [
                          {
                              label: "A",
                              text: "true",
                          },
                          {
                              label: "B",
                              text: "false",
                          },
                      ],
                semanticValue === null ? [] : [semanticValue ? "A" : "B"],
                {
                    sourceRow,
                    type: questionType === "truefalse" ? "truefalse" : "multichoice",
                },
            );
            return {
                ...question,
                booleanShorthand: {
                    rawValue,
                    semanticValue,
                },
            };
        }
        const correctLabels = correctIndex >= 0 ? normalizeCorrectLabels(row[correctIndex]) : [];
        const hasFractionColumns = answerColumns.some(({fractionIndex}) => fractionIndex >= 0);
        const hasExplicitFractionValues = answerColumns.some(
            ({fractionIndex}) => optionalText(row, fractionIndex) !== "",
        );
        if (hasExplicitFractionValues && correctLabels.length) {
            sourceIssues.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.SCORING_METHOD_CONFLICT,
                    "error",
                    uiString("js_core_conflicting_scoring_methods"),
                    uiString("js_core_this_question_uses_both_correct_and_explicit_ans"),
                    questionNumber,
                    {
                        field: "correct",
                    },
                ),
            );
        }
        const answers = answerColumns.flatMap(
            ({label, textIndex, fractionIndex, toleranceIndex, feedbackIndex}) => {
                const text = optionalText(row, textIndex);
                const fractionText = optionalText(row, fractionIndex);
                const toleranceText = optionalText(row, toleranceIndex);
                const feedback = optionalText(row, feedbackIndex);
                if (!text) {
                    if (fractionText || toleranceText || feedback) {
                        sourceIssues.push(
                            questionDiagnostic(
                                DIAGNOSTIC_CODES.ANSWER_DATA_WITHOUT_TEXT,
                                "error",
                                uiString("js_core_answer_data_without_answer_text"),
                                uiString("js_core_answer_contains_scoring_or_feedback_but_has_no_a", {
                                    p0: label,
                                }),
                                questionNumber,
                                {
                                    answerIndex: label,
                                },
                            ),
                        );
                    }
                    return [];
                }
                const answer = {
                    label,
                    text,
                    feedback,
                };
                if (["shortanswer", "numerical"].includes(questionType) && !correctLabels.length) {
                    answer.fraction = fractionText
                        ? parseOptionalNumber(
                              fractionText,
                              `answer_${label}_fraction`,
                              questionNumber,
                              sourceIssues,
                              {
                                  minimum: -100,
                                  maximum: 100,
                              },
                          )
                        : 100;
                } else if (hasFractionColumns && !correctLabels.length) {
                    if (!fractionText) {
                        sourceIssues.push(
                            questionDiagnostic(
                                DIAGNOSTIC_CODES.MISSING_ANSWER_FRACTION,
                                "error",
                                uiString("js_core_answer_fraction_is_missing"),
                                uiString("js_core_answer_has_answer_text_but_no_explicit_fraction_", {
                                    p0: label,
                                }),
                                questionNumber,
                                {
                                    field: `answer_${label}_fraction`,
                                    answerIndex: label,
                                },
                            ),
                        );
                        answer.fraction = Number.NaN;
                    } else {
                        answer.fraction = parseOptionalNumber(
                            fractionText,
                            `answer_${label}_fraction`,
                            questionNumber,
                            sourceIssues,
                            {
                                minimum: -100,
                                maximum: 100,
                            },
                        );
                    }
                }
                if (questionType === "numerical") {
                    answer.tolerance = parseNumericalTolerance(
                        toleranceText,
                        `answer_${label}_tolerance`,
                        questionNumber,
                        sourceIssues,
                    );
                }
                return [answer];
            },
        );
        const defaultMark = parseOptionalNumber(
            optionalText(row, metadataIndexes.default_mark),
            "default_mark",
            questionNumber,
            sourceIssues,
        );
        const metadata = {
            type: questionType,
            category: optionalText(row, metadataIndexes.category),
            questionName: optionalText(row, metadataIndexes.question_name),
            generalFeedback: optionalText(row, metadataIndexes.general_feedback),
            defaultMark,
            shuffleAnswers: parseOptionalBoolean(
                optionalText(row, metadataIndexes.shuffle_answers),
                "shuffle_answers",
                questionNumber,
                sourceIssues,
            ),
            answerNumbering: parseOptionalAnswerNumbering(
                optionalText(row, metadataIndexes.answer_numbering),
                questionNumber,
                sourceIssues,
            ),
            single: parseOptionalBoolean(
                optionalText(row, metadataIndexes.single),
                "single",
                questionNumber,
                sourceIssues,
            ),
            correctFeedback: optionalText(row, metadataIndexes.correct_feedback),
            partiallyCorrectFeedback: optionalText(row, metadataIndexes.partially_correct_feedback),
            incorrectFeedback: optionalText(row, metadataIndexes.incorrect_feedback),
            caseSensitive:
                questionType === "shortanswer"
                    ? parseCaseSensitive(
                          optionalText(row, metadataIndexes.case_sensitive),
                          questionNumber,
                          sourceIssues,
                      )
                    : false,
            tags: parseTags(optionalText(row, metadataIndexes.tags)),
            sourceRow,
            sourceIssues,
        };
        return makeQuestion(
            questionNumber,
            questionIndex >= 0 ? row[questionIndex] : "",
            answers,
            hasExplicitFractionValues ? [] : correctLabels,
            metadata,
        );
    });
}
/**
 *
 * @param {*} text
 * @param {*} rolesOverride
 */
export function parseCsv(text, rolesOverride = null) {
    const cleanText = checkXmlSource(text).replace(/^\uFEFF/u, "");
    const parsed = parseDelimited(cleanText);
    const width = Math.max(...parsed.rows.map((row) => row.length));
    const headers = parsed.rows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
    while (headers.length < width) {
        headers.push(`Column ${headers.length + 1}`);
    }
    const mapping = detectCsvMapping(headers, parsed.rowLocations[0]);
    const roles = rolesOverride ?? mapping.roles;
    return {
        format: "CSV",
        encoding: "UTF-8",
        delimiter: parsed.delimiter,
        headers,
        rows: parsed.rows,
        rowLocations: parsed.rowLocations,
        mapping: {
            ...mapping,
            roles,
        },
        questions: questionsFromCsvRows(parsed.rows, roles, parsed.rowLocations),
        fileIssues: rolesOverride ? resolveCsvMappingIssues(mapping.issues, roles) : mapping.issues,
    };
}
/**
 *
 * @param {*} text
 */
export function parseTxt(text) {
    const lines = checkXmlSource(text)
        .replace(/^\uFEFF/u, "")
        .split(/\r\n|\r|\n/u);
    const questions = [];
    const fileIssues = [];
    let promptLines = [];
    let answers = [];
    let sourceLine = 1;
    /**
     *
     * @param {*} nextLine
     */
    function reset(nextLine) {
        promptLines = [];
        answers = [];
        sourceLine = nextLine;
    }
    /**
     *
     * @param {*} correctValue
     * @param {*} answerLine
     */
    function finish(correctValue, answerLine) {
        const textValue = promptLines.join("\n").trim();
        if (!textValue && answers.length === 0) {
            fileIssues.push(
                importDiagnostic(
                    DIAGNOSTIC_CODES.TXT_ANSWER_KEY_WITHOUT_QUESTION,
                    "error",
                    uiString("js_core_answer_key_without_a_question"),
                    uiString("js_core_line_has_an_answer_key_without_a_question_add_th", {
                        p0: answerLine,
                    }),
                    {
                        metadata: {
                            line: answerLine,
                        },
                    },
                ),
            );
        } else {
            questions.push(
                makeQuestion(questions.length + 1, textValue, answers, normalizeCorrectLabels(correctValue), {
                    sourceLine,
                }),
            );
        }
        reset(answerLine + 1);
    }
    lines.forEach((rawLine, index) => {
        const lineNumber = index + 1;
        const line = rawLine.trim();
        if (!line) {
            return;
        }
        const keyMatch = line.match(/^(?:answer|correct\s*answers?|answer\s*key|key)\s*:\s*(.*)$/iu);
        if (keyMatch) {
            finish(keyMatch[1], lineNumber);
            return;
        }
        const answerMatch = line.match(/^([\p{L}\d])\s*[.):]\s*(.*)$/iu);
        if (answerMatch && promptLines.length > 0) {
            answers.push({
                label: answerMatch[1].toUpperCase(),
                text: answerMatch[2],
            });
            return;
        }
        if (answers.length > 0) {
            fileIssues.push(
                importDiagnostic(
                    DIAGNOSTIC_CODES.TXT_AMBIGUOUS_STRUCTURE,
                    "error",
                    uiString("js_core_ambiguous_txt_structure"),
                    uiString("js_core_line_is_ambiguous_add_an_answer_line_before_the_", {
                        p0: lineNumber,
                    }),
                    {
                        metadata: {
                            line: lineNumber,
                        },
                    },
                ),
            );
        }
        if (promptLines.length === 0) {
            sourceLine = lineNumber;
        }
        promptLines.push(line);
    });
    if (promptLines.length || answers.length) {
        fileIssues.push(
            importDiagnostic(
                DIAGNOSTIC_CODES.TXT_ANSWER_KEY_MISSING,
                "error",
                uiString("js_core_answer_key_is_missing"),
                uiString("js_core_the_question_beginning_on_line_is_missing_an_ans", {
                    p0: sourceLine,
                }),
                {
                    metadata: {
                        line: sourceLine,
                    },
                },
            ),
        );
        questions.push(
            makeQuestion(questions.length + 1, promptLines.join("\n"), answers, [], {
                sourceLine,
            }),
        );
    }
    if (questions.length === 0 && fileIssues.length === 0) {
        fileIssues.push(
            importDiagnostic(
                DIAGNOSTIC_CODES.NO_SUPPORTED_QUESTIONS,
                "error",
                uiString("js_core_no_questions_detected"),
                uiString("js_core_uniquiz_could_not_identify_any_supported_questio"),
            ),
        );
    }
    return {
        format: "TXT",
        encoding: "UTF-8",
        questions,
        fileIssues,
    };
}
/**
 *
 * @param {*} text
 * @param {*} maximum
 */
export function unicodeExcerpt(text, maximum = 50) {
    const normalized = String(text ?? "")
        .trim()
        .replace(/\s+/gu, " ");
    return Array.from(normalized).slice(0, maximum).join("");
}
/**
 *
 * @param {*} text
 * @param {*} locale
 */
export function capitalizeFirst(text, locale) {
    const characters = Array.from(String(text ?? ""));
    if (characters.length === 0) {
        return "";
    }
    return characters[0].toLocaleUpperCase(locale) + characters.slice(1).join("");
}
/**
 *
 * @param {*} questions
 * @param {*} settings
 */
export function applySettings(questions, settings) {
    const normalizedQuestions =
        settings.removeQuestionNumbering === false ? questions : cleanSourceQuestionNumbering(questions);
    return normalizedQuestions.map((question, index) => ({
        ...question,
        name:
            question.questionName ||
            (settings.generateNames
                ? unicodeExcerpt(question.text, 50) || `Question ${question.sourceIndex ?? index + 1}`
                : `Question ${question.sourceIndex ?? index + 1}`),
        category: question.category || String(settings.category ?? "").trim(),
        defaultMark: question.type === "description" ? 0 : (question.defaultMark ?? 1),
        shuffleAnswers: question.shuffleAnswers ?? Boolean(settings.shuffleAnswers),
        answerNumbering: question.answerNumbering ?? settings.answerNumbering,
        single:
            question.single ?? question.answers.filter(({fraction}) => Number(fraction) > 0).length === 1,
        settings: {
            ...settings,
            shuffleAnswers: question.shuffleAnswers ?? Boolean(settings.shuffleAnswers),
            answerNumbering: question.answerNumbering ?? settings.answerNumbering,
        },
        answers: question.answers.map((answer) => ({
            ...answer,
            transformedText:
                settings.capitalizeAnswers && ["multichoice", "truefalse"].includes(question.type)
                    ? capitalizeFirst(answer.originalText)
                    : answer.originalText,
        })),
    }));
}
/**
 *
 * @param {*} value
 * @param {*} scope
 * @param {*} sourceIndex
 */
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
        code: (() => {
            if (scope === "import") {
                if (severity === "warning") {
                    return DIAGNOSTIC_CODES.IMPORT_WARNING;
                } else {
                    return DIAGNOSTIC_CODES.IMPORT_ERROR;
                }
            } else {
                if (severity === "warning") {
                    return DIAGNOSTIC_CODES.IMPORT_WARNING;
                } else {
                    return DIAGNOSTIC_CODES.IMPORT_ERROR;
                }
            }
        })(),
        severity,
        title:
            severity === "warning"
                ? uiString("js_core_review_recommended")
                : uiString("js_core_issue_requires_attention"),
        message: String(value?.message ?? uiString("js_core_review_this_issue_before_exporting")),
        sourceIndex: scope === "question" ? sourceIndex : null,
        scope,
    });
}
/**
 *
 * @param {*} diagnostics
 */
function deduplicateDiagnostics(diagnostics) {
    const seen = new Set();
    return diagnostics.filter((diagnostic) => {
        const key = [
            diagnostic.code,
            diagnostic.severity,
            diagnostic.sourceIndex,
            diagnostic.field,
            diagnostic.answerIndex,
        ].join("|");
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
/**
 *
 * @param {*} diagnostics
 */
export function classifyQuestionStatus(diagnostics = []) {
    if (diagnostics.some(({severity}) => severity === "error")) {
        return "error";
    }
    if (diagnostics.some(({severity}) => severity === "warning")) {
        return "warning";
    }
    return "ready";
}
/**
 *
 * @param {*} value
 */
function diagnosticNumber(value) {
    return Number(value.toFixed(7)).toString();
}
/**
 *
 * @param {*} questions
 * @param {*} importDiagnostics
 */
export function summarizeDiagnostics(questions, importDiagnostics = []) {
    const counts = {
        ready: 0,
        warning: 0,
        error: 0,
    };
    questions.forEach((question) => {
        const status =
            question.status ??
            classifyQuestionStatus(question.diagnostics ?? question.validationIssues ?? []);
        counts[status] += 1;
    });
    const importErrors = importDiagnostics.filter(({severity}) => severity === "error");
    const importWarnings = importDiagnostics.filter(({severity}) => severity === "warning");
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
/**
 *
 * @param {*} summary
 */
export function formatReadinessSummary(summary) {
    if (summary.total === 0) {
        return {
            heading: uiString("js_core_no_questions_detected"),
            counts: "",
            supporting: uiString("js_core_uniquiz_could_not_identify_any_supported_questio"),
            status: uiString("js_core_export_blocked"),
            blocked: true,
        };
    }
    const total = summary.total.toLocaleString(uiLocale());
    const questionNoun = summary.total === 1 ? uiString("js_core_question_2") : uiString("js_core_questions");
    const hasErrors = summary.error > 0 || summary.importErrorCount > 0;
    const hasWarnings = summary.warning > 0 || summary.importWarningCount > 0;
    if (!hasErrors && !hasWarnings) {
        return {
            heading: uiString("js_core_ready_for_moodle", {
                p0: total,
                p1: questionNoun,
            }),
            counts: "",
            supporting: uiString("js_core_no_issues_detected"),
            status: uiString("js_core_ready_to_export"),
            blocked: false,
        };
    }
    const warningLabel =
        summary.warning === 1 ? uiString("js_core_with_warning") : uiString("js_core_with_warnings");
    const errorLabel = summary.error === 1 ? uiString("js_core_with_error") : uiString("js_core_with_errors");
    const counts = uiString("js_core_ready", {
        p0: summary.ready.toLocaleString(uiLocale()),
        p1: summary.warning.toLocaleString(uiLocale()),
        p2: warningLabel,
        p3: summary.error.toLocaleString(uiLocale()),
        p4: errorLabel,
    });
    if (hasErrors) {
        let supporting;
        if (summary.error === 1) {
            supporting = uiString("js_core_1_question_contains_an_error_that_must_be_resolv");
        } else if (summary.error > 1) {
            supporting = uiString("js_core_questions_contain_errors_that_must_be_resolved_b", {
                p0: summary.error.toLocaleString(uiLocale()),
            });
        } else {
            supporting = uiString("js_core_import_errors_must_be_resolved_before_export");
        }
        return {
            heading: uiString("js_core_found", {
                p0: total,
                p1: questionNoun,
            }),
            counts,
            supporting,
            status: uiString("js_core_export_blocked"),
            blocked: true,
        };
    }
    return {
        heading: uiString("js_core_found", {
            p0: total,
            p1: questionNoun,
        }),
        counts,
        supporting: uiString("js_core_warnings_do_not_prevent_export_but_reviewing_the"),
        status: uiString("js_core_ready_to_export_with_warnings"),
        blocked: false,
    };
}
/**
 *
 * @param {*} diagnostic
 * @param {*} question
 */
function addQuestionSourceLocation(diagnostic, question) {
    const csvRow = positiveInteger(question.sourceRow);
    const line = positiveInteger(question.sourceLine);
    if (!csvRow && !line) {
        return diagnostic;
    }
    return {
        ...diagnostic,
        metadata: {
            ...(diagnostic.metadata ?? {}),
            ...(csvRow
                ? {
                      csvRow,
                  }
                : {}),
            ...(line
                ? {
                      line,
                  }
                : {}),
        },
    };
}
/**
 *
 * @param {*} questions
 * @param {*} fileIssues
 */
export function validateQuestions(questions, fileIssues = []) {
    const importDiagnostics = fileIssues.map((value) => normalizeDiagnostic(value, "import"));
    const validated = questions.map((question, index) => {
        const number = question.sourceIndex ?? index + 1;
        const own = (question.sourceIssues ?? []).map((value) =>
            normalizeDiagnostic(value, "question", number),
        );
        validateQuestionContent(question, number, own);
        if (["essay", "description"].includes(question.type)) {
            if (
                question.type === "essay" &&
                question.defaultMark !== null &&
                (!Number.isFinite(question.defaultMark) || question.defaultMark <= 0)
            ) {
                own.push(
                    questionDiagnostic(
                        DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK,
                        "error",
                        uiString("js_core_invalid_default_mark"),
                        uiString("js_core_the_default_mark_must_be_greater_than_0_enter_a_"),
                        number,
                        {
                            field: "default_mark",
                            metadata: {
                                rawValue: question.defaultMark,
                            },
                        },
                    ),
                );
            }
            const diagnostics = deduplicateDiagnostics(
                own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)),
            );
            const status = classifyQuestionStatus(diagnostics);
            return {
                ...question,
                diagnostics,
                validationIssues: diagnostics,
                status,
            };
        }
        const invalidBooleanShorthand = question.booleanShorthand?.semanticValue === null;
        if (invalidBooleanShorthand) {
            const found = question.booleanShorthand.rawValue;
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.INVALID_BOOLEAN_VALUE,
                    "error",
                    uiString("js_core_invalid_true_false_answer"),
                    found
                        ? uiString("js_core_is_not_a_supported_true_false_answer_use_true_or", {
                              p0: found,
                          })
                        : uiString("js_core_the_true_false_answer_is_empty_enter_true_or_fal"),
                    number,
                    {
                        field: "boolean_value",
                        metadata: {
                            rawValue: found,
                        },
                    },
                ),
            );
            const diagnostics = deduplicateDiagnostics(
                own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)),
            );
            const status = classifyQuestionStatus(diagnostics);
            return {
                ...question,
                diagnostics,
                validationIssues: diagnostics,
                status,
            };
        }
        const labels = question.answers.map((answer) => answer.label);
        const duplicateLabels = labels.filter((label, labelIndex) => labels.indexOf(label) !== labelIndex);
        if (duplicateLabels.length) {
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.DUPLICATE_ANSWER_LABEL,
                    "error",
                    uiString("js_core_duplicate_answer_label"),
                    uiString("js_core_answer_label_is_used_more_than_once_give_each_an", {
                        p0: duplicateLabels[0],
                    }),
                    number,
                    {
                        answerIndex: duplicateLabels[0],
                    },
                ),
            );
        }
        const usable = question.answers.filter((answer) => answer.originalText.trim());
        if (["multichoice", "truefalse"].includes(question.type) && usable.length < 2) {
            own.push(
                questionDiagnostic(
                    DIAGNOSTIC_CODES.TOO_FEW_ANSWERS,
                    "error",
                    uiString("js_core_not_enough_answers"),
                    uiString("js_core_multiple_choice_questions_need_at_least_two_non_"),
                    number,
                    {
                        field: "answers",
                    },
                ),
            );
        }
        const seenTexts = new Map();
        usable.forEach((answer, answerIndex) => {
            const key = answer.originalText.normalize("NFKC").trim().toLocaleLowerCase();
            if (seenTexts.has(key)) {
                const first = seenTexts.get(key);
                own.push(
                    questionDiagnostic(
                        DIAGNOSTIC_CODES.DUPLICATE_ANSWER_TEXT,
                        "warning",
                        uiString("js_core_duplicate_answer_text"),
                        uiString("js_core_answers_and_contain_the_same_text_the_question_c", {
                            p0: first + 1,
                            p1: answerIndex + 1,
                        }),
                        number,
                        {
                            answerIndex: answerIndex + 1,
                            metadata: {
                                matchingAnswerIndex: first + 1,
                            },
                        },
                    ),
                );
            } else {
                seenTexts.set(key, answerIndex);
            }
        });
        if (["shortanswer", "numerical"].includes(question.type)) {
            question.answers.forEach((answer, answerIndex) => {
                if (!Number.isFinite(answer.fraction) || answer.fraction < -100 || answer.fraction > 100) {
                    own.push(
                        questionDiagnostic(
                            DIAGNOSTIC_CODES.INVALID_ANSWER_FRACTION,
                            "error",
                            uiString("js_core_invalid_answer_fraction"),
                            uiString("js_core_is_not_a_valid_answer_fraction_use_a_number_from", {
                                p0: String(answer.fraction),
                            }),
                            number,
                            {
                                field: `answer_${answer.label}_fraction`,
                                answerIndex: answer.label,
                                metadata: {
                                    answerPosition: answerIndex + 1,
                                    rawValue: answer.fraction,
                                },
                            },
                        ),
                    );
                }
                if (question.type === "numerical") {
                    const numericText = answer.originalText.trim();
                    if (
                        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(numericText) ||
                        !Number.isFinite(Number(numericText))
                    ) {
                        own.push(
                            questionDiagnostic(
                                DIAGNOSTIC_CODES.INVALID_NUMERICAL_ANSWER,
                                "error",
                                uiString("js_core_invalid_numerical_answer"),
                                uiString("js_core_is_not_a_valid_number_enter_a_finite_integer_or_", {
                                    p0: numericText,
                                }),
                                number,
                                {
                                    field: `answer_${answer.label}`,
                                    answerIndex: answer.label,
                                    metadata: {
                                        answerPosition: answerIndex + 1,
                                        rawValue: numericText,
                                    },
                                },
                            ),
                        );
                    }
                    if (!Number.isFinite(answer.tolerance) || answer.tolerance < 0) {
                        own.push(
                            questionDiagnostic(
                                DIAGNOSTIC_CODES.INVALID_NUMERICAL_TOLERANCE,
                                "error",
                                uiString("js_core_invalid_numerical_tolerance"),
                                uiString("js_core_numerical_tolerance_must_be_zero_or_a_non_negati"),
                                number,
                                {
                                    field: `answer_${answer.label}_tolerance`,
                                    answerIndex: answer.label,
                                    metadata: {
                                        answerPosition: answerIndex + 1,
                                        rawValue: answer.tolerance,
                                    },
                                },
                            ),
                        );
                    }
                }
            });
            const positiveAnswers = question.answers.filter(
                ({fraction}) => Number.isFinite(fraction) && fraction > 0,
            );
            if (positiveAnswers.length === 0) {
                own.push(
                    questionDiagnostic(
                        DIAGNOSTIC_CODES.NO_POSITIVE_ANSWER,
                        "error",
                        question.type === "shortanswer"
                            ? uiString("js_core_no_accepted_short_answer")
                            : uiString("js_core_no_accepted_numerical_answer"),
                        question.type === "shortanswer"
                            ? uiString("js_core_short_answer_question_has_no_accepted_answer_add")
                            : uiString("js_core_numerical_question_has_no_accepted_answer_add_at"),
                        number,
                        {
                            field: "answers",
                        },
                    ),
                );
            }
            if (
                question.defaultMark !== null &&
                (!Number.isFinite(question.defaultMark) || question.defaultMark <= 0)
            ) {
                own.push(
                    questionDiagnostic(
                        DIAGNOSTIC_CODES.INVALID_DEFAULT_MARK,
                        "error",
                        uiString("js_core_invalid_default_mark"),
                        uiString("js_core_the_default_mark_must_be_greater_than_0_enter_a_"),
                        number,
                        {
                            field: "default_mark",
                            metadata: {
                                rawValue: question.defaultMark,
                            },
                        },
                    ),
                );
            }
            const diagnostics = deduplicateDiagnostics(
                own.map((diagnostic) => addQuestionSourceLocation(diagnostic, question)),
            );
            const status = classifyQuestionStatus(diagnostics);
            return {
                ...question,
                diagnostics,
                validationIssues: diagnostics,
                status,
            };
        }
        return validateChoiceQuestion(question, number, own, usable, labels);
    });
    const questionDiagnostics = validated.flatMap(({diagnostics}) => diagnostics);
    const issues = [...importDiagnostics, ...questionDiagnostics];
    const readiness = summarizeDiagnostics(validated, importDiagnostics);
    return {
        questions: validated,
        importDiagnostics,
        questionDiagnostics,
        issues,
        errors: issues.filter(({severity}) => severity === "error"),
        warnings: issues.filter(({severity}) => severity === "warning"),
        readiness,
        canExport: readiness.canExport,
    };
}
/**
 *
 * @param {*} questions
 */
export function summarizeQuestions(questions) {
    const choiceQuestions = questions.filter(({type}) => ["multichoice", "truefalse"].includes(type));
    const single = choiceQuestions.filter(
        (question) =>
            question.single ?? question.answers.filter(({fraction}) => Number(fraction) > 0).length === 1,
    ).length;
    const multiple = choiceQuestions.length - single;
    return {
        total: questions.length,
        single,
        multiple,
        other: questions.length - choiceQuestions.length,
    };
}
/**
 *
 * @param {*} value
 */
export function escapeXml(value) {
    return checkXmlSource(value)
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/"/gu, "&quot;")
        .replace(/'/gu, "&apos;");
}

/**
 * Encode plain source text as HTML, then encode that HTML for the XML envelope.
 * @param {*} value
 */
export function escapeMoodleHtml(value) {
    const html = checkXmlSource(value)
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/\r\n|\r|\n/gu, "<br>");
    return escapeXml(html);
}
/**
 *
 * @param {*} correctCount
 */
export function formatFraction(correctCount) {
    if (!Number.isInteger(correctCount) || correctCount < 1) {
        throw new Error(uiString("js_core_a_question_must_have_a_correct_answer"));
    }
    return (100 / correctCount)
        .toFixed(7)
        .replace(/\.0+$/u, "")
        .replace(/(\.\d*?)0+$/u, "$1");
}
/**
 *
 * @param {*} value
 * @param {*} decimals
 */
function formatMoodleNumber(value, decimals = 7) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new Error(uiString("js_core_moodle_numeric_values_must_be_finite"));
    }
    return number
        .toFixed(decimals)
        .replace(/\.0+$/u, "")
        .replace(/(\.\d*?)0+$/u, "$1");
}
/**
 *
 * @param {*} category
 */
function categoryPath(category) {
    const trimmed = String(category ?? "")
        .trim()
        .replace(/^\$course\$\/top\/?/u, "");
    return trimmed ? `$course$/top/${trimmed}` : "$course$/top";
}
/**
 *
 * @param {*} lines
 * @param {*} question
 */
function appendQuestionTags(lines, question) {
    if (!question.tags?.length) {
        return;
    }
    lines.push("    <tags>");
    question.tags.forEach((tag) => lines.push(`      <tag><text>${escapeXml(tag)}</text></tag>`));
    lines.push("    </tags>");
}
/**
 *
 * @param {*} questions
 * @param {*} settings
 */
export function generateMoodleXml(questions, settings) {
    if (!ANSWER_NUMBERING.has(settings.answerNumbering)) {
        throw new Error(uiString("js_core_unsupported_answer_numbering_setting"));
    }
    const validation = validateQuestions(questions);
    if (validation.errors.length) {
        throw new Error(validation.errors[0].message);
    }
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<quiz>"];
    let activeCategory = null;
    questions.forEach((question) => {
        activeCategory = appendCategory(lines, question, settings, activeCategory);
        if (["shortanswer", "numerical"].includes(question.type)) {
            lines.push(
                `  <question type="${question.type}">`,
                `    <name><text>${escapeXml(question.name)}</text></name>`,
                `    <questiontext format="html"><text>${escapeMoodleHtml(question.text)}</text></questiontext>`,
                '    <generalfeedback format="html"><text>' +
                    `${escapeMoodleHtml(question.generalFeedback)}` +
                    "</text></generalfeedback>",
                `    <defaultgrade>${formatMoodleNumber(question.defaultMark ?? 1)}</defaultgrade>`,
                "    <penalty>0.3333333</penalty>",
                "    <hidden>0</hidden>",
                "    <idnumber></idnumber>",
            );
            if (question.type === "shortanswer") {
                lines.push(`    <usecase>${question.caseSensitive ? "1" : "0"}</usecase>`);
            }
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
                '    <generalfeedback format="html"><text>' +
                    `${escapeMoodleHtml(question.generalFeedback)}` +
                    "</text></generalfeedback>",
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
                '    <generalfeedback format="html"><text>' +
                    `${escapeMoodleHtml(question.generalFeedback)}` +
                    "</text></generalfeedback>",
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
                '    <generalfeedback format="html"><text>' +
                    `${escapeMoodleHtml(question.generalFeedback)}` +
                    "</text></generalfeedback>",
                `    <defaultgrade>${formatMoodleNumber(question.defaultMark ?? 1)}</defaultgrade>`,
                "    <penalty>1</penalty>",
                "    <hidden>0</hidden>",
                "    <idnumber></idnumber>",
            );
            ["true", "false"].forEach((value) => {
                const answer = question.answers.find(
                    ({originalText}) => originalText.trim().toLocaleLowerCase() === value,
                );
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
        const positiveCount = question.answers.filter(({fraction}) => Number(fraction) > 0).length;
        const isSingle = question.single ?? positiveCount === 1;
        lines.push(
            '  <question type="multichoice">',
            `    <name><text>${escapeXml(question.name)}</text></name>`,
            `    <questiontext format="html"><text>${escapeMoodleHtml(question.text)}</text></questiontext>`,
            '    <generalfeedback format="html"><text>' +
                `${escapeMoodleHtml(question.generalFeedback)}` +
                "</text></generalfeedback>",
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
            lines.push(
                '    <correctfeedback format="html"><text>' +
                    `${escapeMoodleHtml(question.correctFeedback)}` +
                    "</text></correctfeedback>",
            );
        }
        if (question.partiallyCorrectFeedback) {
            lines.push(
                '    <partiallycorrectfeedback format="html"><text>' +
                    `${escapeMoodleHtml(question.partiallyCorrectFeedback)}` +
                    "</text></partiallycorrectfeedback>",
            );
        }
        if (question.incorrectFeedback) {
            lines.push(
                '    <incorrectfeedback format="html"><text>' +
                    `${escapeMoodleHtml(question.incorrectFeedback)}` +
                    "</text></incorrectfeedback>",
            );
        }
        appendQuestionTags(lines, question);
        lines.push("  </question>");
    });
    lines.push("</quiz>");
    return lines.join("\n");
}
/**
 *
 * @param {*} xml
 * @param {*} Parser
 */
export function validateGeneratedXml(xml, Parser = globalThis.DOMParser) {
    const errors = [];
    if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
        errors.push(uiString("js_core_the_xml_declaration_is_missing_or_is_not_the_fir"));
    }
    if (typeof Parser !== "function") {
        return {
            valid: false,
            errors: [uiString("js_core_an_xml_parser_is_not_available_in_this_browser")],
        };
    }
    const document = new Parser().parseFromString(xml, "application/xml");
    const parseError = document.querySelector("parsererror");
    if (parseError) {
        return {
            valid: false,
            errors: [uiString("js_core_the_generated_xml_is_not_well_formed")],
        };
    }
    if (document.documentElement?.tagName !== "quiz") {
        errors.push(uiString("js_core_the_generated_xml_does_not_have_a_quiz_root"));
    }
    const questions = [...document.querySelectorAll('question[type="multichoice"]')];
    questions.forEach((question, index) => {
        const label = uiString("js_core_question", {
            p0: index + 1,
        });
        if (!hasXmlText(question, "name > text")) {
            errors.push(
                uiString("js_core_has_no_name", {
                    p0: label,
                }),
            );
        }
        if (!hasXmlText(question, "questiontext > text")) {
            errors.push(
                uiString("js_core_has_no_question_text", {
                    p0: label,
                }),
            );
        }
        const answers = [...question.querySelectorAll(":scope > answer")];
        if (answers.length < 2) {
            errors.push(
                uiString("js_core_has_fewer_than_two_answers", {
                    p0: label,
                }),
            );
        }
        const fractions = answers.map((answer) => Number(answer.getAttribute("fraction")));
        const positive = fractions.filter((value) => value > 0);
        if (
            !positive.length ||
            fractions.some((value) => !Number.isFinite(value) || value < -100 || value > 100)
        ) {
            errors.push(
                uiString("js_core_has_invalid_grading_fractions", {
                    p0: label,
                }),
            );
        }
        const total = positive.reduce((sum, value) => sum + value, 0);
        if (Math.abs(total - 100) > 0.0011) {
            errors.push(
                uiString("js_core_grading_totals_not_100", {
                    p0: label,
                    p1: total,
                }),
            );
        }
        const single = question.querySelector(":scope > single")?.textContent === "true";
        if (single && positive.length !== 1) {
            errors.push(
                uiString("js_core_has_an_inconsistent_single_answer_setting", {
                    p0: label,
                }),
            );
        }
        const numbering = question.querySelector(":scope > answernumbering")?.textContent;
        if (!ANSWER_NUMBERING.has(numbering)) {
            errors.push(
                uiString("js_core_has_unsupported_answer_numbering", {
                    p0: label,
                }),
            );
        }
        const defaultGrade = Number(question.querySelector(":scope > defaultgrade")?.textContent);
        if (!isPositiveFinite(defaultGrade)) {
            errors.push(
                uiString("js_core_has_an_invalid_default_grade", {
                    p0: label,
                }),
            );
        }
    });
    const additionalQuestions = [
        ...document.querySelectorAll(
            'question[type="truefalse"], question[type="shortanswer"], question[type="numeric' +
                'al"], question[type="essay"], question[type="description"]',
        ),
    ];
    additionalQuestions.forEach((question, index) => {
        const type = question.getAttribute("type");
        const label = uiString("js_core_question", {
            p0: questions.length + index + 1,
        });
        if (!hasXmlText(question, "name > text")) {
            errors.push(
                uiString("js_core_has_no_name", {
                    p0: label,
                }),
            );
        }
        if (!hasXmlText(question, "questiontext > text")) {
            errors.push(
                uiString("js_core_has_no_question_text", {
                    p0: label,
                }),
            );
        }
        const defaultGrade = Number(question.querySelector(":scope > defaultgrade")?.textContent);
        if (type === "description") {
            if (defaultGrade !== 0) {
                errors.push(
                    uiString("js_core_description_has_a_non_zero_default_grade", {
                        p0: label,
                    }),
                );
            }
        } else if (!isPositiveFinite(defaultGrade)) {
            errors.push(
                uiString("js_core_has_an_invalid_default_grade", {
                    p0: label,
                }),
            );
        }
        const answers = [...question.querySelectorAll(":scope > answer")];
        if (["shortanswer", "numerical"].includes(type)) {
            if (answers.length < 1) {
                errors.push(
                    uiString("js_core_has_no_accepted_answers", {
                        p0: label,
                    }),
                );
            }
            const fractions = answers.map((answer) => Number(answer.getAttribute("fraction")));
            if (
                !fractions.some((value) => value > 0) ||
                fractions.some((value) => !Number.isFinite(value) || value < -100 || value > 100)
            ) {
                errors.push(
                    uiString("js_core_has_invalid_grading_fractions", {
                        p0: label,
                    }),
                );
            }
        }
        if (
            type === "shortanswer" &&
            !["0", "1"].includes(question.querySelector(":scope > usecase")?.textContent)
        ) {
            errors.push(
                uiString("js_core_has_an_invalid_case_sensitivity_setting", {
                    p0: label,
                }),
            );
        }
        if (type === "numerical") {
            answers.forEach((answer) => {
                const numericAnswer = Number(answer.querySelector(":scope > text")?.textContent);
                const tolerance = Number(answer.querySelector(":scope > tolerance")?.textContent);
                if (!Number.isFinite(numericAnswer)) {
                    errors.push(
                        uiString("js_core_has_an_invalid_numerical_answer", {
                            p0: label,
                        }),
                    );
                }
                if (!Number.isFinite(tolerance) || tolerance < 0) {
                    errors.push(
                        uiString("js_core_has_an_invalid_numerical_tolerance", {
                            p0: label,
                        }),
                    );
                }
            });
        }
        if (type === "truefalse") {
            const values = answers
                .map((answer) => answer.querySelector(":scope > text")?.textContent?.trim())
                .sort();
            const fractions = answers.map((answer) => Number(answer.getAttribute("fraction")));
            if (
                answers.length !== 2 ||
                values[0] !== "false" ||
                values[1] !== "true" ||
                fractions.filter((value) => value > 0).length !== 1
            ) {
                errors.push(
                    uiString("js_core_has_invalid_true_false_answers", {
                        p0: label,
                    }),
                );
            }
        }
        if (["essay", "description"].includes(type) && answers.length > 0) {
            errors.push(
                uiString("js_core_should_not_contain_automatically_graded_answers", {
                    p0: label,
                }),
            );
        }
    });
    const questionCount = questions.length + additionalQuestions.length;
    if (questionCount === 0) {
        errors.push(uiString("js_core_the_xml_contains_no_supported_questions"));
    }
    return {
        valid: errors.length === 0,
        errors,
        questionCount,
    };
}
/**
 *
 * @param {*} now
 */
export function createDownloadFilename(now = new Date()) {
    const pad = (number) => String(number).padStart(2, "0");
    return (
        "uniquiz-questions-" +
        `${now.getFullYear()}` +
        `${pad(now.getMonth() + 1)}` +
        `${pad(now.getDate())}` +
        "-" +
        `${pad(now.getHours())}` +
        `${pad(now.getMinutes())}` +
        ".xml"
    );
}
