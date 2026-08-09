import { NextRequest } from "next/server";
import { buildLaborReportRows, reportRowsToCsv } from "@/lib/reporting";
import { EmploymentType, Shift } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

function str(v: string | null): string | undefined {
  return v && v.length > 0 ? v : undefined;
}

// Same filters as /reports, no row cap (that page's preview table caps at
// 200 for on-screen readability; the export is the full, ungrouped detail
// — one row per employee+task, exactly what buildLaborReportRows returns).
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = str(sp.get("from"));
  const to = str(sp.get("to"));
  if (!from || !to) {
    return new Response("Missing required from/to date range", { status: 400 });
  }

  const rows = await buildLaborReportRows({
    from,
    to,
    shift: str(sp.get("shift")) as Shift | undefined,
    employeeId: str(sp.get("employeeId")),
    taskId: str(sp.get("taskId")),
    departmentId: str(sp.get("departmentId")),
    employmentType: str(sp.get("employmentType")) as EmploymentType | undefined,
    agencyName: str(sp.get("agencyName")),
  });

  const csv = reportRowsToCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="labour-report-${from}-to-${to}.csv"`,
    },
  });
}
