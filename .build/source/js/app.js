import {
  applySettings,
  createDownloadFilename,
  formatDiagnostic,
  formatReadinessSummary,
  generateMoodleXml,
  getInputDiagnostic,
  parseCsv,
  parseTxt,
  questionsFromCsvRows,
  resolveCsvMappingIssues,
  summarizeQuestions,
  validateGeneratedXml,
  validateQuestions,
} from "./core.js?v=0.7.0";
import {
  createPreviewSearchCorpusCache,
  filterPreviewQuestions,
  formatPreviewResultRange,
  formatPreviewResultSummary,
  formatPreviewAnswerLabel,
  getCompactPageItems,
  getPreviewFilterCounts,
  normalizeSearchQuery,
  paginateQuestions,
} from "./preview.js?v=0.7.0";
import { remainingMinimumDuration } from "./timing.js?v=0.7.0";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

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
  previewFilterCounts: { all: 0, warning: 0, error: 0 },
  previewResultCache: null,
  xmlUrl: null,
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
  download: $("#download-button"),
};

function announce(message) {
  elements.status.textContent = "";
  requestAnimationFrame(() => { elements.status.textContent = message; });
}

function preferredScrollBehavior() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function showStep(step) {
  state.step = step;
  $$('[data-step]').forEach((panel) => { panel.hidden = Number(panel.dataset.step) !== step; });
  $$('[data-step-marker]').forEach((marker) => {
    const number = Number(marker.dataset.stepMarker);
    marker.classList.toggle("is-current", number === step);
    marker.classList.toggle("is-complete", number < step);
    if (number === step) marker.setAttribute("aria-current", "step");
    else marker.removeAttribute("aria-current");
  });
  elements.errorSummary.hidden = true;
  const heading = $(`[data-step="${step}"] h2`);
  heading?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  announce(`Step ${step} of 5.`);
}

function showErrors(items) {
  const unique = [...new Set(items.map((item) => typeof item === "string" ? item : formatDiagnostic(item)))];
  elements.errorSummary.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = unique.length === 1 ? "Please fix this issue" : `Please fix these ${unique.length} issues`;
  const list = document.createElement("ul");
  list.className = "issue-list";
  unique.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  const help = document.createElement("p");
  help.className = "validation-help";
  help.append("Need help with file structure? ");
  const helpLink = document.createElement("a");
  helpLink.href = "/guide/#faq";
  helpLink.textContent = "Open the Guide & FAQ";
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
  document.body.setAttribute("aria-busy", "true");
  processingMessageTimer = window.setInterval(() => {
    messageIndex = (messageIndex + 1) % sequence.length;
    elements.processingMessage.textContent = sequence[messageIndex];
  }, 900);
}

function hideProcessing() {
  window.clearInterval(processingMessageTimer);
  processingMessageTimer = null;
  elements.processing.hidden = true;
  document.body.removeAttribute("aria-busy");
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
  if (state.xmlUrl) URL.revokeObjectURL(state.xmlUrl);
  state.xmlUrl = null;
  elements.download.removeAttribute("href");
}

function resetConversion() {
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
  state.previewFilterCounts = { all: 0, warning: 0, error: 0 };
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
    showErrors(["Choose a CSV or TXT file."]);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    state.file = null;
    showErrors(["This file is larger than 5 MB. Split it into smaller files and try again."]);
    return;
  }
  state.file = file;
  state.parsed = null;
  state.questions = [];
  elements.consent.checked = false;
  elements.analyse.disabled = true;
  elements.selectedFile.textContent = `${file.name} · ${(file.size / 1024).toFixed(file.size < 1024 ? 1 : 0)} KB selected`;
  elements.selectedFile.hidden = false;
  announce(`${file.name} selected. Review and accept the conversion acknowledgement to continue.`);
}

