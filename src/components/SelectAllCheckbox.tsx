"use client";

// Toggles every checkbox associated with `formId` (via the HTML `form`
// attribute, since they live inside <table> rows rather than as children of
// the bulk-action <form> itself) without needing to lift the whole table
// into a client component.
export function SelectAllCheckbox({ formId, name }: { formId: string; name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(e) => {
        const checkboxes = document.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][form="${formId}"][name="${name}"]`
        );
        checkboxes.forEach((cb) => {
          cb.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
