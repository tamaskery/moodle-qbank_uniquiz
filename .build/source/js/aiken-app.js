import {
  AIKEN_SEVERITY,
  analyzeAiken,
  applyAikenReviewFix,
  applySafeAikenFixes,
  createAikenFilename,
  formatAikenIssueContext,
} from "./aiken-core.js?v=0.7.0";

const $ = (selector, root = document) => root.querySelector(selector);

const state = {
  original: "",
  current: "",
  analysis: null,
  repaired: 0,
  downloadUrl: null,
  editorTimer: null,
  sourceRevision: 0,
};

const elements = {
  file: $("#aiken-file"),
  choose: $("#aiken-choose"),
  dropZone: $("#aiken-drop-zone"),
  selected: $("#aiken-selected"),
  source: $("#aiken-source"),
  check: $("#check-aiken"),
  error: $("#aiken-error"),
  status: $("#aiken-status"),
  processing: $("#aiken-processing"),
  results: $("#aiken-results"),
  metrics: $("#aiken-metrics"),
  issues: $("#aiken-issues"),
  fixSafe: $("#fix-safe"),
  reset: $("#reset-aiken"),
  corrected: $("#aiken-corrected"),
  editorState: $("#editor-state"),
  validation: $("#aiken-validation"),
  download: $("#download-aiken"),
};

function announce(message) {
  elements.status.textContent = "";
  requestAnimationFrame(() => { elements.status.textContent = message; });
}

function preferredScrollBehavior() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.error.focus();
}

function clearError() {
  elements.error.hidden = true;
  elements.error.textContent = "";
}

function resetDownload() {
  if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = null;
  elements.download.removeAttribute("href");
  elements.download.removeAttribute("download");
  elements.download.setAttribute("aria-disabled", "true");
}

function invalidateAnalysis() {
  state.sourceRevision += 1;
  window.clearTimeout(state.editorTimer);
  state.editorTimer = null;
  state.analysis = null;
  state.original = "";
  state.current = "";
  state.repaired = 0;
  resetDownload();
  elements.file.value = "";
  elements.selected.textContent = "";
  elements.selected.hidden = true;
  elements.status.textContent = "";
  elements.corrected.value = "";
  elements.results.hidden = true;
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

function renderMetrics() {
  const { summary, bySeverity } = state.analysis;
  elements.metrics.replaceChildren(
    metric(summary.total, summary.total === 1 ? "question detected" : "questions detected"),
    metric(summary.valid, "valid"),
    metric(bySeverity.SAFE_FIX.length, "safely fixable"),
    metric(bySeverity.REVIEW.length, "require review"),
    metric(bySeverity.ERROR.length, "blocking errors"),
  );
}

function textBlock(label, value) {
  const wrapper = document.createElement("div");
  const heading = document.createElement("span");
  heading.textContent = label;
  const pre = document.createElement("pre");
  pre.dir = "auto";
  pre.textContent = value || "—";
  wrapper.append(heading, pre);
  return wrapper;
}

function renderIssues() {
  elements.issues.replaceChildren();
  if (!state.analysis.issues.length) {
    const notice = document.createElement("div");
    notice.className = "notice notice-success";
    const strong = document.createElement("strong");
    strong.textContent = "✓ No unresolved AIKEN issues";
    const paragraph = document.createElement("p");
    paragraph.textContent = "Every detected question has canonical structure and one valid correct answer.";
    notice.append(strong, paragraph);
    elements.issues.append(notice);
    return;
  }

  state.analysis.issues.forEach((item) => {
    const card = document.createElement("article");
    card.className = "aiken-issue";
    card.dataset.severity = item.severity;
    const header = document.createElement("header");
    const explanation = document.createElement("strong");
    explanation.textContent = item.explanation;
    const severity = document.createElement("span");
    severity.className = "aiken-severity";
    severity.textContent = item.severity.replace("_", " ");
    header.append(explanation, severity);
    const code = document.createElement("p");
    code.className = "aiken-issue-code";
    code.textContent = formatAikenIssueContext(item);
    card.append(header, code);

    if (item.originalText || item.proposedText) {
      const comparison = document.createElement("div");
      comparison.className = "aiken-before-after";
      comparison.append(textBlock("Before", item.originalText), textBlock("Proposed", item.proposedText));
      card.append(comparison);
    }
    if (item.severity === AIKEN_SEVERITY.REVIEW && item.replacement) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-secondary aiken-review-button";
      button.dataset.reviewId = item.id;
      button.textContent = "Approve this change";
      card.append(button);
    }
    elements.issues.append(card);
  });
}

function prepareDownload() {
  resetDownload();
  if (!state.analysis.validForDownload) return;
  const blob = new Blob([state.current.endsWith("\n") ? state.current : `${state.current}\n`], {
    type: "text/plain;charset=utf-8",
  });
  state.downloadUrl = URL.createObjectURL(blob);
  elements.download.href = state.downloadUrl;
  elements.download.download = createAikenFilename();
  elements.download.removeAttribute("aria-disabled");
}