async function decodeUtf8(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/u, "");
  } catch {
    throw new Error("This file is not valid UTF-8. Save it as UTF-8 in your text editor or spreadsheet app, then try again.");
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
  const metrics = [
    metric(summary.total, summary.total === 1 ? "question" : "questions"),
    metric(summary.single, "single-answer"),
    metric(summary.multiple, "multiple-answer"),
  ];
  if (summary.other > 0) metrics.push(metric(summary.other, summary.other === 1 ? "other type" : "other types"));
  metrics.push(metric(validation.errors.length, validation.errors.length === 1 ? "error" : "errors"));
  target.replaceChildren(...metrics);
}

function renderIssues(validation) {
  elements.analysisIssues.replaceChildren();
  if (validation.readiness.total === 0) {
    const notice = document.createElement("div");
    notice.className = "notice notice-error";
    const strong = document.createElement("strong");
    strong.textContent = "No questions detected";
    const text = document.createElement("p");
    text.textContent = "UniQuiz could not identify any supported questions in this input. Check the file structure or try another supported format.";
    notice.append(strong, text);
    elements.analysisIssues.append(notice);
    return;
  }
  if (!validation.issues.length) {
    const notice = document.createElement("div");
    notice.className = "notice notice-success";
    const strong = document.createElement("strong");
    strong.textContent = "✓ All required fields recognized";
    const text = document.createElement("p");
    text.textContent = "Every question has usable answers and a valid answer key.";
    notice.append(strong, text);
    elements.analysisIssues.append(notice);
    return;
  }
  const grouped = [
    ["error", "Errors that need attention", "notice notice-error"],
    ["warning", "Warnings to review", "notice notice-warning"],
  ];
  grouped.forEach(([severity, title, className]) => {
    const issues = validation.issues.filter((item) => item.severity === severity);
    if (!issues.length) return;
    const notice = document.createElement("div");
    notice.className = className;
    const strong = document.createElement("strong");
    strong.textContent = title;
    const list = document.createElement("ul");
    list.className = "issue-list";
    issues.slice(0, 12).forEach((diagnostic) => {
      const item = document.createElement("li");
      item.textContent = formatDiagnostic(diagnostic);
      list.append(item);
    });
    if (issues.length > 12) {
      const item = document.createElement("li");
      item.textContent = `Plus ${issues.length - 12} more.`;
      list.append(item);
    }
    notice.append(strong, list);
    elements.analysisIssues.append(notice);
  });
}

function mappingOptions(selectedRole, columnIndex) {
  const select = document.createElement("select");
  select.dataset.columnIndex = String(columnIndex);
  select.setAttribute("aria-label", "Column role");
  const options = [
    ["ignore", "Ignore this column"], ["question", "Question text"],
    ...Array.from({ length: 12 }, (_, index) => [`answer:${String.fromCharCode(65 + index)}`, `Answer ${String.fromCharCode(65 + index)}`]),
    ["correct", "Correct answer / key"],
    ["boolean", "Boolean answer (true / false)"],
  ];
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
    label.textContent = header;
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
  if (needsMapping) renderMapping();
  else elements.mappingPanel.hidden = true;
  elements.toSettings.disabled = needsMapping
    || state.questions.length === 0
    || state.validation.importDiagnostics.some(({ severity }) => severity === "error");
}

async function analyseFile() {
  if (!state.file || !elements.consent.checked) return;
  try {
    await runWithProcessing(["Reading your questions…", "Checking answers…", "Preparing your review…"], async () => {
      const text = await decodeUtf8(state.file);
      const extension = state.file.name.split(".").pop().toLocaleLowerCase();
      state.parsed = extension === "csv" ? parseCsv(text) : parseTxt(text);
      state.questions = state.parsed.questions;
      refreshAnalysis();
    });
    showStep(2);
    announce(`${state.questions.length} questions detected.`);
  } catch (error) {
    showStep(1);
    const diagnostic = getInputDiagnostic(error);
    showErrors([diagnostic ?? (error instanceof Error ? error.message : "The file could not be analysed.")]);
  }
}

