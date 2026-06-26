import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATTENDANCE_STATUSES,
  CORRECTION_REQUEST_STATUSES,
  EVENT_STATUSES,
  NFC_CREDENTIAL_STATUSES,
  SESSION_STATUSES,
  STUDENT_STATUSES,
  USER_ROLES,
  VERIFICATION_METHODS
} from "@/types/enums";
import { plpassFixtures } from "@/mocks/fixtures";
import { adminTestContext, createQueryClientWrapper, studentTestContext } from "@/mocks/testHelpers";
import { useStudents } from "@/hooks/useRepositoryQueries";
import { repositories } from "@/services/repositories";
import { developmentErrorToggle } from "@/services/mock/developmentErrorToggle";
import { RepositoryError } from "@/services/mock/mockRepositoryUtils";

afterEach(() => {
  developmentErrorToggle.reset();
});

describe("mock repository error toggle defaults", () => {
  it("is disabled by default", () => {
    expect(developmentErrorToggle.getMode("userManagement")).toBe("none");
    expect(developmentErrorToggle.getMode("attendanceRecords")).toBe("none");
  });
});

describe("domain enum values", () => {
  it("exposes required enum values", () => {
    expect(USER_ROLES).toEqual(["admin", "faculty", "organizer", "student"]);
    expect(STUDENT_STATUSES).toEqual(["enrolled", "loa", "dropped", "archived"]);
    expect(ATTENDANCE_STATUSES).toEqual(["present", "late", "absent", "excused"]);
    expect(VERIFICATION_METHODS).toEqual(["nfc", "qr", "manual", "online"]);
    expect(NFC_CREDENTIAL_STATUSES).toEqual(["activated", "inactive", "lost", "damaged", "replaced", "blocked"]);
    expect(SESSION_STATUSES).toEqual(["draft", "active", "completed", "cancelled"]);
    expect(EVENT_STATUSES).toEqual(["pending", "approved", "rejected", "completed", "cancelled"]);
    expect(CORRECTION_REQUEST_STATUSES).toEqual(["pending", "approved", "rejected"]);
  });
});

