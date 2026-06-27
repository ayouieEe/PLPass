import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repositories } from "@/services/repositories";
import type {
  AddRosterStudentInput,
  CreateClassSessionInput,
  CreateCorrectionRequestInput,
  CreateEventInput,
  CreateEventSessionInput,
  CreateNfcCredentialRequestInput,
  EndAttendanceSessionInput,
  AttendanceScanInput,
  ManualAttendanceInput,
  ReviewCorrectionRequestInput,
  UpdateSystemSettingsInput
} from "@/services/contracts";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { EventStatus, NfcCredentialStatus, NfcReaderStatus } from "@/types/enums";
import type { ListQuery } from "@/types/filters";

const queryDefaults = {
  pageIndex: 0,
  pageSize: 10
} satisfies Pick<ListQuery, "pageIndex" | "pageSize">;

function queryWithDefaults(query?: Partial<ListQuery>): ListQuery {
  return { ...queryDefaults, ...query };
}

export function useAuthSession(context?: RepositoryContext) {
  return useQuery({
    queryKey: ["authSession", context],
    queryFn: () => repositories.authentication.getSession(context)
  });
}

export function useDevelopmentAccounts() {
  return useQuery({
    queryKey: ["developmentAccounts"],
    queryFn: () => repositories.authentication.listDevelopmentAccounts()
  });
}

export function useUsers(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["users", listQuery, context],
    queryFn: () => repositories.userManagement.listUsers(listQuery, context)
  });
}

export function useUser(userId: string | undefined, context?: RepositoryContext) {
  return useQuery({
    queryKey: ["user", userId, context],
    queryFn: () => repositories.userManagement.getUserById(userId ?? "", context),
    enabled: Boolean(userId)
  });
}

export function useStudents(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["students", listQuery, context],
    queryFn: () => repositories.userManagement.listStudents(listQuery, context)
  });
}

export function useFacultyProfiles(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["facultyProfiles", listQuery, context],
    queryFn: () => repositories.userManagement.listFacultyProfiles(listQuery, context)
  });
}

export function useOrganizerProfiles(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["organizerProfiles", listQuery, context],
    queryFn: () => repositories.userManagement.listOrganizerProfiles(listQuery, context)
  });
}

export function useAdminProfiles(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["adminProfiles", listQuery, context],
    queryFn: () => repositories.userManagement.listAdminProfiles(listQuery, context)
  });
}

export function useAcademicCatalog(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return {
    departments: useQuery({
      queryKey: ["departments", listQuery, context],
      queryFn: () => repositories.academicManagement.listDepartments(listQuery, context)
    }),
    programs: useQuery({
      queryKey: ["programs", listQuery, context],
      queryFn: () => repositories.academicManagement.listPrograms(listQuery, context)
    }),
    semesters: useQuery({
      queryKey: ["semesters", listQuery, context],
      queryFn: () => repositories.academicManagement.listSemesters(listQuery, context)
    })
  };
}

export function useClasses(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["classes", listQuery, context],
    queryFn: () => repositories.academicManagement.listClasses(listQuery, context)
  });
}

export function useClass(classId: string | undefined, context?: RepositoryContext) {
  return useQuery({
    queryKey: ["class", classId, context],
    queryFn: () => repositories.academicManagement.getClassById(classId ?? "", context),
    enabled: Boolean(classId),
    retry: false
  });
}

export function useClassRosters(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["classRosters", listQuery, context],
    queryFn: () => repositories.classRosters.listClassRosters(listQuery, context)
  });
}

export function useRosterMutations(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  const invalidateRosters = async () => {
    await queryClient.invalidateQueries({ queryKey: ["classRosters"] });
    await queryClient.invalidateQueries({ queryKey: ["studentsForClass"] });
  };
  return {
    addStudentMutation: useMutation({
      mutationFn: (input: AddRosterStudentInput) => repositories.classRosters.addStudentToClass(input, context),
      onSuccess: invalidateRosters
    }),
    removeStudentMutation: useMutation({
      mutationFn: (input: AddRosterStudentInput) =>
        repositories.classRosters.removeStudentFromClass(input.classId, input.studentId, context),
      onSuccess: invalidateRosters
    })
  };
}

export function useStudentsForClass(classId: string | undefined, query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["studentsForClass", classId, listQuery, context],
    queryFn: () => repositories.classRosters.listStudentsForClass(classId ?? "", listQuery, context),
    enabled: Boolean(classId)
  });
}

export function useEvents(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["events", listQuery, context],
    queryFn: () => repositories.eventManagement.listEvents(listQuery, context)
  });
}

export function useEvent(eventId: string | undefined, context?: RepositoryContext) {
  return useQuery({
    queryKey: ["event", eventId, context],
    queryFn: () => repositories.eventManagement.getEventById(eventId ?? "", context),
    enabled: Boolean(eventId),
    retry: false
  });
}

