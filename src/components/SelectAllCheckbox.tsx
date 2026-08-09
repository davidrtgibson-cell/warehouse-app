"use client";

import { useEffect, useState } from "react";

// Toggles every checkbox associated with `formId` (via the HTML `form`
// attribute, since they live inside <table> rows rather than as children of
// the bulk-action <form> itself) without needing to lift the whole table
// into a client component. Skips rows hidden by RosterSearchBox's filter,
// so "select all" means "select all visible".
//
// Also tracks a live selected count and offers a "Clear" action (Tier 3 #7
// in BACKLOG.md — the plain unlabeled checkbox this used to be had no
// visible label and no feedback on how many rows were actually selected
// before running a bulk action; CasualPoolPanel just below it on the same
// page already has this richer pattern). Listens for change events on the
// individual row checkboxes too, not just its own toggle, since a leader
// can check/uncheck rows one at a time as well as via this control.
export function SelectAllCheckbox({ formId, name }: { formId: string; name: string }) {
  const [count, setCount] = useState(0);
  const selector = `input[type="checkbox"][form="${formId}"][name="${name}"]`;

  function visibleCheckboxes() {
    return Array.from(document.querySelectorAll<HTMLInputElement>(selector)).filter((cb) => {
      const row = cb.closest("tr");
      return !row || row.style.display !== "none";
    });
  }

  useEffect(() => {
    const recount = () => setCount(visibleCheckboxes().filter((cb) => cb.checked).length);
    recount();
    document.addEventListener("change", recount);
    return () => document.removeEventListener("change", recount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectAll(checked: boolean) {
    const boxes = visibleCheckboxes();
    boxes.forEach((cb) => {
      cb.checked = checked;
    });
    setCount(checked ? boxes.length : 0);
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex cursor-pointer items-center gap-1.5">
        <input type="checkbox" aria-label="Select all visible" onChange={(e) => selectAll(e.currentTarget.checked)} />
        <span className="text-zinc-600 dark:text-zinc-400">Select all visible</span>
      </label>
      <span className="text-zinc-500">{count} selected</span>
      {count > 0 && (
        <button type="button" onClick={() => selectAll(false)} className="text-zinc-500 hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}