function applyMapping() {
  const roles = $$("select", elements.mappingFields).map((select) => select.value);
  const counts = {
    question: roles.filter((role) => role === "question").length,
    correct: roles.filter((role) => role === "correct").length,
    boolean: roles.filter((role) => role === "boolean").length,
    answers: roles.filter((role) => role.startsWith("answer:")).length,
  };
  const answerRoles = roles.filter((role) => role.startsWith("answer:"));
  const explicitSchema = counts.correct === 1 && counts.boolean === 0 && counts.answers >= 2;
  const booleanSchema = counts.boolean === 1 && counts.correct === 0 && counts.answers === 0;
  if (counts.question !== 1 || (!explicitSchema && !booleanSchema) || new Set(answerRoles).size !== answerRoles.length) {
    showErrors(["Choose one question column and either one Boolean answer column, or one correct-answer column with at least two uniquely labelled answer columns."]);
    return;
  }
  state.parsed.mapping = { roles, certain: true, message: "Column mapping confirmed." };
  state.parsed.fileIssues = resolveCsvMappingIssues(state.parsed.fileIssues, roles);
  state.questions = questionsFromCsvRows(state.parsed.rows, roles, state.parsed.rowLocations);
  refreshAnalysis();
  announce("Column mapping applied.");
}

function getSettings() {
  return {
    category: $("#category").value,
    shuffleAnswers: $("#shuffle").checked,
    generateNames: $("#generate-names").checked,
    removeQuestionNumbering: $("#remove-question-numbering").checked,
    capitalizeAnswers: $("#capitalize").checked,
    answerNumbering: $("#answer-numbering").value,
  };
}

function renderReadinessSummary(validation) {
  const copy = formatReadinessSummary(validation.readiness);
  elements.reviewSummary.replaceChildren();
  elements.reviewSummary.className = `readiness-summary readiness-${copy.blocked ? "error"
    : validation.readiness.warning > 0 || validation.readiness.importWarningCount > 0 ? "warning" : "ready"}`;
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
    label.textContent = "Import checks";
    const list = document.createElement("ul");
    list.className = "issue-list";
    validation.importDiagnostics.forEach((diagnostic) => {
      const item = document.createElement("li");
      item.className = `diagnostic-${diagnostic.severity}`;
      item.textContent = formatDiagnostic(diagnostic);
      list.append(item);
    });
    importSection.append(label, list);
    elements.reviewSummary.append(importSection);
  }
  elements.reviewStateBadge.textContent = copy.status;
  elements.reviewStateBadge.className = `readiness-badge readiness-badge-${copy.blocked ? "error"
    : validation.readiness.warning > 0 || validation.readiness.importWarningCount > 0 ? "warning" : "ready"}`;
  elements.generate.disabled = !validation.canExport;
  elements.generate.setAttribute("aria-describedby", validation.canExport ? "" : "export-block-message");
  if (validation.canExport) elements.generate.removeAttribute("aria-describedby");
  elements.exportBlockMessage.hidden = validation.canExport;
}