export function useEventMutations(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  return {
    createEventMutation: useMutation({
      mutationFn: (input: CreateEventInput) => repositories.eventManagement.createEvent(input, context),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["events"] });
        await queryClient.invalidateQueries({ queryKey: ["eventParticipants"] });
        await queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
      }
    })
  };
}

export function useEventStatusMutation(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      eventId: string;
      status: Extract<EventStatus, "approved" | "rejected">;
      reason?: string;
    }) => repositories.eventManagement.updateEventStatus(input.eventId, input.status, input.reason, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    }
  });
}

export function useEventParticipants(eventId: string, query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["eventParticipants", eventId, listQuery, context],
    queryFn: () => repositories.eventManagement.listEventParticipants(eventId, listQuery, context),
    enabled: Boolean(eventId)
  });
}

export function useAttendanceSessions(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["attendanceSessions", listQuery, context],
    queryFn: () => repositories.attendanceSessions.listAttendanceSessions(listQuery, context)
  });
}

export function useAttendanceSession(sessionId: string | undefined, context?: RepositoryContext) {
  return useQuery({
    queryKey: ["attendanceSession", sessionId, context],
    queryFn: () => repositories.attendanceSessions.getAttendanceSessionById(sessionId ?? "", context),
    enabled: Boolean(sessionId),
    retry: false
  });
}

export function useAttendanceSessionMutations(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  const invalidateSessions = async () => {
    await queryClient.invalidateQueries({ queryKey: ["attendanceSessions"] });
    await queryClient.invalidateQueries({ queryKey: ["attendanceSession"] });
    await queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });
    await queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
  };
  return {
    createClassSessionMutation: useMutation({
      mutationFn: (input: CreateClassSessionInput) => repositories.attendanceSessions.createClassSession(input, context),
      onSuccess: invalidateSessions
    }),
    createEventSessionMutation: useMutation({
      mutationFn: (input: CreateEventSessionInput) => repositories.attendanceSessions.createEventSession(input, context),
      onSuccess: invalidateSessions
    }),
    endSessionMutation: useMutation({
      mutationFn: (input: EndAttendanceSessionInput) => repositories.attendanceSessions.endAttendanceSession(input, context),
      onSuccess: invalidateSessions
    })
  };
}

export function useAttendanceRecords(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["attendanceRecords", listQuery, context],
    queryFn: () => repositories.attendanceRecords.listAttendanceRecords(listQuery, context)
  });
}

export function useAttendanceSimulationMutations(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  const invalidateAttendance = async () => {
    await queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });
    await queryClient.invalidateQueries({ queryKey: ["attendanceSessions"] });
    await queryClient.invalidateQueries({ queryKey: ["attendanceSession"] });
    await queryClient.invalidateQueries({ queryKey: ["nfcTapAttempts"] });
    await queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
    await queryClient.invalidateQueries({ queryKey: ["mlPredictions"] });
  };
  return {
    credentialScanMutation: useMutation({
      mutationFn: (input: AttendanceScanInput) => repositories.attendanceRecords.simulateCredentialAttendance(input, context),
      onSuccess: invalidateAttendance
    }),
    manualAttendanceMutation: useMutation({
      mutationFn: (input: ManualAttendanceInput) => repositories.attendanceRecords.simulateManualAttendance(input, context),
      onSuccess: invalidateAttendance
    })
  };
}

export function useAttendanceRecord(recordId: string | undefined, context?: RepositoryContext) {
  return useQuery({
    queryKey: ["attendanceRecord", recordId, context],
    queryFn: () => repositories.attendanceRecords.getAttendanceRecordById(recordId ?? "", context),
    enabled: Boolean(recordId),
    retry: false
  });
}

export function useNfcCredentials(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["nfcCredentials", listQuery, context],
    queryFn: () => repositories.nfcCredentials.listNfcCredentials(listQuery, context)
  });
}

export function useNfcCredentialStatusMutation(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { credentialId: string; status: NfcCredentialStatus }) =>
      repositories.nfcCredentials.updateCredentialStatus(input.credentialId, input.status, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["nfcCredentials"] });
      await queryClient.invalidateQueries({ queryKey: ["nfcCredentialForStudent"] });
    }
  });
}

export function useNfcCredentialForStudent(studentId: string | undefined, context?: RepositoryContext) {
  return useQuery({
    queryKey: ["nfcCredentialForStudent", studentId, context],
    queryFn: () => repositories.nfcCredentials.getCredentialForStudent(studentId ?? "", context),
    enabled: Boolean(studentId)
  });
}

