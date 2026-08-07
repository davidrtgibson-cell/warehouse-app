"use client";

// Filters the roster table(s) by name/code as you type, without a server
// round-trip. Rows opt in via a `data-search` attribute (lowercase
// "firstname lastname employeecode") rather than this component knowing
// the table's shape, so it works across however many shift sections are
// currently rendered. Hiding via display:none (rather than unmounting) is
// also what lets SelectAllCheckbox tell which rows are "visible".
export function RosterSearchBox() {
  return (
    <input
      type="text"
      placeholder="Search name…"
      onChange={(e) => {
        const term = e.currentTarget.value.trim().toLowerCase();
        document.querySelectorAll<HTMLTableRowElement>("tr[data-search]").forEach((row) => {
          const haystack = row.dataset.search ?? "";
          row.style.display = !term || haystack.includes(term) ? "" : "none";
        });
      }}
      className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
    />
  );
}
