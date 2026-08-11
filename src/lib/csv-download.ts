// Client-side CSV building/download helpers shared by every "Download
// current X (CSV)" button in Settings (Standard Roster, Team members) —
// same escaping rule and download mechanism, so the file a "Download"
// button produces always round-trips cleanly back through that same
// screen's bulk-upload parser (parseCsvRows in src/lib/csv-parse.ts).

export function csvCell(value: string): string {
  return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

export function downloadCsvFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