function renderValidation() {
  const { summary, bySeverity, validForDownload } = state.analysis;
  elements.validation.replaceChildren();
  const strong = document.createElement("strong");
  const paragraph = document.createElement("p");
  if (validForDownload) {
    elements.validation.className = "notice notice-success";
    strong.textContent = "AIKEN validation passed";
    const questionNoun = summary.total === 1 ? "question" : "questions";
    const repairNoun = state.repaired === 1 ? "formatting issue" : "formatting issues";
    paragraph.textContent = `${summary.total} ${questionNoun} · ${summary.total} valid · ${state.repaired} ${repairNoun} repaired · 0 unresolved errors`;
  } else {
    elements.validation.className = "notice notice-error";
    strong.textContent = "Download is disabled until validation passes";
    paragraph.textContent = `${bySeverity.SAFE_FIX.length} safe fixes · ${bySeverity.REVIEW.length} review changes · ${bySeverity.ERROR.length} blocking errors remain.`;
  }
  elements.validation.append(strong, paragraph);
  elements.fixSafe.disabled = bySeverity.SAFE_FIX.length === 0;
  elements.editorState.textContent = validForDownload ? "Ready to download" : "Revalidation required";
  prepareDownload();
}

function renderAll({ syncEditor = true } = {}) {
  renderMetrics();
  renderIssues();
  if (syncEditor && elements.corrected.value !== state.current) elements.corrected.value = state.current;
  renderValidation();
  elements.results.hidden = false;
}

function reanalyze({ syncEditor = true } = {}) {
  state.analysis = analyzeAiken(state.current);
  renderAll({ syncEditor });
  const questionNoun = state.analysis.summary.total === 1 ? "question" : "questions";
  announce(state.analysis.validForDownload
    ? `AIKEN validation passed for ${state.analysis.summary.total} ${questionNoun}.`
    : `AIKEN checked. ${state.analysis.bySeverity.ERROR.length} blocking errors remain.`);
}

async function decodeUtf8(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("This file is not valid UTF-8. Save it as UTF-8, then try again.");
  }
}

async function acceptFile(file) {
  clearError();
  invalidateAnalysis();
  const revision = state.sourceRevision;
  if (!file || file.name.split(".").pop()?.toLocaleLowerCase() !== "txt") {
    showError("Choose a Moodle AIKEN .txt file.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showError("This file is larger than 5 MB. Split it into smaller AIKEN files and try again.");
    return;
  }
  try {
    const text = await decodeUtf8(file);
    if (revision !== state.sourceRevision) return;
    elements.source.value = text;
    elements.selected.textContent = `${file.name} · ${(file.size / 1024).toFixed(file.size < 1024 ? 1 : 0)} KB selected`;
    elements.selected.hidden = false;
    announce(`${file.name} loaded locally. Select Check AIKEN to continue.`);
  } catch (error) {
    showError(error.message);
  }
}

async function checkSource() {
  clearError();
  const source = elements.source.value;
  const revision = state.sourceRevision;
  if (!source.trim()) {
    showError("Upload or paste at least one AIKEN question before checking.");
    return;
  }
  elements.processing.hidden = false;
  document.body.setAttribute("aria-busy", "true");
  await new Promise((resolve) => window.setTimeout(resolve, 350));
  if (revision !== state.sourceRevision) {
    elements.processing.hidden = true;
    document.body.removeAttribute("aria-busy");
    return;
  }
  state.original = source;
  state.current = source;
  state.repaired = 0;
  reanalyze();
  elements.processing.hidden = true;
  document.body.removeAttribute("aria-busy");
  elements.results.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
}

let dragDepth = 0;

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function clearDragState() {
  dragDepth = 0;
  elements.dropZone.classList.remove("is-dragging");
}

elements.choose.addEventListener("click", () => elements.file.click());
elements.file.addEventListener("change", () => acceptFile(elements.file.files?.[0]));
elements.source.addEventListener("input", invalidateAnalysis);
elements.dropZone.addEventListener("dragenter", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  elements.dropZone.classList.add("is-dragging");
});
elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (isFileDrag(event)) {
    event.dataTransfer.dropEffect = "copy";
    elements.dropZone.classList.add("is-dragging");
  }
});
elements.dropZone.addEventListener("dragleave", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) elements.dropZone.classList.remove("is-dragging");
});
elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  clearDragState();
  acceptFile(event.dataTransfer?.files?.[0]);
});
elements.check.addEventListener("click", checkSource);

elements.fixSafe.addEventListener("click", () => {
  const fixedCount = state.analysis.bySeverity.SAFE_FIX.length;
  if (!fixedCount) return;
  state.current = applySafeAikenFixes(state.current);
  state.repaired += fixedCount;
  reanalyze();
  announce(`${fixedCount} safe formatting issues fixed. Review changes were not applied.`);
});

elements.issues.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-id]");
  if (!button) return;
  const review = state.analysis.bySeverity.REVIEW.find((item) => item.id === button.dataset.reviewId);
  if (!review) return;
  state.current = applyAikenReviewFix(state.current, review);
  state.repaired += 1;
  reanalyze();
  announce("The reviewed change was applied and the complete AIKEN text was revalidated.");
});

elements.reset.addEventListener("click", () => {
  state.current = state.original;
  state.repaired = 0;
  reanalyze();
  announce("The original AIKEN input was restored.");
});

elements.corrected.addEventListener("input", () => {
  state.current = elements.corrected.value;
  resetDownload();
  elements.editorState.textContent = "Checking changes…";
  window.clearTimeout(state.editorTimer);
  state.editorTimer = window.setTimeout(() => reanalyze({ syncEditor: false }), 180);
});

elements.download.addEventListener("click", (event) => {
  if (!state.analysis?.validForDownload || !state.downloadUrl) {
    event.preventDefault();
    announce("Download remains disabled until the corrected AIKEN passes validation.");
  }
});

window.addEventListener("beforeunload", resetDownload);