function populateQuestionExpandedDetails(container, question) {
  if (question.type === "essay") {
    const note = document.createElement("p");
    note.className = "question-manual-note";
    note.textContent = "Essay — manually graded in Moodle";
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
    const label = ["multichoice", "truefalse"].includes(question.type)
      ? formatPreviewAnswerLabel(answerIndex, question.answerNumbering) : "";
    const tolerance = question.type === "numerical" && Number.isFinite(answer.tolerance)
      ? ` ± ${Number(answer.tolerance).toLocaleString("en-US", { maximumFractionDigits: 7 })}` : "";
    const answerText = `${answer.transformedText}${tolerance}`;
    text.textContent = label ? `${label}. ${answerText}` : answerText;
    const answerContent = document.createElement("div");
    answerContent.className = "answer-content";
    const fraction = document.createElement("small");
    fraction.className = "answer-fraction";
    fraction.textContent = Number.isFinite(answer.fraction)
      ? `${Number(answer.fraction).toLocaleString("en-US", { maximumFractionDigits: 7 })}%`
      : "Invalid fraction";
    answerContent.append(text, fraction);
    if (answer.feedback) {
      const feedback = document.createElement("p");
      feedback.className = "answer-feedback";
      feedback.textContent = `Feedback: ${answer.feedback}`;
      answerContent.append(feedback);
    }
    item.append(mark, answerContent);
    list.append(item);
    });
    container.append(list);
  }

  const metadata = [
    ["Question name", question.name],
    ["Category", question.category],
    ["Default mark", question.type !== "description" && Number.isFinite(question.defaultMark)
      ? String(question.defaultMark) : ""],
    ["Case sensitive", question.type === "shortanswer" ? (question.caseSensitive ? "Yes" : "No") : ""],
    ["Answer choice labels", ["multichoice", "truefalse"].includes(question.type) ? question.answerNumbering : ""],
    ["Shuffle answers", ["multichoice"].includes(question.type)
      ? question.shuffleAnswers === true ? "Yes" : question.shuffleAnswers === false ? "No" : "" : ""],
    ["Grading", question.type === "essay" ? "Manually graded in Moodle"
      : question.type === "description" ? "Informational item"
        : ["multichoice", "truefalse"].includes(question.type)
          ? question.single === true ? "Single answer" : question.single === false ? "Multiple answer" : "" : ""],
    ["Tags", question.tags?.join(", ")],
  ].filter(([, value]) => String(value ?? "").trim());
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

  const feedbackFields = [
    ["General feedback", question.generalFeedback],
    ["Correct feedback", question.type === "multichoice" ? question.correctFeedback : ""],
    ["Partially correct feedback", question.type === "multichoice" ? question.partiallyCorrectFeedback : ""],
    ["Incorrect feedback", question.type === "multichoice" ? question.incorrectFeedback : ""],
  ].filter(([, value]) => String(value ?? "").trim());
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
    diagnosticList.setAttribute("aria-label", `Diagnostics for Question ${question.sourceIndex}`);
    question.diagnostics.forEach((diagnostic) => {
      const item = document.createElement("div");
      item.className = `question-diagnostic diagnostic-${diagnostic.severity}`;
      const diagnosticTitle = document.createElement("strong");
      diagnosticTitle.textContent = diagnostic.title;
      const message = document.createElement("p");
      message.textContent = formatDiagnostic(diagnostic, { includeTitle: false, includeQuestion: false });
      item.append(diagnosticTitle, message);
      diagnosticList.append(item);
    });
    container.append(diagnosticList);
  }
  if (question.status === "error") {
    const footer = document.createElement("p");
    footer.className = "question-blocking-note";
    footer.textContent = "This question must be fixed before Moodle XML can be exported.";
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
  number.textContent = `Question ${question.sourceIndex}`;
  const type = document.createElement("span");
  type.textContent = ({
    multichoice: "Multiple choice",
    truefalse: "True/False",
    shortanswer: "Short Answer",
    numerical: "Numerical",
    essay: "Essay",
    description: "Description",
  })[question.type] ?? question.type ?? "Unknown type";
  identity.append(number, type);
  const status = document.createElement("span");
  status.className = `question-status question-status-${question.status}`;
  const warningCount = question.diagnostics.filter(({ severity }) => severity === "warning").length;
  const errorCount = question.diagnostics.filter(({ severity }) => severity === "error").length;
  status.textContent = question.status === "ready" ? "Ready"
    : question.status === "warning" ? `${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`
      : `${errorCount} ${errorCount === 1 ? "error" : "errors"}`;
  meta.append(identity, status);
  const header = document.createElement("header");
  const title = document.createElement("h4");
  title.id = headingId;
  title.textContent = question.text || "Question text is missing";
  header.append(title);
  const answerFeedbackCount = question.answers.filter(({ feedback }) => feedback.trim()).length;
  const details = document.createElement("p");
  details.className = "question-details";
  const detailParts = question.type === "description" ? ["Informational content"]
    : question.type === "essay" ? ["Manually graded in Moodle"]
      : [`${question.answers.length} ${question.answers.length === 1 ? "answer" : "answers"}`];
  if (question.generalFeedback) detailParts.push("General feedback");
  if (answerFeedbackCount) detailParts.push(`${answerFeedbackCount} answer ${answerFeedbackCount === 1 ? "feedback" : "feedbacks"}`);
  details.textContent = detailParts.join(" · ");
  const controls = document.createElement("div");
  controls.className = "question-card-controls";
  const toggle = document.createElement("button");
  toggle.className = "question-toggle";
  toggle.type = "button";
  toggle.textContent = "Expand details";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", detailsId);
  controls.append(toggle);

  if (question.diagnostics.length) {
    const issueSummary = document.createElement("div");
    issueSummary.className = "question-issue-summary";
    const issueLabel = document.createElement("strong");
    issueLabel.textContent = question.status === "error" ? "Needs attention" : "Review recommended";
    const issueTitles = document.createElement("p");
    issueTitles.textContent = [...new Set(question.diagnostics.map(({ title: diagnosticTitle }) => diagnosticTitle))].join(" · ");
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
    if (expanded) expandedDetails.replaceChildren();
    else populateQuestionExpandedDetails(expandedDetails, question);
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.textContent = expanded ? "Expand details" : "Collapse details";
    expandedDetails.hidden = expanded;
    card.classList.toggle("is-expanded", !expanded);
  });
  return card;
}