export function useNfcCredentialRequests(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  const queryClient = useQueryClient();
  const listQueryResult = useQuery({
    queryKey: ["nfcCredentialRequests", listQuery, context],
    queryFn: () => repositories.nfcCredentialRequests.listNfcCredentialRequests(listQuery, context)
  });
  const createMutation = useMutation({
    mutationFn: (input: CreateNfcCredentialRequestInput) =>
      repositories.nfcCredentialRequests.createNfcCredentialRequest(input, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["nfcCredentialRequests"] });
      await queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
    }
  });

  return { ...listQueryResult, createMutation };
}

export function useNfcReaders(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["nfcReaders", listQuery, context],
    queryFn: () => repositories.nfcReaders.listNfcReaders(listQuery, context)
  });
}

export function useNfcReaderStatusMutation(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { readerId: string; status: NfcReaderStatus }) =>
      repositories.nfcReaders.updateReaderStatus(input.readerId, input.status, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["nfcReaders"] });
    }
  });
}

export function useNfcTapAttempts(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["nfcTapAttempts", listQuery, context],
    queryFn: () => repositories.nfcReaders.listNfcTapAttempts(listQuery, context)
  });
}

export function useCorrectionRequests(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  const queryClient = useQueryClient();
  const listQueryResult = useQuery({
    queryKey: ["correctionRequests", listQuery, context],
    queryFn: () => repositories.correctionRequests.listCorrectionRequests(listQuery, context)
  });
  const createMutation = useMutation({
    mutationFn: (input: CreateCorrectionRequestInput) =>
      repositories.correctionRequests.createCorrectionRequest(input, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["correctionRequests"] });
    }
  });
  const reviewMutation = useMutation({
    mutationFn: (input: ReviewCorrectionRequestInput) =>
      repositories.correctionRequests.reviewCorrectionRequest(input, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["correctionRequests"] });
      await queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
    }
  });

  return { ...listQueryResult, createMutation, reviewMutation };
}

export function useReports(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["reports", listQuery, context],
    queryFn: () => repositories.reports.listReports(listQuery, context)
  });
}

export function useNotifications(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  const queryClient = useQueryClient();
  const queryKey = ["notifications", listQuery, context] as const;
  const listQueryResult = useQuery({
    queryKey,
    queryFn: () => repositories.notifications.listNotifications(listQuery, context)
  });
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => repositories.notifications.markNotificationRead(notificationId, context),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current: typeof listQueryResult.data) =>
        current
          ? {
              ...current,
              items: current.items.map((notification) =>
                notification.id === notificationId ? { ...notification, status: "read" as const } : notification
              )
            }
          : current
      );
      return { previous };
    },
    onError: (_error, _variables, mutationContext) => {
      if (mutationContext?.previous) {
        queryClient.setQueryData(queryKey, mutationContext.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => repositories.notifications.markAllNotificationsRead(context),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current: typeof listQueryResult.data) =>
        current
          ? {
              ...current,
              items: current.items.map((notification) => ({ ...notification, status: "read" as const }))
            }
          : current
      );
      return { previous };
    },
    onError: (_error, _variables, mutationContext) => {
      if (mutationContext?.previous) {
        queryClient.setQueryData(queryKey, mutationContext.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  return { ...listQueryResult, markReadMutation, markAllReadMutation };
}

export function useNotificationUnreadCount(context?: RepositoryContext) {
  const listQuery = queryWithDefaults({ notificationStatus: "unread", pageSize: 100 });
  return useQuery({
    queryKey: ["notifications", "unreadCount", context],
    queryFn: () => repositories.notifications.listNotifications(listQuery, context),
    enabled: Boolean(context),
    select: (result) => result.total
  });
}

export function useNotificationsQuery(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["notifications", listQuery, context],
    queryFn: () => repositories.notifications.listNotifications(listQuery, context)
  });
}

export function useAuditLogs(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["auditLogs", listQuery, context],
    queryFn: () => repositories.auditLogs.listAuditLogs(listQuery, context)
  });
}

export function useMlPredictions(query?: Partial<ListQuery>, context?: RepositoryContext) {
  const listQuery = queryWithDefaults(query);
  return useQuery({
    queryKey: ["mlPredictions", listQuery, context],
    queryFn: () => repositories.analyticsMl.listMlPredictions(listQuery, context)
  });
}

export function useSystemSettings(context?: RepositoryContext) {
  const queryClient = useQueryClient();
  const queryKey = ["systemSettings", context] as const;
  const settingsQuery = useQuery({
    queryKey,
    queryFn: () => repositories.systemSettings.getSettings(context)
  });
  const updateMutation = useMutation({
    mutationFn: (input: UpdateSystemSettingsInput) => repositories.systemSettings.updateSettings(input, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    }
  });

  return { ...settingsQuery, updateMutation };
}
