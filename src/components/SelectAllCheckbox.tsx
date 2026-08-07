"use client";

// Toggles every checkbox associated with `formId` (via the HTML `form`
// attribute, since they live inside <table> rows rather than as children of
// the bulk-action <form> itself) without needing to lift the whole table
// into a client component. Skips rows hidden by RosterSearchBox's filter,
// so "select all" means "select all visible".
export function SelectAllCheckbox({ formId, name }: { formId: string; name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all visible"
      onChange={(e) => {
        const checkboxes = document.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][form="${formId}"][name="${name}"]`
        );
        checkboxes.forEach((cb) => {
          const row = cb.closest("tr");
          const visible = !row || row.style.display !== "none";
          if (visible) cb.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
