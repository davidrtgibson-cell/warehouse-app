// Shared parsing for pasted tab-separated text (copied straight out of
// Excel/Sheets) or a plain CSV file's contents — used by every bulk-upload
// flow in Settings (Standard Roster, Team members) so two importers can't
// quietly disagree on what counts as a valid paste: same delimiter-sniffing
// (tab if the line has one, else comma) and quote-stripping rules.

export function splitCsvLine(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : ",";
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
}

// `headerFirstCell` is the expected text of row 1's first column (e.g.
// "Employee Code") — if it matches (case-insensitively), that row is
// treated as a header and dropped rather than parsed as data.
export function parseCsvRows(rawText: string, headerFirstCell: string): string[][] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const rows = lines.map(splitCsvLine);
  if (rows[0][0]?.toLowerCase() === headerFirstCell.toLowerCase()) return rows.slice(1);
  return rows;
}
