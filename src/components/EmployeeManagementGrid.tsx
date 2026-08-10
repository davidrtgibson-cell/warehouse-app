"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  createEmployeeAction,
  setEmployeeActiveAction,
  updateEmployeeAction,
  type EmployeeInput,
} from "@/lib/actions/employees";
import { isNewPermOrPartTime, isTempToPermConversion } from "@/lib/employee-rules";
import { EmploymentType, Shift } from "@/generated/prisma/enums";
import { formatEmploymentType } from "@/lib/roster-display";

export type EmployeeRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentType: EmploymentType;
  agencyName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  defaultShift: Shift | null;
  isActive: boolean;
};

export type DepartmentOption = { id: string; name: string };

const EMPLOYMENT_TYPE_OPTIONS = Object.values(EmploymentType);
const SHIFT_OPTIONS = Object.values(Shift);

function fieldClass() {
  return "mt-0.5 block w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
}

function EmployeeModal({
  employee,
  departments,
  onClose,
}: {
  employee: EmployeeRow | null; // null = creating
  departments: DepartmentOption[];
  onClose: (result?: { suggestStandardRoster: boolean; employeeCode: string; name: string }) => void;
}) {
  const [employeeCode, setEmployeeCode] = useState(employee?.employeeCode ?? "");
  const [firstName, setFirstName] = useState(employee?.firstName ?? "");
  const [lastName, setLastName] = useState(employee?.lastName ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(employee?.employmentType ?? EmploymentType.CASUAL);
  const [agencyName, setAgencyName] = useState(employee?.agencyName ?? "");
  const [departmentId, setDepartmentId] = useState(employee?.departmentId ?? "");
  const [defaultShift, setDefaultShift] = useState<Shift | "">(employee?.defaultShift ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    const input: EmployeeInput = {
      employeeCode,
      firstName,
      lastName,
      employmentType,
      agencyName: agencyName || null,
      departmentId: departmentId || null,
      defaultShift: defaultShift || null,
    };
    startTransition(async () => {
      try {
        if (employee) {
          const result = await updateEmployeeAction(employee.id, input);
          onClose({
            suggestStandardRoster: result.suggestStandardRoster,
            employeeCode: input.employeeCode.trim(),
            name: `${input.firstName.trim()} ${input.lastName.trim()}`,
          });
        } else {
          const result = await createEmployeeAction(input);
          onClose({
            suggestStandardRoster: result.suggestStandardRoster,
            employeeCode: input.employeeCode.trim(),
            name: `${input.firstName.trim()} ${input.lastName.trim()}`,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  const willConvert = employee
    ? isTempToPermConversion(employee.employmentType, employmentType)
    : isNewPermOrPartTime(employmentType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="font-semibold">{employee ? "Edit team member" : "Add team member"}</div>
          <button type="button" onClick={() => onClose()} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">
            Employee code
            <input value={employeeCode} disabled={isPending} onChange={(e) => setEmployeeCode(e.target.value)} className={fieldClass()} />
          </label>
          <label className="text-xs text-zinc-500">
            Default shift
            <select value={defaultShift} disabled={isPending} onChange={(e) => setDefaultShift(e.target.value as Shift | "")} className={fieldClass()}>
              <option value="">—</option>
              {SHIFT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            First name
            <input value={firstName} disabled={isPending} onChange={(e) => setFirstName(e.target.value)} className={fieldClass()} />
          </label>
          <label className="text-xs text-zinc-500">
            Last name
            <input value={lastName} disabled={isPending} onChange={(e) => setLastName(e.target.value)} className={fieldClass()} />
          </label>
          <label className="text-xs text-zinc-500">
            Employment type
            <select
              value={employmentType}
              disabled={isPending}
              onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
              className={fieldClass()}
            >
              {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {formatEmploymentType(t, null)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Department
            <select value={departmentId} disabled={isPending} onChange={(e) => setDepartmentId(e.target.value)} className={fieldClass()}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {employmentType === EmploymentType.AGENCY && (
            <label className="col-span-2 text-xs text-zinc-500">
              Agency name
              <input value={agencyName} disabled={isPending} onChange={(e) => setAgencyName(e.target.value)} className={fieldClass()} />
            </label>
          )}
        </div>

        {willConvert && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {employee
              ? `This moves ${employee.firstName} from casual/agency/contractor to a standing employment type — after saving, you'll be prompted to set up their Standard Roster pattern (they don't have one yet).`
              : "After saving, you'll be prompted to set up this person's Standard Roster pattern — perm/part-time employees need one."}
          </p>
        )}

        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({
  banner,
  onDismiss,
}: {
  banner: { employeeCode: string; name: string };
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      <span>
        {banner.name} is perm/part-time and has no Standard Roster pattern yet.{" "}
        <Link href={`/settings/standard-roster?q=${encodeURIComponent(banner.employeeCode)}`} className="underline">
          Set up their pattern →
        </Link>
      </span>
      <button type="button" onClick={onDismiss} className="text-emerald-800 hover:underline dark:text-emerald-200">
        Dismiss
      </button>
    </div>
  );
}

export function EmployeeManagementGrid({ employees, departments }: { employees: EmployeeRow[]; departments: DepartmentOption[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const [editing, setEditing] = useState<EmployeeRow | null | "NEW">(null);
  const [conversionBanner, setConversionBanner] = useState<{ employeeCode: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === "ACTIVE" && !e.isActive) return false;
      if (statusFilter === "INACTIVE" && e.isActive) return false;
      if (typeFilter !== "ALL" && e.employmentType !== typeFilter) return false;
      if (!q) return true;
      return `${e.employeeCode} ${e.firstName} ${e.lastName}`.toLowerCase().includes(q);
    });
  }, [employees, search, typeFilter, statusFilter]);

  function toggleActive(employee: EmployeeRow) {
    startTransition(async () => {
      try {
        await setEmployeeActiveAction(employee.id, !employee.isActive);
        setRowMessage(null);
      } catch (err) {
        setRowMessage({ id: employee.id, text: err instanceof Error ? err.message : "Failed to update" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {conversionBanner && <StatusBanner banner={conversionBanner} onDismiss={() => setConversionBanner(null)} />}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <input
          type="text"
          placeholder="Search name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[180px] flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="ALL">All types</option>
          {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {formatEmploymentType(t, null)}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ACTIVE" | "INACTIVE" | "ALL")}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ALL">All</option>
        </select>
        <span className="text-xs text-zinc-500">{filtered.length} of {employees.length}</span>
        <button
          type="button"
          onClick={() => setEditing("NEW")}
          className="ml-auto rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          + Add team member
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Employee</th>
              <th className="whitespace-nowrap px-3 py-2">Type</th>
              <th className="whitespace-nowrap px-3 py-2">Department</th>
              <th className="whitespace-nowrap px-3 py-2">Default shift</th>
              <th className="whitespace-nowrap px-3 py-2">Status</th>
              <th className="whitespace-nowrap px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No matching employees.
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id} className={`bg-white dark:bg-zinc-950 ${!e.isActive ? "opacity-50" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="font-medium">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="font-mono text-xs text-zinc-500">{e.employeeCode}</div>
                    {rowMessage?.id === e.id && <div className="text-xs text-red-600">{rowMessage.text}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {formatEmploymentType(e.employmentType, e.agencyName)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{e.departmentName ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{e.defaultShift ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {e.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setEditing(e)}
                      className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => toggleActive(e)}
                      className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      {e.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EmployeeModal
          employee={editing === "NEW" ? null : editing}
          departments={departments}
          onClose={(result) => {
            setEditing(null);
            if (result?.suggestStandardRoster) {
              setConversionBanner({ employeeCode: result.employeeCode, name: result.name });
            }
          }}
        />
      )}
    </div>
  );
}