describe("fixture validity", () => {
  it("contains the minimum required records and valid relationships", () => {
    expect(plpassFixtures.users.filter((user) => user.role === "admin")).toHaveLength(1);
    expect(plpassFixtures.users.filter((user) => user.role === "faculty")).toHaveLength(2);
    expect(plpassFixtures.users.filter((user) => user.role === "organizer")).toHaveLength(2);
    expect(plpassFixtures.students).toHaveLength(12);
    expect(plpassFixtures.departments).toHaveLength(3);
    expect(plpassFixtures.programs).toHaveLength(3);
    expect(plpassFixtures.semesters).toHaveLength(2);
    expect(plpassFixtures.classes).toHaveLength(4);
    expect(plpassFixtures.events).toHaveLength(4);

    const userIds = new Set(plpassFixtures.users.map((user) => user.id));
    const studentIds = new Set(plpassFixtures.students.map((student) => student.id));
    const facultyIds = new Set(plpassFixtures.facultyProfiles.map((faculty) => faculty.id));
    const organizerIds = new Set(plpassFixtures.organizerProfiles.map((organizer) => organizer.id));
    const departmentIds = new Set(plpassFixtures.departments.map((department) => department.id));
    const programIds = new Set(plpassFixtures.programs.map((program) => program.id));
    const semesterIds = new Set(plpassFixtures.semesters.map((semester) => semester.id));
    const classIds = new Set(plpassFixtures.classes.map((classRecord) => classRecord.id));
    const eventIds = new Set(plpassFixtures.events.map((event) => event.id));
    const sessionIds = new Set(plpassFixtures.attendanceSessions.map((session) => session.id));
    const recordIds = new Set(plpassFixtures.attendanceRecords.map((record) => record.id));
    const credentialIds = new Set(plpassFixtures.nfcCredentials.map((credential) => credential.id));
    const readerIds = new Set(plpassFixtures.nfcReaders.map((reader) => reader.id));

    expect(plpassFixtures.students.every((student) => userIds.has(student.userId) && programIds.has(student.programId) && departmentIds.has(student.departmentId))).toBe(true);
    expect(plpassFixtures.facultyProfiles.every((profile) => userIds.has(profile.userId) && departmentIds.has(profile.departmentId))).toBe(true);
    expect(plpassFixtures.organizerProfiles.every((profile) => userIds.has(profile.userId) && (!profile.departmentId || departmentIds.has(profile.departmentId)))).toBe(true);
    expect(plpassFixtures.adminProfiles.every((profile) => userIds.has(profile.userId))).toBe(true);
    expect(plpassFixtures.programs.every((program) => departmentIds.has(program.departmentId))).toBe(true);
    expect(
      plpassFixtures.classes.every(
        (classRecord) =>
          facultyIds.has(classRecord.facultyId) &&
          programIds.has(classRecord.programId) &&
          departmentIds.has(classRecord.departmentId) &&
          semesterIds.has(classRecord.semesterId)
      )
    ).toBe(true);
    expect(plpassFixtures.classRosters.every((entry) => studentIds.has(entry.studentId) && classIds.has(entry.classId))).toBe(true);
    expect(plpassFixtures.events.every((event) => organizerIds.has(event.organizerId) && (!event.departmentId || departmentIds.has(event.departmentId)))).toBe(true);
    expect(plpassFixtures.eventParticipants.every((entry) => studentIds.has(entry.studentId) && eventIds.has(entry.eventId))).toBe(true);
    expect(
      plpassFixtures.attendanceSessions.every((session) => {
        if (!userIds.has(session.createdByUserId)) {
          return false;
        }

        if (session.type === "class") {
          return typeof session.classId === "string" && classIds.has(session.classId);
        }

        return typeof session.eventId === "string" && eventIds.has(session.eventId);
      })
    ).toBe(true);
    expect(plpassFixtures.attendanceRecords.every((record) => studentIds.has(record.studentId) && sessionIds.has(record.sessionId))).toBe(true);
    expect(
      plpassFixtures.nfcCredentials.every(
        (credential) =>
          studentIds.has(credential.studentId) &&
          (!credential.replacedByCredentialId || credentialIds.has(credential.replacedByCredentialId))
      )
    ).toBe(true);
    expect(plpassFixtures.nfcReaders.every((reader) => !reader.assignedToUserId || userIds.has(reader.assignedToUserId))).toBe(true);
    expect(
      plpassFixtures.nfcTapAttempts.every(
        (attempt) =>
          sessionIds.has(attempt.sessionId) &&
          readerIds.has(attempt.readerId) &&
          (!attempt.studentId || studentIds.has(attempt.studentId))
      )
    ).toBe(true);
    expect(
      plpassFixtures.correctionRequests.every(
        (request) =>
          studentIds.has(request.studentId) &&
          recordIds.has(request.attendanceRecordId) &&
          (!request.classId || classIds.has(request.classId)) &&
          (!request.eventId || eventIds.has(request.eventId)) &&
          (!request.reviewedByUserId || userIds.has(request.reviewedByUserId))
      )
    ).toBe(true);
    expect(plpassFixtures.reports.every((report) => userIds.has(report.requestedByUserId))).toBe(true);
    expect(plpassFixtures.notifications.every((notification) => userIds.has(notification.userId))).toBe(true);
    expect(plpassFixtures.auditLogs.every((log) => userIds.has(log.actorUserId))).toBe(true);
    expect(
      plpassFixtures.mlPredictions.every(
        (prediction) =>
          (!prediction.studentId || studentIds.has(prediction.studentId)) &&
          (!prediction.classId || classIds.has(prediction.classId)) &&
          (!prediction.eventId || eventIds.has(prediction.eventId))
      )
    ).toBe(true);
    expect(plpassFixtures.mlPredictions.map((prediction) => prediction.type)).toEqual([
      "random_forest_risk",
      "linear_regression_anomaly",
      "k_means_cluster"
    ]);
  });
});

describe("mock repository behavior", () => {
  it("filters students by program and search text", async () => {
    const result = await repositories.userManagement.listStudents(
      { pageIndex: 0, pageSize: 10, programId: "program-bsit", search: "2026-0001" },
      adminTestContext
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.studentNumber).toBe("2026-0001");
  });

  it("paginates repository results", async () => {
    const result = await repositories.userManagement.listStudents({ pageIndex: 1, pageSize: 5 }, adminTestContext);

    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(12);
    expect(result.pageIndex).toBe(1);
    expect(result.pageCount).toBe(3);
  });

  it("enforces permission boundaries", async () => {
    await expect(repositories.userManagement.listUsers({ pageIndex: 0, pageSize: 10 }, studentTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
  });

  it("simulates repository errors through the development toggle", async () => {
    developmentErrorToggle.setRepositoryMode("userManagement", "server_error");

    await expect(repositories.userManagement.listStudents({ pageIndex: 0, pageSize: 10 }, adminTestContext)).rejects.toBeInstanceOf(
      RepositoryError
    );
    await expect(repositories.userManagement.listStudents({ pageIndex: 0, pageSize: 10 }, adminTestContext)).rejects.toMatchObject({
      code: "SERVER_ERROR"
    });
  });
});

describe("React Query repository hooks", () => {
  it("exposes loading and success states", async () => {
    const wrapper = createQueryClientWrapper();
    const { result } = renderHook(() => useStudents({ pageIndex: 0, pageSize: 4 }, adminTestContext), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(4);
    expect(result.current.refetch).toBeTypeOf("function");
  });

  it("exposes error state from mock error simulation", async () => {
    developmentErrorToggle.setRepositoryMode("userManagement", "validation_error");

    const wrapper = createQueryClientWrapper();
    const { result } = renderHook(() => useStudents({ pageIndex: 0, pageSize: 4 }, adminTestContext), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
