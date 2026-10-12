function csvRow(index, state = "ready") {
  const answers = state === "warning"
    ? ["Repeated answer", "Repeated answer", `Distinct ${index}`]
    : [`Correct ${index}`, `Distractor ${index}`, `Alternative ${index}`];
  const correct = state === "error" ? "" : "A";
  return [`Question ${index}?`, ...answers, correct].join(",");
}

export function diagnosticBankCsv(total, { warningIndexes = [], errorIndexes = [] } = {}) {
  const warnings = new Set(warningIndexes);
  const errors = new Set(errorIndexes);
  const rows = ["Question,Answer A,Answer B,Answer C,Correct"];
  for (let index = 1; index <= total; index += 1) {
    rows.push(csvRow(index, errors.has(index) ? "error" : warnings.has(index) ? "warning" : "ready"));
  }
  return rows.join("\n");
}

export const BANK_FIXTURES = Object.freeze({
  one: { total: 1, warningIndexes: [], errorIndexes: [] },
  twenty: { total: 20, warningIndexes: [], errorIndexes: [] },
  fortySeven: { total: 47, warningIndexes: [], errorIndexes: [] },
  twoHundred: { total: 200, warningIndexes: [24, 107, 198], errorIndexes: [] },
  oneThousand: {
    total: 1000,
    warningIndexes: [21, 24, 80, 145, 220, 310, 400, 500, 620, 710, 800, 900, 950, 996],
    errorIndexes: [134, 501, 999, 1000],
  },
});