function focusPreviewAfterNavigation() {
  elements.previewHeading.focus({ preventScroll: true });
  elements.previewHeading.scrollIntoView({ block: "start", behavior: "smooth" });
}

function renderPreviewPagination(page) {
  elements.previewPagination.hidden = page.totalPages <= 1;
  elements.previewPrevious.disabled = page.page <= 1;
  elements.previewNext.disabled = page.page >= page.totalPages;
  elements.previewPageNumbers.replaceChildren();
  let ellipsisIndex = 0;
  getCompactPageItems(page.page, page.totalPages).forEach((item) => {
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
      current.setAttribute("aria-label", `Page ${item}, current page`);
      elements.previewPageNumbers.append(current);
      return;
    }
    const button = document.createElement("button");
    button.className = "preview-page-button";
    button.type = "button";
    button.textContent = String(item);
    button.setAttribute("aria-label", `Go to page ${item}`);
    button.addEventListener("click", () => setPreviewPage(item, true));
    elements.previewPageNumbers.append(button);
  });
}

function renderPreviewFilters() {
  const counts = state.previewFilterCounts;
  elements.previewStatusFilters.forEach((button) => {
    const filter = button.dataset.statusFilter;
    const active = filter === state.previewStatusFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    const count = $(`[data-filter-count="${filter}"]`, button);
    count.textContent = counts[filter].toLocaleString("en-US");
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
    heading.textContent = "No matching questions";
    supporting.textContent = `No questions matching “${query}” contain ${filter === "warning" ? "warnings" : "errors"}.`;
    actions.append(
      emptyStateAction("Clear search", () => setPreviewSearchQuery("", true)),
      emptyStateAction("Show all questions", () => setPreviewStatusFilter("all", true)),
    );
  } else if (query) {
    heading.textContent = "No questions found";
    supporting.textContent = `No questions match “${query}”.`;
    actions.append(emptyStateAction("Clear search", () => setPreviewSearchQuery("", true)));
  } else if (filter === "warning") {
    heading.textContent = "No warnings found";
    supporting.textContent = "All imported questions passed UniQuiz's warning checks.";
    actions.append(emptyStateAction("Show all questions", () => setPreviewStatusFilter("all", true)));
  } else if (filter === "error") {
    heading.textContent = "No errors found";
    supporting.textContent = "All imported questions can be converted to Moodle XML.";
    actions.append(emptyStateAction("Show all questions", () => setPreviewStatusFilter("all", true)));
  } else {
    heading.textContent = "No questions to preview";
    supporting.textContent = "No supported questions are available in this bank.";
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
  const results = filterPreviewQuestions(
    state.preparedQuestions,
    query,
    filter,
    state.previewSearchCorpus,
  );
  state.previewResultCache = { questions: state.preparedQuestions, query, filter, results };
  return results;
}

function renderPreviewPage({ focusAfterNavigation = false } = {}) {
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
  elements.questionPreview.replaceChildren(...(page.questions.length
    ? page.questions.map(renderQuestionCard)
    : [renderPreviewEmptyState()]));
  elements.questionPreview.scrollTop = 0;
  renderPreviewPagination(page);
  elements.previewPageSize.closest("label").hidden = page.total === 0;
  renderPreviewFilters();
  if (focusAfterNavigation) focusPreviewAfterNavigation();
}

function setPreviewPage(page, focusAfterNavigation = false) {
  state.previewPage = page;
  renderPreviewPage({ focusAfterNavigation });
}

function setPreviewSearchQuery(query, focusAfterNavigation = false) {
  state.previewSearchQuery = String(query ?? "");
  state.previewPage = 1;
  elements.previewSearch.value = state.previewSearchQuery;
  renderPreviewPage({ focusAfterNavigation });
}

function setPreviewStatusFilter(filter, focusAfterNavigation = false) {
  state.previewStatusFilter = ["all", "warning", "error"].includes(filter) ? filter : "all";
  state.previewPage = 1;
  renderPreviewPage({ focusAfterNavigation });
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
    const summary = await runWithProcessing(["Preparing Moodle XML…", "Checking grading…", "Validating your file…"], async () => {
      const settings = getSettings();
      const exportValidation = validateQuestions(state.preparedQuestions, state.parsed?.fileIssues ?? []);
      if (!exportValidation.canExport) {
        throw new Error("Resolve the errors in the preview before exporting Moodle XML.");
      }
      const xml = generateMoodleXml(state.preparedQuestions, settings);
      const finalValidation = validateGeneratedXml(xml);
      if (!finalValidation.valid) throw new Error(finalValidation.errors[0]);
      resetGeneratedFile();
      state.xmlUrl = URL.createObjectURL(new Blob([xml], { type: "application/xml;charset=utf-8" }));
      elements.download.href = state.xmlUrl;
      elements.download.download = createDownloadFilename();
      const result = summarizeQuestions(state.preparedQuestions);
      renderMetrics(elements.finalSummary, result, { errors: [] });
      return result;
    });
    showStep(5);
    announce(`Moodle XML validation passed for ${summary.total} questions.`);
  } catch (error) {
    showErrors([error instanceof Error ? error.message : "The Moodle XML could not be validated."]);
  }
}

elements.chooseFile.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => acceptFile(elements.fileInput.files[0]));
elements.consent.addEventListener("change", () => {
  elements.analyse.disabled = !(state.file && elements.consent.checked);
});
elements.dropZone.addEventListener("dragover", (event) => { event.preventDefault(); elements.dropZone.classList.add("is-dragging"); });
elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("is-dragging"));
elements.dropZone.addEventListener("drop", (event) => {
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
elements.previewStatusFilters.forEach((button) => button.addEventListener("click", () => {
  setPreviewStatusFilter(button.dataset.statusFilter);
}));
elements.previewPrevious.addEventListener("click", () => setPreviewPage(state.previewPage - 1, true));
elements.previewNext.addEventListener("click", () => setPreviewPage(state.previewPage + 1, true));
$("#generate-button").addEventListener("click", generateFile);
$("#new-conversion").addEventListener("click", resetConversion);
$$('[data-back]').forEach((button) => button.addEventListener("click", () => showStep(Number(button.dataset.back))));
window.addEventListener("beforeunload", resetGeneratedFile);
