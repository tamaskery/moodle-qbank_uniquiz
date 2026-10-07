export const LEGAL_CONFIG = Object.freeze({
  operatorName: "Tamas Kery",
  operatorAddress: "Not provided",
  operatorCountry: "Hungary",
  contactEmail: "tom@tomkery.eu",
  termsVersion: "1.1 — 13 August 2026",
  privacyVersion: "1.1 — 13 August 2026",
});

document.querySelectorAll("[data-legal-field]").forEach((element) => {
  const value = LEGAL_CONFIG[element.dataset.legalField];
  if (!value) return;
  element.textContent = value;
  if (element.matches("a") && element.dataset.legalField === "contactEmail") {
    element.href = `mailto:${value}`;
  }
});
