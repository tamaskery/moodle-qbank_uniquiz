/** UniQuiz © 2026 Tamas Kery. GNU GPL v3 or later. See COPYING.txt. */
import {string as uiString} from "qbank_uniquiz/i18n";
import {
    AIKEN_SEVERITY,
    analyzeAiken,
    applyAikenReviewFix,
    applySafeAikenFixes,
    createAikenFilename,
    formatAikenIssueContext,
} from "qbank_uniquiz/aiken-core";
export const init = () => {
    const container = document.getElementById("qbank-uniquiz");
    if (!container || container.dataset.initialized) {
        return;
    }
    container.dataset.initialized = "true";
    const $ = (selector, root = container) => root.querySelector(selector);
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
    /**
     *
     * @param {*} message
     */
    function announce(message) {
        elements.status.textContent = "";
        requestAnimationFrame(() => {
            elements.status.textContent = message;
        });
    }
    /**
     *
     */
    function preferredScrollBehavior() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    }
    /**
     *
     * @param {*} message
     */
    function showError(message) {
        elements.error.textContent = message;
        elements.error.hidden = false;
        elements.error.focus();
    }
    /**
     *
     */
    function clearError() {
        elements.error.hidden = true;
        elements.error.textContent = "";
    }
    /**
     *
     */
    function resetDownload() {
        if (state.downloadUrl) {
            URL.revokeObjectURL(state.downloadUrl);
        }
        state.downloadUrl = null;
        elements.download.removeAttribute("href");
        elements.download.removeAttribute("download");
        elements.download.setAttribute("aria-disabled", "true");
    }
    /**
     *
     */
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
    /**
     *
     * @param {*} value
     * @param {*} label
     */
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
    /**
     *
     */
    function renderMetrics() {
        const {summary, bySeverity} = state.analysis;
        elements.metrics.replaceChildren(
            metric(
                summary.total,
                summary.total === 1
                    ? uiString("js_aiken_app_question_detected")
                    : uiString("js_aiken_app_questions_detected"),
            ),
            metric(summary.valid, uiString("js_aiken_app_valid")),
            metric(bySeverity.SAFE_FIX.length, uiString("js_aiken_app_safely_fixable")),
            metric(bySeverity.REVIEW.length, uiString("js_aiken_app_require_review")),
            metric(bySeverity.ERROR.length, uiString("js_aiken_app_blocking_errors")),
        );
    }
    /**
     *
     * @param {*} label
     * @param {*} value
     */
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
    /**
     *
     */
    function renderIssues() {
        elements.issues.replaceChildren();
        if (!state.analysis.issues.length) {
            const notice = document.createElement("div");
            notice.className = "notice notice-success";
            const strong = document.createElement("strong");
            strong.textContent = uiString("js_aiken_app_no_unresolved_aiken_issues");
            const paragraph = document.createElement("p");
            paragraph.textContent = uiString("js_aiken_app_every_detected_question_has_canonical_structure_");
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
            severity.textContent = {
                ["SAFE_FIX"]: uiString("js_aiken_app_safe_fix"),
                REVIEW: uiString("js_aiken_app_review_required"),
                ERROR: uiString("js_aiken_app_blocking_error"),
            }[item.severity];
            header.append(explanation, severity);
            const code = document.createElement("p");
            code.className = "aiken-issue-code";
            code.textContent = formatAikenIssueContext(item);
            card.append(header, code);
            if (item.originalText || item.proposedText) {
                const comparison = document.createElement("div");
                comparison.className = "aiken-before-after";
                comparison.append(
                    textBlock(uiString("js_aiken_app_before"), item.originalText),
                    textBlock(uiString("js_aiken_app_proposed"), item.proposedText),
                );
                card.append(comparison);
            }
            if (item.severity === AIKEN_SEVERITY.REVIEW && item.replacement) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "button button-secondary aiken-review-button";
                button.dataset.reviewId = item.id;
                button.textContent = uiString("js_aiken_app_approve_this_change");
                card.append(button);
            }
            elements.issues.append(card);
        });
    }
    /**
     *
     */
    function prepareDownload() {
        resetDownload();
        if (!state.analysis.validForDownload) {
            return;
        }
        const blob = new Blob([state.current.endsWith("\n") ? state.current : `${state.current}\n`], {
            type: "text/plain;charset=utf-8",
        });
        state.downloadUrl = URL.createObjectURL(blob);
        elements.download.href = state.downloadUrl;
        elements.download.download = createAikenFilename();
        elements.download.removeAttribute("aria-disabled");
    }
    /**
     *
     */
    function renderValidation() {
        const {summary, bySeverity, validForDownload} = state.analysis;
        elements.validation.replaceChildren();
        const strong = document.createElement("strong");
        const paragraph = document.createElement("p");
        if (validForDownload) {
            elements.validation.className = "notice notice-success";
            strong.textContent = uiString("js_aiken_app_aiken_validation_passed");
            const questionNoun =
                summary.total === 1 ? uiString("js_aiken_app_question") : uiString("js_aiken_app_questions");
            const repairNoun =
                state.repaired === 1
                    ? uiString("js_aiken_app_formatting_issue")
                    : uiString("js_aiken_app_formatting_issues");
            paragraph.textContent = uiString("js_aiken_app_valid_repaired_0_unresolved_errors", {
                p0: summary.total,
                p1: questionNoun,
                p2: summary.total,
                p3: state.repaired,
                p4: repairNoun,
            });
        } else {
            elements.validation.className = "notice notice-error";
            strong.textContent = uiString("js_aiken_app_download_is_disabled_until_validation_passes");
            paragraph.textContent = uiString(
                "js_aiken_app_safe_fixes_review_changes_blocking_errors_remain",
                {
                    p0: bySeverity.SAFE_FIX.length,
                    p1: bySeverity.REVIEW.length,
                    p2: bySeverity.ERROR.length,
                },
            );
        }
        elements.validation.append(strong, paragraph);
        elements.fixSafe.disabled = bySeverity.SAFE_FIX.length === 0;
        elements.editorState.textContent = validForDownload
            ? uiString("js_aiken_app_ready_to_download")
            : uiString("js_aiken_app_revalidation_required");
        prepareDownload();
    }
    /**
     *
     * @param {*} root0
     * @param {*} root0.syncEditor
     */
    function renderAll({syncEditor = true} = {}) {
        renderMetrics();
        renderIssues();
        if (syncEditor && elements.corrected.value !== state.current) {
            elements.corrected.value = state.current;
        }
        renderValidation();
        elements.results.hidden = false;
    }
    /**
     *
     * @param {*} root0
     * @param {*} root0.syncEditor
     */
    function reanalyze({syncEditor = true} = {}) {
        state.analysis = analyzeAiken(state.current);
        renderAll({
            syncEditor,
        });
        const questionNoun =
            state.analysis.summary.total === 1
                ? uiString("js_aiken_app_question")
                : uiString("js_aiken_app_questions");
        announce(
            state.analysis.validForDownload
                ? uiString("js_aiken_app_aiken_validation_passed_for", {
                      p0: state.analysis.summary.total,
                      p1: questionNoun,
                  })
                : uiString("js_aiken_app_aiken_checked_blocking_errors_remain", {
                      p0: state.analysis.bySeverity.ERROR.length,
                  }),
        );
    }
    /**
     *
     * @param {*} file
     */
    async function decodeUtf8(file) {
        const buffer = await file.arrayBuffer();
        try {
            return new TextDecoder("utf-8", {
                fatal: true,
            }).decode(buffer);
        } catch {
            throw new Error(uiString("js_aiken_app_this_file_is_not_valid_utf_8_save_it_as_utf_8_th"));
        }
    }
    /**
     *
     * @param {*} file
     */
    async function acceptFile(file) {
        clearError();
        invalidateAnalysis();
        const revision = state.sourceRevision;
        if (!file || file.name.split(".").pop()?.toLocaleLowerCase() !== "txt") {
            showError(uiString("js_aiken_app_choose_a_moodle_aiken_txt_file"));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showError(uiString("js_aiken_app_this_file_is_larger_than_5_mb_split_it_into_smal"));
            return;
        }
        try {
            const text = await decodeUtf8(file);
            if (revision !== state.sourceRevision) {
                return;
            }
            elements.source.value = text;
            elements.selected.textContent = uiString("js_aiken_app_kb_selected", {
                p0: file.name,
                p1: (file.size / 1024).toFixed(file.size < 1024 ? 1 : 0),
            });
            elements.selected.hidden = false;
            announce(
                uiString("js_aiken_app_loaded_locally_select_check_aiken_to_continue", {
                    p0: file.name,
                }),
            );
        } catch (error) {
            showError(error.message);
        }
    }
    /**
     *
     */
    async function checkSource() {
        clearError();
        const source = elements.source.value;
        const revision = state.sourceRevision;
        if (!source.trim()) {
            showError(uiString("js_aiken_app_upload_or_paste_at_least_one_aiken_question_befo"));
            return;
        }
        elements.processing.hidden = false;
        container.setAttribute("aria-busy", "true");
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        if (revision !== state.sourceRevision) {
            elements.processing.hidden = true;
            container.removeAttribute("aria-busy");
            return;
        }
        state.original = source;
        state.current = source;
        state.repaired = 0;
        reanalyze();
        elements.processing.hidden = true;
        container.removeAttribute("aria-busy");
        elements.results.scrollIntoView({
            behavior: preferredScrollBehavior(),
            block: "start",
        });
    }
    let dragDepth = 0;
    /**
     *
     * @param {*} event
     */
    function isFileDrag(event) {
        return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    }
    /**
     *
     */
    function clearDragState() {
        dragDepth = 0;
        elements.dropZone.classList.remove("is-dragging");
    }
    elements.choose.addEventListener("click", () => elements.file.click());
    elements.file.addEventListener("change", () => acceptFile(elements.file.files?.[0]));
    elements.source.addEventListener("input", invalidateAnalysis);
    elements.dropZone.addEventListener("dragenter", (event) => {
        if (!isFileDrag(event)) {
            return;
        }
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
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
            elements.dropZone.classList.remove("is-dragging");
        }
    });
    elements.dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        clearDragState();
        acceptFile(event.dataTransfer?.files?.[0]);
    });
    elements.check.addEventListener("click", checkSource);
    elements.fixSafe.addEventListener("click", () => {
        const fixedCount = state.analysis.bySeverity.SAFE_FIX.length;
        if (!fixedCount) {
            return;
        }
        state.current = applySafeAikenFixes(state.current);
        state.repaired += fixedCount;
        reanalyze();
        announce(
            uiString("js_aiken_app_safe_formatting_issues_fixed_review_changes_were", {
                p0: fixedCount,
            }),
        );
    });
    elements.issues.addEventListener("click", (event) => {
        const button = event.target.closest("[data-review-id]");
        if (!button) {
            return;
        }
        const review = state.analysis.bySeverity.REVIEW.find((item) => item.id === button.dataset.reviewId);
        if (!review) {
            return;
        }
        state.current = applyAikenReviewFix(state.current, review);
        state.repaired += 1;
        reanalyze();
        announce(uiString("js_aiken_app_the_reviewed_change_was_applied_and_the_complete"));
    });
    elements.reset.addEventListener("click", () => {
        state.current = state.original;
        state.repaired = 0;
        reanalyze();
        announce(uiString("js_aiken_app_the_original_aiken_input_was_restored"));
    });
    elements.corrected.addEventListener("input", () => {
        state.current = elements.corrected.value;
        resetDownload();
        elements.editorState.textContent = uiString("js_aiken_app_checking_changes");
        window.clearTimeout(state.editorTimer);
        state.editorTimer = window.setTimeout(
            () =>
                reanalyze({
                    syncEditor: false,
                }),
            180,
        );
    });
    elements.download.addEventListener("click", (event) => {
        if (!state.analysis?.validForDownload || !state.downloadUrl) {
            event.preventDefault();
            announce(uiString("js_aiken_app_download_remains_disabled_until_the_corrected_ai"));
        }
    });
    window.addEventListener("beforeunload", resetDownload);
};
