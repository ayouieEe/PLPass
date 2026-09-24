import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const auditMigration = read("supabase/migrations/20260925001000_allow_department_admin_export_audit_logging.sql");

describe("organizer export report options", () => {
  it("uses the shared report workflow for the active organizer directory", () => {
    const page = read("src/features/organizer/pages/OrganizerUserManagement.tsx");

    expect(page).toContain('exportKind="organizers"');
    expect(page).toContain("organizerRows={exportRows}");
    expect(page).toContain("Organizer Directory");
    expect(page).toContain("Events Managed Summary");
    expect(page).toContain("exportOrganizerDirectoryXlsx");
    expect(page).toContain("exportOrganizerDirectoryPdf");
    expect(page).toContain("exportOrganizerEventsSummaryXlsx");
    expect(page).toContain("exportOrganizerEventsSummaryPdf");
  });

  it("defines complete organizer directory and aggregate summary columns", () => {
    const utils = read("src/features/organizer/utils/exportUtils.ts");

    for (const column of ["Organizer", "Email", "Employee ID", "Department", "Position", "Status", "Events Managed"]) {
      expect(utils).toContain(column);
    }
    expect(utils).toContain('title: "Organizer Directory Report"');
    expect(utils).toContain('title: "Events Managed Summary Report"');
    expect(utils).toContain("ExportOrganizerEventsSection");
    expect(utils).toContain('"Event Code": event.eventCode');
    expect(utils).toContain('"Event Name": event.eventName');
    expect(utils).not.toContain("Organizer: event.organizerName");
    expect(utils).toContain("Employee ID: ${section.employeeNumber}");
    expect(utils).toContain("Events handled: ${section.rows.length}");
    for (const column of ["Attendance Rate", "Organizer", "Department", "Position"]) {
      expect(utils).toContain(column);
    }
    expect(utils).toContain("showSectionHeaders: true");
  });

  it("keeps export metadata tied to the filtered page dataset", () => {
    const page = read("src/features/organizer/pages/OrganizerUserManagement.tsx");

    expect(page).toContain('filters: "page-filtered"');
    expect(page).toContain("recordCount: records.length");
    expect(page).toContain("selected export criteria");
    expect(page).toContain('exportKind === "organizers" ? "organizer" : "student"');
    expect(page).toContain("No managed events match the selected organizer criteria.");
    expect(page).toContain("attendanceRate:");
    expect(page).toContain("activeSemester");
  });

  it("allows active department administrators to record their own export audit entry", () => {
    expect(auditMigration).toContain("role in ('admin', 'department_admin', 'organizer')");
    expect(auditMigration).toContain("grant execute on function public.log_client_action");
  });
});
