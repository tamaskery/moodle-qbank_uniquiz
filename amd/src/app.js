/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
import {string as uiString, locale as uiLocale} from 'qbank_uniquiz/i18n';
import { applySettings, createDownloadFilename, formatDiagnostic, formatReadinessSummary, generateMoodleXml, getInputDiagnostic, parseCsv, parseTxt, questionsFromCsvRows, resolveCsvMappingIssues, summarizeQuestions, validateGeneratedXml, validateQuestions } from "qbank_uniquiz/core";
import { createPreviewSearchCorpusCache, filterPreviewQuestions, formatPreviewResultRange, formatPreviewResultSummary, formatPreviewAnswerLabel, getCompactPageItems, getPreviewFilterCounts, normalizeSearchQuery, paginateQuestions } from "qbank_uniquiz/preview";
import { remainingMinimumDuration } from "qbank_uniquiz/timing";

export const init = (config) => {
const container = document.getElementById('qbank-uniquiz');
if (!container || container.dataset.initialized) return;
container.dataset.initialized = 'true';
// Included in the Moodle app initializer by build.mjs. GNU GPL v3 or later.
let importXml = '';
let importCount = 0;
let importDone = false;
let importBusy = false;
let importBlocked = false;
const importButton = container.querySelector('#uq-import');
const importConfirm = container.querySelector('#uq-confirm');
const importDestination = container.querySelector('#uq-destination');
const importStatus = container.querySelector('#uq-import-status');

function resetImport() {
    importXml = '';
    importCount = 0;
    importDone = false;
    importBlocked = false;
    importButton.disabled = true;
    importConfirm.checked = false;
    importConfirm.disabled = false;
    importDestination.disabled = false;
    importStatus.textContent = '';
    container.querySelector('#uq-return').hidden = true;
}

function prepareImport(xml, count) {
    importXml = xml;
    importCount = count;
    const countLabel = count === 1 ? config.strings.importcountsingle : config.strings.importcount;
    importButton.textContent = countLabel.replace('{$a}', String(count));
    importBlocked = count > config.maxquestions || new Blob([xml]).size > config.maxxmlbytes;
    importStatus.textContent = count > config.maxquestions
        ? config.strings.batchlimit.replace('{$a}', String(config.maxquestions))
        : importBlocked ? config.strings.xmltoolarge : '';
    importButton.disabled = importBlocked || !importConfirm.checked;
}

importConfirm.addEventListener('change', () => {
    importButton.disabled = !importConfirm.checked || !importXml || importBusy || importDone || importBlocked;
});

importButton.addEventListener('click', async () => {
    if (importBusy || importDone || importBlocked || !importConfirm.checked || !importXml) return;
    if (new Blob([importXml]).size > config.maxxmlbytes) {
        importStatus.textContent = config.strings.xmltoolarge;
        return;
    }
    importBusy = true;
    importButton.disabled = true;
    importDestination.disabled = true;
    importConfirm.disabled = true;
    container.querySelector('#new-conversion').disabled = true;
    importStatus.textContent = config.strings.importing;
    try {
        const body = new URLSearchParams({
            sesskey: config.sesskey, token: config.token, categoryid: importDestination.value,
            count: String(importCount), xml: importXml, ...config.contextparams,
        });
        const response = await fetch(config.importurl, {
            method: 'POST', credentials: 'same-origin', body,
            headers: {'Accept': 'application/json'},
        });
        let result;
        try { result = await response.json(); } catch {
            throw new Error(config.strings.noresult);
        }
        if (!response.ok || !result?.success) {
            // Moodle's AJAX handler uses `error` for failures before the importer runs.
            const message = [result?.message, result?.error].find(value => typeof value === 'string' && value.trim());
            throw new Error(message || config.strings.noresult);
        }
        importDone = true;
        importStatus.textContent = result.message;
        const returnLink = container.querySelector('#uq-return');
        returnLink.href = result.bankurl;
        returnLink.hidden = false;
        importStatus.focus();
    } catch (error) {
        importStatus.textContent = error instanceof Error ? error.message : config.strings.noresult;
    } finally {
        importBusy = false;
        importButton.disabled = importDone || !importConfirm.checked;
        importDestination.disabled = importDone;
        importConfirm.disabled = importDone;
        container.querySelector('#new-conversion').disabled = false;
    }
});

const $ = (selector, root = container) => root.querySelector(selector);
const $$ = (selector, root = container) => [...root.querySelectorAll(selector)];
const state = {
  step: 1,
  file: null,
  parsed: null,
  validation: null,
  questions: [],
  preparedQuestions: [],
  reviewValidation: null,
  previewPage: 1,
  previewPageSize: 20,
  previewSearchQuery: "",
  previewStatusFilter: "all",
  previewSearchCorpus: null,
  previewFilterCounts: {
    all: 0,
    warning: 0,
    error: 0
  },
  previewResultCache: null,
  xmlUrl: null
};
let processingMessageTimer = null;
const elements = {
  fileInput: $("#file-input"),
  chooseFile: $("#choose-file"),
  selectedFile: $("#selected-file"),
  dropZone: $("#drop-zone"),
  consent: $("#consent"),
  analyse: $("#analyse-button"),
  status: $("#status"),
  errorSummary: $("#error-summary"),
  processing: $("#processing"),
  processingMessage: $("#processing-message"),
  analysisSummary: $("#analysis-summary"),
  analysisIssues: $("#analysis-issues"),
  mappingPanel: $("#mapping-panel"),
  mappingFields: $("#mapping-fields"),
  toSettings: $("#to-settings"),
  reviewSummary: $("#review-summary"),
  reviewStateBadge: $("#review-state-badge"),
  questionPreview: $("#question-preview"),
  previewHeading: $("#preview-heading"),
  previewRange: $("#preview-limit"),
  previewPageIndicator: $("#preview-page-indicator"),
  previewPageSize: $("#preview-page-size"),
  previewPagination: $("#preview-pagination"),
  previewPrevious: $("#preview-previous"),
  previewNext: $("#preview-next"),
  previewPageNumbers: $("#preview-page-numbers"),
  previewSearch: $("#preview-search"),
  clearPreviewSearch: $("#clear-preview-search"),
  previewResultSummary: $("#preview-result-summary"),
  previewStatusFilters: $$('[data-status-filter]'),
  generate: $("#generate-button"),
  exportBlockMessage: $("#export-block-message"),
  finalSummary: $("#final-summary"),
  download: $("#download-button")
};
function announce(message) {
  elements.status.textContent = "";
  requestAnimationFrame(() => {
    elements.status.textContent = message;
  });
}
function preferredScrollBehavior() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
function showStep(step) {
  state.step = step;
  $$('[data-step]').forEach(panel => {
    panel.hidden = Number(panel.dataset.step) !== step;
  });
  $$('[data-step-marker]').forEach(marker => {
    const number = Number(marker.dataset.stepMarker);
    marker.classList.toggle("is-current", number === step);
    marker.classList.toggle("is-complete", number < step);
    if (number === step) marker.setAttribute("aria-current", "step");else marker.removeAttribute("aria-current");
  });
  elements.errorSummary.hidden = true;
  const heading = $(`[data-step="${step}"] h2`);
  heading?.focus({
    preventScroll: true
  });
  window.scrollTo({
    top: 0,
    behavior: preferredScrollBehavior()
  });
  announce(uiString("js_app_step_of_5_e7d5b4ff", {
    p0: step
  }));
}
function showErrors(items) {
  const unique = [...new Set(items.map(item => typeof item === "string" ? item : formatDiagnostic(item)))];
  elements.errorSummary.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = unique.length === 1 ? uiString("js_app_please_fix_this_issue_2908e9f3") : uiString("js_app_please_fix_these_issues_34bc362b", {
    p0: unique.length
  });
  const list = document.createElement("ul");
  list.className = "issue-list";
  unique.forEach(message => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  const help = document.createElement("p");
  help.className = "validation-help";
  help.append(uiString("js_app_need_help_with_file_structure_e2e47a98"));
  const helpLink = document.createElement("a");
  helpLink.href = config.helpurl;
  helpLink.textContent = uiString("js_app_open_the_guide_faq_7ce03f21");
  help.append(helpLink, ".");
  elements.errorSummary.append(strong, list, help);
  elements.errorSummary.hidden = false;
  elements.errorSummary.focus();
}
function showProcessing(messages) {
  const sequence = Array.isArray(messages) ? messages : [messages];
  let messageIndex = 0;
  elements.processingMessage.textContent = sequence[messageIndex];
  elements.processing.hidden = false;
  container.setAttribute("aria-busy", "true");
  processingMessageTimer = window.setInterval(() => {
    messageIndex = (messageIndex + 1) % sequence.length;
    elements.processingMessage.textContent = sequence[messageIndex];
  }, 900);
}
function hideProcessing() {
  window.clearInterval(processingMessageTimer);
  processingMessageTimer = null;
  elements.processing.hidden = true;
  container.removeAttribute("aria-busy");
}
function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}
async function runWithProcessing(messages, operation) {
  const startedAt = performance.now();
  showProcessing(messages);
  try {
    const result = await operation();
    const remaining = remainingMinimumDuration(startedAt, performance.now());
    if (remaining > 0) await wait(remaining);
    return result;
  } finally {
    hideProcessing();
  }
}
function resetGeneratedFile() {
  resetImport();
  if (state.xmlUrl) URL.revokeObjectURL(state.xmlUrl);
  state.xmlUrl = null;
  elements.download.removeAttribute("href");
}
function resetConversion() {
  if (importDone) {
    window.location.reload();
    return;
  }
  resetGeneratedFile();
  state.file = null;
  state.parsed = null;
  state.validation = null;
  state.questions = [];
  state.preparedQuestions = [];
  state.reviewValidation = null;
  state.previewPage = 1;
  state.previewPageSize = 20;
  state.previewSearchQuery = "";
  state.previewStatusFilter = "all";
  state.previewSearchCorpus = null;
  state.previewFilterCounts = {
    all: 0,
    warning: 0,
    error: 0
  };
  state.previewResultCache = null;
  elements.fileInput.value = "";
  elements.selectedFile.hidden = true;
  elements.selectedFile.textContent = "";
  elements.consent.checked = false;
  elements.analyse.disabled = true;
  elements.analysisSummary.replaceChildren();
  elements.analysisIssues.replaceChildren();
  elements.questionPreview.replaceChildren();
  elements.previewPageSize.value = "20";
  elements.previewSearch.value = "";
  elements.clearPreviewSearch.hidden = true;
  showStep(1);
}
function acceptFile(file) {
  resetGeneratedFile();
  elements.errorSummary.hidden = true;
  const extension = file?.name.split(".").pop()?.toLocaleLowerCase();
  if (!file || !["csv", "txt"].includes(extension)) {
    state.file = null;
    showErrors([uiString("js_app_choose_a_csv_or_txt_file_318482d0")]);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    state.file = null;
    showErrors([uiString("js_app_this_file_is_larger_than_5_mb_split_it_into_smal_59a8b58f")]);
    return;
  }
  state.file = file;
  state.parsed = null;
  state.questions = [];
  elements.consent.checked = false;
  elements.analyse.disabled = true;
  elements.selectedFile.textContent = uiString("js_app_kb_selected_ba1c0250", {
    p0: file.name,
    p1: (file.size / 1024).toFixed(file.size < 1024 ? 1 : 0)
  });
  elements.selectedFile.hidden = false;
  announce(uiString("js_app_selected_review_and_accept_the_conversion_acknow_0254ccaa", {
    p0: file.name
  }));
}
async function decodeUtf8(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", {
      fatal: true
    }).decode(buffer).replace(/^\uFEFF/u, "");
  } catch {
    throw new Error(uiString("js_app_this_file_is_not_valid_utf_8_save_it_as_utf_8_in_31f52b13"));
  }
}
function metric(value, label) {
  const card = document.createElement("div");
  card.className = "metric";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const span = document.createElement("span");
  span.textContent = label;
  card.append(strong, span);
  return card;
}
function renderMetrics(target, summary, validation) {
  const metrics = [metric(summary.total, summary.total === 1 ? uiString("js_app_question_1f5087db") : uiString("js_app_questions_17d5efa6")), metric(summary.single, uiString("js_app_single_answer_7be2b9f8")), metric(summary.multiple, uiString("js_app_multiple_answer_bc7b5b2c"))];
  if (summary.other > 0) metrics.push(metric(summary.other, summary.other === 1 ? uiString("js_app_other_type_b16fa987") : uiString("js_app_other_types_830b9814")));
  metrics.push(metric(validation.errors.length, validation.errors.length === 1 ? uiString("js_app_error_ca00fccf") : uiString("js_app_errors_be4bd567")));
  target.replaceChildren(...metrics);
}
function renderIssues(validation) {
  elements.analysisIssues.replaceChildren();
  if (validation.readiness.total === 0) {
    const notice = document.createElement("div");
    notice.className = "notice notice-error";
    const strong = document.createElement("strong");
    strong.textContent = uiString("js_app_no_questions_detected_881a751d");
    const text = document.createElement("p");
    text.textContent = uiString("js_app_uniquiz_could_not_identify_any_supported_questio_44064ab6");
    notice.append(strong, text);
    elements.analysisIssues.append(notice);
    return;
  }
  if (!validation.issues.length) {
    const notice = document.createElement("div");
    notice.className = "notice notice-success";
    const strong = document.createElement("strong");
    strong.textContent = uiString("js_app_all_required_fields_recognized_b029f34b");
    const text = document.createElement("p");
    text.textContent = uiString("js_app_every_question_has_usable_answers_and_a_valid_an_12b5b799");
    notice.append(strong, text);
    elements.analysisIssues.append(notice);
    return;
  }
  const grouped = [["error", uiString("js_app_errors_that_need_attention_3dae53f2"), "notice notice-error"], ["warning", uiString("js_app_warnings_to_review_d90bd032"), "notice notice-warning"]];
  grouped.forEach(([severity, title, className]) => {
    const issues = validation.issues.filter(item => item.severity === severity);
    if (!issues.length) return;
    const notice = document.createElement("div");
    notice.className = className;
    const strong = document.createElement("strong");
    strong.textContent = title;
    const list = document.createElement("ul");
    list.className = "issue-list";
    issues.slice(0, 12).forEach(diagnostic => {
      const item = document.createElement("li");
      item.textContent = formatDiagnostic(diagnostic);
      list.append(item);
    });
    if (issues.length > 12) {
      const item = document.createElement("li");
      item.textContent = uiString("js_app_plus_more_2018f1ce", {
        p0: issues.length - 12
      });
      list.append(item);
    }
    notice.append(strong, list);
    elements.analysisIssues.append(notice);
  });
}
function mappingOptions(selectedRole, columnIndex) {
  const select = document.createElement("select");
  select.dataset.columnIndex = String(columnIndex);
  select.setAttribute("aria-label", uiString("js_app_column_role_a8ab4aa0"));
  const options = [["ignore", uiString("js_app_ignore_this_column_995c0a91")], ["question", uiString("js_app_question_text_75c3c5e1")], ...Array.from({
    length: 12
  }, (_, index) => [`answer:${String.fromCharCode(65 + index)}`, uiString("js_app_answer_3f67a21a", {
    p0: String.fromCharCode(65 + index)
  })]), ["correct", uiString("js_app_correct_answer_key_bf92f98d")], ["boolean", uiString("js_app_boolean_answer_true_false_ba1498df")]];
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedRole;
    select.append(option);
  });
  return select;
}
function renderMapping() {
  elements.mappingFields.replaceChildren();
  const guidance = $("p", elements.mappingPanel);
  if (guidance) guidance.textContent = state.parsed.mapping.message;
  state.parsed.headers.forEach((header, index) => {
    const row = document.createElement("label");
    row.className = "mapping-field";
    const label = document.createElement("strong");
    label.textContent = !state.parsed.rows[0][index]?.trim() ? uiString("js_app_column_ae9cce64", {
      p0: index + 1
    }) : header;
    const select = mappingOptions(state.parsed.mapping.roles[index], index);
    row.append(label, select);
    elements.mappingFields.append(row);
  });
  elements.mappingPanel.hidden = false;
}
function refreshAnalysis() {
  state.validation = validateQuestions(state.questions, state.parsed.fileIssues ?? []);
  state.questions = state.validation.questions;
  const summary = summarizeQuestions(state.questions);
  renderMetrics(elements.analysisSummary, summary, state.validation);
  renderIssues(state.validation);
  const needsMapping = state.parsed.format === "CSV" && !state.parsed.mapping.certain;
  if (needsMapping) renderMapping();else elements.mappingPanel.hidden = true;
  elements.toSettings.disabled = needsMapping || state.questions.length === 0 || state.validation.importDiagnostics.some(({
    severity
  }) => severity === "error");
}
async function analyseFile() {
  if (!state.file || !elements.consent.checked) return;
  try {
    await runWithProcessing([uiString("js_app_reading_your_questions_80f1b6d6"), uiString("js_app_checking_answers_3e28715e"), uiString("js_app_preparing_your_review_4f0d75e6")], async () => {
      const text = await decodeUtf8(state.file);
      const extension = state.file.name.split(".").pop().toLocaleLowerCase();
      state.parsed = extension === "csv" ? parseCsv(text) : parseTxt(text);
      state.questions = state.parsed.questions;
      refreshAnalysis();
    });
    showStep(2);
    announce(uiString("js_app_questions_detected_657cc3d9", {
      p0: state.questions.length
    }));
  } catch (error) {
    showStep(1);
    const diagnostic = getInputDiagnostic(error);
    showErrors([diagnostic ?? (error instanceof Error ? error.message : uiString("js_app_the_file_could_not_be_analysed_cf85c6af"))]);
  }
}
function applyMapping() {
  const roles = $$("select", elements.mappingFields).map(select => select.value);
  const counts = {
    question: roles.filter(role => role === "question").length,
    correct: roles.filter(role => role === "correct").length,
    boolean: roles.filter(role => role === "boolean").length,
    answers: roles.filter(role => role.startsWith("answer:")).length
  };
  const answerRoles = roles.filter(role => role.startsWith("answer:"));
  const explicitSchema = counts.correct === 1 && counts.boolean === 0 && counts.answers >= 2;
  const booleanSchema = counts.boolean === 1 && counts.correct === 0 && counts.answers === 0;
  if (counts.question !== 1 || !explicitSchema && !booleanSchema || new Set(answerRoles).size !== answerRoles.length) {
    showErrors([uiString("js_app_choose_one_question_column_and_either_one_boolea_867258d1")]);
    return;
  }
  state.parsed.mapping = {
    roles,
    certain: true,
    message: uiString("js_app_column_mapping_confirmed_74d88278")
  };
  state.parsed.fileIssues = resolveCsvMappingIssues(state.parsed.fileIssues, roles);
  state.questions = questionsFromCsvRows(state.parsed.rows, roles, state.parsed.rowLocations);
  refreshAnalysis();
  announce(uiString("js_app_column_mapping_applied_0b4df2b9"));
}
function getSettings() {
  return {
    category: $("#category").value,
    shuffleAnswers: $("#shuffle").checked,
    generateNames: $("#generate-names").checked,
    removeQuestionNumbering: $("#remove-question-numbering").checked,
    capitalizeAnswers: $("#capitalize").checked,
    answerNumbering: $("#answer-numbering").value
  };
}
function renderReadinessSummary(validation) {
  const copy = formatReadinessSummary(validation.readiness);
  elements.reviewSummary.replaceChildren();
  elements.reviewSummary.className = `readiness-summary readiness-${copy.blocked ? "error" : validation.readiness.warning > 0 || validation.readiness.importWarningCount > 0 ? "warning" : "ready"}`;
  const heading = document.createElement("h3");
  heading.textContent = copy.heading;
  const counts = document.createElement("p");
  counts.className = "readiness-counts";
  counts.textContent = copy.counts;
  counts.hidden = !copy.counts;
  const supporting = document.createElement("p");
  supporting.className = "readiness-supporting";
  supporting.textContent = copy.supporting;
  elements.reviewSummary.append(heading, counts, supporting);
  if (validation.importDiagnostics.length) {
    const importSection = document.createElement("div");
    importSection.className = "import-diagnostics";
    const label = document.createElement("strong");
    label.textContent = uiString("js_app_import_checks_c09a67ca");
    const list = document.createElement("ul");
    list.className = "issue-list";
    validation.importDiagnostics.forEach(diagnostic => {
      const item = document.createElement("li");
      item.className = `diagnostic-${diagnostic.severity}`;
      item.textContent = formatDiagnostic(diagnostic);
      list.append(item);
    });
    importSection.append(label, list);
    elements.reviewSummary.append(importSection);
  }
  elements.reviewStateBadge.textContent = copy.status;
  elements.reviewStateBadge.className = `readiness-badge readiness-badge-${copy.blocked ? "error" : validation.readiness.warning > 0 || validation.readiness.importWarningCount > 0 ? "warning" : "ready"}`;
  elements.generate.disabled = !validation.canExport;
  elements.generate.setAttribute("aria-describedby", validation.canExport ? "" : "export-block-message");
  if (validation.canExport) elements.generate.removeAttribute("aria-describedby");
  elements.exportBlockMessage.hidden = validation.canExport;
}
function populateQuestionExpandedDetails(container, question) {
  if (question.type === "essay") {
    const note = document.createElement("p");
    note.className = "question-manual-note";
    note.textContent = uiString("js_app_essay_manually_graded_in_moodle_2c9891d4");
    container.append(note);
  }
  if (!["essay", "description"].includes(question.type)) {
    const list = document.createElement("ul");
    list.className = "answer-list";
    question.answers.forEach((answer, answerIndex) => {
      const item = document.createElement("li");
      if (answer.isCorrect) item.className = "correct";
      item.dir = "auto";
      const mark = document.createElement("i");
      mark.textContent = answer.isCorrect ? "✓" : "";
      const text = document.createElement("span");
      const label = ["multichoice", "truefalse"].includes(question.type) ? formatPreviewAnswerLabel(answerIndex, question.answerNumbering) : "";
      const tolerance = question.type === "numerical" && Number.isFinite(answer.tolerance) ? ` ± ${Number(answer.tolerance).toLocaleString(uiLocale(), {
        maximumFractionDigits: 7
      })}` : "";
      const answerText = `${answer.transformedText}${tolerance}`;
      text.textContent = label ? `${label}. ${answerText}` : answerText;
      const answerContent = document.createElement("div");
      answerContent.className = "answer-content";
      const fraction = document.createElement("small");
      fraction.className = "answer-fraction";
      fraction.textContent = Number.isFinite(answer.fraction) ? `${Number(answer.fraction).toLocaleString(uiLocale(), {
        maximumFractionDigits: 7
      })}%` : uiString("js_app_invalid_fraction_0a6025e5");
      answerContent.append(text, fraction);
      if (answer.feedback) {
        const feedback = document.createElement("p");
        feedback.className = "answer-feedback";
        feedback.textContent = uiString("js_app_feedback_7c47b656", {
          p0: answer.feedback
        });
        answerContent.append(feedback);
      }
      item.append(mark, answerContent);
      list.append(item);
    });
    container.append(list);
  }
  const metadata = [[uiString("js_app_question_name_5180bbe3"), question.name], [uiString("js_app_category_292c06f0"), question.category], [uiString("js_app_default_mark_9815efb6"), question.type !== "description" && Number.isFinite(question.defaultMark) ? String(question.defaultMark) : ""], [uiString("js_app_case_sensitive_e124ba47"), question.type === "shortanswer" ? question.caseSensitive ? uiString("js_app_yes_85a39ab3") : uiString("js_app_no_1ea442a1") : ""], [uiString("js_app_answer_choice_labels_f1b172a3"), ["multichoice", "truefalse"].includes(question.type) ? question.answerNumbering : ""], [uiString("js_app_shuffle_answers_fad4787e"), ["multichoice"].includes(question.type) ? question.shuffleAnswers === true ? uiString("js_app_yes_85a39ab3") : question.shuffleAnswers === false ? uiString("js_app_no_1ea442a1") : "" : ""], [uiString("js_app_grading_64dc41e1"), question.type === "essay" ? uiString("js_app_manually_graded_in_moodle_b2e4b897") : question.type === "description" ? uiString("js_app_informational_item_48f0b88d") : ["multichoice", "truefalse"].includes(question.type) ? question.single === true ? uiString("js_app_single_answer_61aa18ad") : question.single === false ? uiString("js_app_multiple_answer_5f873f53") : "" : ""], [uiString("js_app_tags_1331275b"), question.tags?.join(", ")]].filter(([, value]) => String(value ?? "").trim());
  if (metadata.length) {
    const metadataList = document.createElement("dl");
    metadataList.className = "question-metadata";
    metadata.forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = String(value);
      metadataList.append(term, description);
    });
    container.append(metadataList);
  }
  const feedbackFields = [[uiString("js_app_general_feedback_5360957a"), question.generalFeedback], [uiString("js_app_correct_feedback_bbed96c4"), question.type === "multichoice" ? question.correctFeedback : ""], [uiString("js_app_partially_correct_feedback_80cea558"), question.type === "multichoice" ? question.partiallyCorrectFeedback : ""], [uiString("js_app_incorrect_feedback_41c0e10e"), question.type === "multichoice" ? question.incorrectFeedback : ""]].filter(([, value]) => String(value ?? "").trim());
  if (feedbackFields.length) {
    const feedbackList = document.createElement("div");
    feedbackList.className = "question-feedback-list";
    feedbackFields.forEach(([label, value]) => {
      const section = document.createElement("section");
      const heading = document.createElement("strong");
      heading.textContent = label;
      const copy = document.createElement("p");
      copy.textContent = value;
      section.append(heading, copy);
      feedbackList.append(section);
    });
    container.append(feedbackList);
  }
  if (question.diagnostics.length) {
    const diagnosticList = document.createElement("div");
    diagnosticList.className = "question-diagnostics";
    diagnosticList.tabIndex = 0;
    diagnosticList.setAttribute("aria-label", uiString("js_app_diagnostics_for_question_0440d51a", {
      p0: question.sourceIndex
    }));
    question.diagnostics.forEach(diagnostic => {
      const item = document.createElement("div");
      item.className = `question-diagnostic diagnostic-${diagnostic.severity}`;
      const diagnosticTitle = document.createElement("strong");
      diagnosticTitle.textContent = diagnostic.title;
      const message = document.createElement("p");
      message.textContent = formatDiagnostic(diagnostic, {
        includeTitle: false,
        includeQuestion: false
      });
      item.append(diagnosticTitle, message);
      diagnosticList.append(item);
    });
    container.append(diagnosticList);
  }
  if (question.status === "error") {
    const footer = document.createElement("p");
    footer.className = "question-blocking-note";
    footer.textContent = uiString("js_app_this_question_must_be_fixed_before_moodle_xml_ca_afe7bcd7");
    container.append(footer);
  }
}
function renderQuestionCard(question) {
  const card = document.createElement("article");
  card.className = `question-card question-card-${question.status}`;
  card.dir = "auto";
  const headingId = `question-${question.sourceIndex}-title`;
  const detailsId = `question-${question.sourceIndex}-details`;
  card.setAttribute("aria-labelledby", headingId);
  const meta = document.createElement("div");
  meta.className = "question-card-meta";
  const identity = document.createElement("div");
  const number = document.createElement("strong");
  number.textContent = uiString("js_app_question_a708e36a", {
    p0: question.sourceIndex
  });
  const type = document.createElement("span");
  type.textContent = {
    multichoice: uiString("js_app_multiple_choice_79fefc32"),
    truefalse: uiString("js_app_true_false_3d971996"),
    shortanswer: uiString("js_app_short_answer_91b03d90"),
    numerical: uiString("js_app_numerical_a6382f93"),
    essay: uiString("js_app_essay_6bc4fba5"),
    description: uiString("js_app_description_526e0087")
  }[question.type] ?? question.type ?? uiString("js_app_unknown_type_6a29772e");
  identity.append(number, type);
  const status = document.createElement("span");
  status.className = `question-status question-status-${question.status}`;
  const warningCount = question.diagnostics.filter(({
    severity
  }) => severity === "warning").length;
  const errorCount = question.diagnostics.filter(({
    severity
  }) => severity === "error").length;
  status.textContent = question.status === "ready" ? uiString("js_app_ready_5fa7aac5") : question.status === "warning" ? `${warningCount} ${warningCount === 1 ? uiString("js_app_warning_4bd9354b") : uiString("js_app_warnings_227690d7")}` : `${errorCount} ${errorCount === 1 ? uiString("js_app_error_ca00fccf") : uiString("js_app_errors_be4bd567")}`;
  meta.append(identity, status);
  const header = document.createElement("header");
  const title = document.createElement("h4");
  title.id = headingId;
  title.textContent = question.text || uiString("js_app_question_text_is_missing_410b003d");
  header.append(title);
  const answerFeedbackCount = question.answers.filter(({
    feedback
  }) => feedback.trim()).length;
  const details = document.createElement("p");
  details.className = "question-details";
  const detailParts = question.type === "description" ? [uiString("js_app_informational_content_d7e195b3")] : question.type === "essay" ? [uiString("js_app_manually_graded_in_moodle_b2e4b897")] : [`${question.answers.length} ${question.answers.length === 1 ? uiString("js_app_answer_0db52f40") : uiString("js_app_answers_677fe21b")}`];
  if (question.generalFeedback) detailParts.push(uiString("js_app_general_feedback_5360957a"));
  if (answerFeedbackCount) detailParts.push(uiString("js_app_answer_46234d41", {
    p0: answerFeedbackCount,
    p1: answerFeedbackCount === 1 ? uiString("js_app_feedback_59bda3f8") : uiString("js_app_feedbacks_b7de37c4")
  }));
  details.textContent = detailParts.join(" · ");
  const controls = document.createElement("div");
  controls.className = "question-card-controls";
  const toggle = document.createElement("button");
  toggle.className = "question-toggle";
  toggle.type = "button";
  toggle.textContent = uiString("js_app_expand_details_957d5d59");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", detailsId);
  controls.append(toggle);
  if (question.diagnostics.length) {
    const issueSummary = document.createElement("div");
    issueSummary.className = "question-issue-summary";
    const issueLabel = document.createElement("strong");
    issueLabel.textContent = question.status === "error" ? uiString("js_app_needs_attention_c1ebc781") : uiString("js_app_review_recommended_6b75ef46");
    const issueTitles = document.createElement("p");
    issueTitles.textContent = [...new Set(question.diagnostics.map(({
      title: diagnosticTitle
    }) => diagnosticTitle))].join(" · ");
    issueSummary.append(issueLabel, issueTitles);
    controls.prepend(issueSummary);
  }
  const expandedDetails = document.createElement("div");
  expandedDetails.className = "question-expanded-details";
  expandedDetails.id = detailsId;
  expandedDetails.hidden = true;
  card.append(meta, header, details, controls, expandedDetails);
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    if (expanded) expandedDetails.replaceChildren();else populateQuestionExpandedDetails(expandedDetails, question);
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.textContent = expanded ? uiString("js_app_expand_details_957d5d59") : uiString("js_app_collapse_details_0b655856");
    expandedDetails.hidden = expanded;
    card.classList.toggle("is-expanded", !expanded);
  });
  return card;
}
function focusPreviewAfterNavigation() {
  elements.previewHeading.focus({
    preventScroll: true
  });
  elements.previewHeading.scrollIntoView({
    block: "start",
    behavior: "smooth"
  });
}
function renderPreviewPagination(page) {
  elements.previewPagination.hidden = page.totalPages <= 1;
  elements.previewPrevious.disabled = page.page <= 1;
  elements.previewNext.disabled = page.page >= page.totalPages;
  elements.previewPageNumbers.replaceChildren();
  let ellipsisIndex = 0;
  getCompactPageItems(page.page, page.totalPages).forEach(item => {
    if (item === "ellipsis") {
      ellipsisIndex += 1;
      const ellipsis = document.createElement("span");
      ellipsis.className = "preview-ellipsis";
      ellipsis.textContent = "…";
      ellipsis.setAttribute("aria-hidden", "true");
      ellipsis.dataset.ellipsis = String(ellipsisIndex);
      elements.previewPageNumbers.append(ellipsis);
      return;
    }
    if (item === page.page) {
      const current = document.createElement("span");
      current.className = "preview-page-button is-current";
      current.textContent = String(item);
      current.setAttribute("aria-current", "page");
      current.setAttribute("aria-label", uiString("js_app_page_current_page_81bd7811", {
        p0: item
      }));
      elements.previewPageNumbers.append(current);
      return;
    }
    const button = document.createElement("button");
    button.className = "preview-page-button";
    button.type = "button";
    button.textContent = String(item);
    button.setAttribute("aria-label", uiString("js_app_go_to_page_3df1f477", {
      p0: item
    }));
    button.addEventListener("click", () => setPreviewPage(item, true));
    elements.previewPageNumbers.append(button);
  });
}
function renderPreviewFilters() {
  const counts = state.previewFilterCounts;
  elements.previewStatusFilters.forEach(button => {
    const filter = button.dataset.statusFilter;
    const active = filter === state.previewStatusFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    const count = $(`[data-filter-count="${filter}"]`, button);
    count.textContent = counts[filter].toLocaleString(uiLocale());
  });
  elements.clearPreviewSearch.hidden = !normalizeSearchQuery(state.previewSearchQuery);
}
function emptyStateAction(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-ghost";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}
function renderPreviewEmptyState() {
  const query = state.previewSearchQuery.trim();
  const filter = state.previewStatusFilter;
  const empty = document.createElement("section");
  empty.className = "preview-empty-state";
  const heading = document.createElement("h4");
  const supporting = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "preview-empty-actions";
  if (query && filter !== "all") {
    heading.textContent = uiString("js_app_no_matching_questions_08c2b38c");
    supporting.textContent = uiString("js_app_no_questions_matching_contain_c3d37f1f", {
      p0: query,
      p1: filter === "warning" ? uiString("js_app_warnings_227690d7") : uiString("js_app_errors_be4bd567")
    });
    actions.append(emptyStateAction(uiString("js_app_clear_search_3b7ea517"), () => setPreviewSearchQuery("", true)), emptyStateAction(uiString("js_app_show_all_questions_48a510cd"), () => setPreviewStatusFilter("all", true)));
  } else if (query) {
    heading.textContent = uiString("js_app_no_questions_found_bc8f6055");
    supporting.textContent = uiString("js_app_no_questions_match_6a1f241e", {
      p0: query
    });
    actions.append(emptyStateAction(uiString("js_app_clear_search_3b7ea517"), () => setPreviewSearchQuery("", true)));
  } else if (filter === "warning") {
    heading.textContent = uiString("js_app_no_warnings_found_10dd6abb");
    supporting.textContent = uiString("js_app_all_imported_questions_passed_uniquiz_s_warning__d0d5e5ca");
    actions.append(emptyStateAction(uiString("js_app_show_all_questions_48a510cd"), () => setPreviewStatusFilter("all", true)));
  } else if (filter === "error") {
    heading.textContent = uiString("js_app_no_errors_found_e2cf82b6");
    supporting.textContent = uiString("js_app_all_imported_questions_can_be_converted_to_moodl_e7c86881");
    actions.append(emptyStateAction(uiString("js_app_show_all_questions_48a510cd"), () => setPreviewStatusFilter("all", true)));
  } else {
    heading.textContent = uiString("js_app_no_questions_to_preview_320b29ed");
    supporting.textContent = uiString("js_app_no_supported_questions_are_available_in_this_ban_51a7c4f7");
  }
  empty.append(heading, supporting);
  if (actions.childElementCount) empty.append(actions);
  return empty;
}
function getPreviewResults() {
  const query = normalizeSearchQuery(state.previewSearchQuery);
  const filter = state.previewStatusFilter;
  const cached = state.previewResultCache;
  if (cached?.questions === state.preparedQuestions && cached.query === query && cached.filter === filter) {
    return cached.results;
  }
  const results = filterPreviewQuestions(state.preparedQuestions, query, filter, state.previewSearchCorpus);
  state.previewResultCache = {
    questions: state.preparedQuestions,
    query,
    filter,
    results
  };
  return results;
}
function renderPreviewPage({
  focusAfterNavigation = false
} = {}) {
  const results = getPreviewResults();
  const restricted = Boolean(normalizeSearchQuery(state.previewSearchQuery)) || state.previewStatusFilter !== "all";
  const page = paginateQuestions(results, state.previewPage, state.previewPageSize);
  state.previewPage = page.page || 1;
  state.previewPageSize = page.pageSize;
  elements.previewPageSize.value = String(page.pageSize);
  elements.previewRange.textContent = formatPreviewResultRange(page, restricted);
  elements.previewPageIndicator.textContent = page.pageText;
  const resultSummary = formatPreviewResultSummary(results.length, state.previewSearchQuery, state.previewStatusFilter);
  elements.previewResultSummary.textContent = resultSummary;
  elements.previewResultSummary.hidden = !resultSummary;
  elements.questionPreview.replaceChildren(...(page.questions.length ? page.questions.map(renderQuestionCard) : [renderPreviewEmptyState()]));
  elements.questionPreview.scrollTop = 0;
  renderPreviewPagination(page);
  elements.previewPageSize.closest("label").hidden = page.total === 0;
  renderPreviewFilters();
  if (focusAfterNavigation) focusPreviewAfterNavigation();
}
function setPreviewPage(page, focusAfterNavigation = false) {
  state.previewPage = page;
  renderPreviewPage({
    focusAfterNavigation
  });
}
function setPreviewSearchQuery(query, focusAfterNavigation = false) {
  state.previewSearchQuery = String(query ?? "");
  state.previewPage = 1;
  elements.previewSearch.value = state.previewSearchQuery;
  renderPreviewPage({
    focusAfterNavigation
  });
}
function setPreviewStatusFilter(filter, focusAfterNavigation = false) {
  state.previewStatusFilter = ["all", "warning", "error"].includes(filter) ? filter : "all";
  state.previewPage = 1;
  renderPreviewPage({
    focusAfterNavigation
  });
}
function renderReview() {
  const settings = getSettings();
  const prepared = applySettings(state.questions, settings);
  const validation = validateQuestions(prepared, state.parsed.fileIssues ?? []);
  state.reviewValidation = validation;
  state.preparedQuestions = validation.questions;
  state.previewPage = 1;
  state.previewSearchQuery = "";
  state.previewStatusFilter = "all";
  state.previewSearchCorpus = createPreviewSearchCorpusCache(state.preparedQuestions);
  state.previewFilterCounts = getPreviewFilterCounts(state.preparedQuestions);
  state.previewResultCache = null;
  elements.previewSearch.value = "";
  renderReadinessSummary(validation);
  renderPreviewPage();
  showStep(4);
}
async function generateFile() {
  try {
    const summary = await runWithProcessing([uiString("js_app_preparing_moodle_xml_58ddca43"), uiString("js_app_checking_grading_9e42cf93"), uiString("js_app_validating_your_file_5b819b2b")], async () => {
      const settings = getSettings();
      const exportValidation = validateQuestions(state.preparedQuestions, state.parsed?.fileIssues ?? []);
      if (!exportValidation.canExport) {
        throw new Error(uiString("js_app_resolve_the_errors_in_the_preview_before_exporti_93e1c19c"));
      }
      const xml = generateMoodleXml(state.preparedQuestions, settings);
      const finalValidation = validateGeneratedXml(xml);
      if (!finalValidation.valid) throw new Error(finalValidation.errors[0]);
      resetGeneratedFile();
      state.xmlUrl = URL.createObjectURL(new Blob([xml], {
        type: "application/xml;charset=utf-8"
      }));
      elements.download.href = state.xmlUrl;
      elements.download.download = createDownloadFilename();
      const result = summarizeQuestions(state.preparedQuestions);
      renderMetrics(elements.finalSummary, result, {
        errors: []
      });
      prepareImport(xml, result.total);
      return result;
    });
    showStep(5);
    announce(uiString("js_app_moodle_xml_validation_passed_for_questions_623d0d36", {
      p0: summary.total
    }));
  } catch (error) {
    showErrors([error instanceof Error ? error.message : uiString("js_app_the_moodle_xml_could_not_be_validated_f08d2649")]);
  }
}
elements.chooseFile.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => acceptFile(elements.fileInput.files[0]));
elements.consent.addEventListener("change", () => {
  elements.analyse.disabled = !(state.file && elements.consent.checked);
});
elements.dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
});
elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("is-dragging"));
elements.dropZone.addEventListener("drop", event => {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  acceptFile(event.dataTransfer.files[0]);
});
elements.analyse.addEventListener("click", analyseFile);
$("#apply-mapping").addEventListener("click", applyMapping);
elements.toSettings.addEventListener("click", () => showStep(3));
$("#to-review").addEventListener("click", renderReview);
elements.previewPageSize.addEventListener("change", () => {
  state.previewPageSize = Number(elements.previewPageSize.value);
  state.previewPage = 1;
  renderPreviewPage();
});
elements.previewSearch.addEventListener("input", () => setPreviewSearchQuery(elements.previewSearch.value));
elements.clearPreviewSearch.addEventListener("click", () => setPreviewSearchQuery("", true));
elements.previewStatusFilters.forEach(button => button.addEventListener("click", () => {
  setPreviewStatusFilter(button.dataset.statusFilter);
}));
elements.previewPrevious.addEventListener("click", () => setPreviewPage(state.previewPage - 1, true));
elements.previewNext.addEventListener("click", () => setPreviewPage(state.previewPage + 1, true));
$("#generate-button").addEventListener("click", generateFile);
$("#new-conversion").addEventListener("click", resetConversion);
$$('[data-back]').forEach(button => button.addEventListener("click", () => showStep(Number(button.dataset.back))));
window.addEventListener("beforeunload", resetGeneratedFile);

};
