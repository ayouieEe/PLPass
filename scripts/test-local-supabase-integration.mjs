import assert from "node:assert/strict";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const publishableKey = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.LOCAL_SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error(
    "Set LOCAL_SUPABASE_URL, LOCAL_SUPABASE_PUBLISHABLE_KEY, and LOCAL_SUPABASE_SECRET_KEY from `npx supabase status`."
  );
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/u.test(url)) {
  throw new Error(`Refusing to run destructive integration setup against non-local URL: ${url}`);
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const ids = {
  organizerUser: "10000000-0000-4000-8000-000000000001",
  organizerTwoUser: "10000000-0000-4000-8000-000000000002",
  studentUser: "20000000-0000-4000-8000-000000000001",
  studentTwoUser: "20000000-0000-4000-8000-000000000002",
  department: "30000000-0000-4000-8000-000000000001",
  program: "30000000-0000-4000-8000-000000000002",
  section: "30000000-0000-4000-8000-000000000003",
  category: "30000000-0000-4000-8000-000000000004",
  organizer: "40000000-0000-4000-8000-000000000001",
  organizerTwo: "40000000-0000-4000-8000-000000000002",
  student: "50000000-0000-4000-8000-000000000001",
  studentTwo: "50000000-0000-4000-8000-000000000002",
  event: "60000000-0000-4000-8000-000000000001",
  upcomingEvent: "60000000-0000-4000-8000-000000000004",
  eventSession: "60000000-0000-4000-8000-000000000002",
  attendanceRecord: "60000000-0000-4000-8000-000000000003",
  eventObjective: "60000000-0000-4000-8000-000000000005",
  eventFeedback: "60000000-0000-4000-8000-000000000006"
};

const password = "PLPass-Local-Integration-2026!";
const users = [
  { id: ids.organizerUser, email: "organizer.integration@plpass.local", role: "organizer", first: "Olivia", last: "Organizer", employeeId: "LOCAL-ORG-01" },
  { id: ids.organizerTwoUser, email: "organizer.two.integration@plpass.local", role: "organizer", first: "Oscar", last: "Organizer", employeeId: "LOCAL-ORG-02" },
  { id: ids.studentUser, email: "student.integration@plpass.local", role: "student", first: "Sofia", last: "Student", studentId: "LOCAL-STU-01" },
  { id: ids.studentTwoUser, email: "student.two.integration@plpass.local", role: "student", first: "Samuel", last: "Student", studentId: "LOCAL-STU-02" }
];

function check(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function userClient() {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function signIn(email) {
  const client = userClient();
  const data = check(await client.auth.signInWithPassword({ email, password }), `sign in ${email}`);
  assert.ok(data.session?.access_token, `${email} should receive an authenticated session`);
  return client;
}

async function removePreviousRun() {
  check(await admin.from("events").delete().like("event_code", "LOCAL-INTEGRATION-%"), "delete previous events");
  check(await admin.from("attendance_requests").delete().in("student_id", [ids.student, ids.studentTwo]), "delete previous attendance requests");
  check(await admin.from("credential_requests").delete().in("student_id", [ids.student, ids.studentTwo]), "delete previous credential requests");
  check(await admin.from("audit_logs").delete().in("actor_user_id", users.map((user) => user.id)), "delete previous audit logs");
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error && !/not found/i.test(result.error.message)) throw result.error;
  }
}

async function createFixtures() {
  check(await admin.from("departments").upsert({ id: ids.department, department_code: "LOCAL-QA", department_name: "Local Integration Testing" }), "upsert department");
  check(await admin.from("programs").upsert({ id: ids.program, department_id: ids.department, program_code: "LOCAL-QA", program_name: "Local QA Program" }), "upsert program");
  check(await admin.from("sections").upsert({ id: ids.section, program_id: ids.program, section_name: "LOCAL-1A", year_level: 1, academic_year: "2026-2027", semester: "First" }), "upsert section");
  check(await admin.from("event_categories").upsert({ id: ids.category, category_name: "Local Integration" }), "upsert category");

  for (const user of users) {
    check(
      await admin.auth.admin.createUser({ id: user.id, email: user.email, password, email_confirm: true }),
      `create auth user ${user.email}`
    );
    check(
      await admin.from("profiles").insert({
        id: user.id,
        email: user.email,
        first_name: user.first,
        last_name: user.last,
        role: user.role,
        account_status: "active",
        department_id: ids.department,
        employee_id: user.employeeId ?? null,
        student_id: user.studentId ?? null
      }),
      `create profile ${user.email}`
    );
  }

  check(await admin.from("organizers").insert([
    { id: ids.organizer, profile_id: ids.organizerUser, employee_id: users[0].employeeId, department_id: ids.department, organization_name: "PLPass QA", position: "Lead Organizer", organizer_status: "active" },
    { id: ids.organizerTwo, profile_id: ids.organizerTwoUser, employee_id: users[1].employeeId, department_id: ids.department, organization_name: "PLPass QA", position: "Second Organizer", organizer_status: "active" }
  ]), "create organizers");
  check(await admin.from("students").insert([
    { id: ids.student, profile_id: ids.studentUser, student_id: users[2].studentId, program_id: ids.program, department_id: ids.department, section_id: ids.section, year_level: 1, student_status: "enrolled" },
    { id: ids.studentTwo, profile_id: ids.studentTwoUser, student_id: users[3].studentId, program_id: ids.program, department_id: ids.department, section_id: ids.section, year_level: 1, student_status: "enrolled" }
  ]), "create students");
}

async function run() {
  await removePreviousRun();
  await createFixtures();

  const organizer = await signIn(users[0].email);
  const organizerTwo = await signIn(users[1].email);
  const student = await signIn(users[2].email);
  const studentTwo = await signIn(users[3].email);

  const ownStudentProfile = check(await student.from("profiles").select("id, role").eq("id", ids.studentUser).single(), "student reads own profile");
  assert.equal(ownStudentProfile.role, "student");
  const hiddenOrganizerProfile = check(await student.from("profiles").select("id").eq("id", ids.organizerUser), "student queries organizer profile");
  assert.equal(hiddenOrganizerProfile.length, 0, "student must not read organizer profile rows");
  const organizerProfiles = check(await organizer.from("profiles").select("id").in("id", [ids.studentUser, ids.organizerTwoUser]), "organizer reads managed profiles");
  assert.equal(organizerProfiles.length, 2, "active organizer should read managed profiles");

  const startsAt = new Date(Date.now() + 3_600_000).toISOString();
  const endsAt = new Date(Date.now() + 7_200_000).toISOString();
  const transactionalEvent = check(await organizer.rpc("create_organizer_event", {
    p_event_code: "LOCAL-INTEGRATION-ATOMIC",
    p_category_id: ids.category,
    p_title: "Transactional Organizer Event",
    p_description: "Created atomically with participants, objectives, and a resource.",
    p_venue: "Local Transaction Room",
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_priority_level: "Flexible",
    p_impact_score: 7,
    p_visibility: "assigned",
    p_participant_ids: [ids.student],
    p_objectives: ["Validate atomic creation", "Validate participant visibility", "Validate resources"],
    p_resource_title: "Event handbook",
    p_resource_url: "https://example.edu/event-handbook",
    p_publish_reason: "Ready for integration verification"
  }), "organizer atomically creates an event");
  assert.equal(transactionalEvent.approval_reason, "Ready for integration verification");
  assert.equal(check(await student.from("events").select("id").eq("id", transactionalEvent.id), "assigned student reads transactional event").length, 1);
  assert.equal(check(await studentTwo.from("events").select("id").eq("id", transactionalEvent.id), "unassigned student queries transactional event").length, 0, "unassigned students must not see assigned-only events");
  assert.equal(check(await student.from("event_resources").select("resource_title").eq("event_id", transactionalEvent.id), "assigned student reads event resource").length, 1);
  assert.equal(check(await organizer.from("event_objectives").select("id").eq("event_id", transactionalEvent.id), "organizer reads transactional objectives").length, 3);

  const failedAtomicEvent = await organizer.rpc("create_organizer_event", {
    p_event_code: "LOCAL-INTEGRATION-ROLLBACK",
    p_category_id: ids.category,
    p_title: "Must Roll Back",
    p_description: "Invalid participant should roll back everything.",
    p_venue: "Local Transaction Room",
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_priority_level: "Flexible",
    p_impact_score: 1,
    p_visibility: "assigned",
    p_participant_ids: ["ffffffff-ffff-4fff-8fff-ffffffffffff"],
    p_objectives: ["Must not persist"],
    p_resource_title: null,
    p_resource_url: null,
    p_publish_reason: "Rollback verification"
  });
  assert.ok(failedAtomicEvent.error, "invalid participant creation must fail");
  assert.equal(check(await admin.from("events").select("id").eq("event_code", "LOCAL-INTEGRATION-ROLLBACK"), "verify event creation rollback").length, 0);
  const event = check(await organizer.from("events").insert({
    id: ids.event,
    event_code: "LOCAL-INTEGRATION-01",
    organizer_id: ids.organizer,
    department_id: ids.department,
    category_id: ids.category,
    title: "PLPass Local Integration Event",
    description: "Created by the organizer through authenticated RLS.",
    venue: "Local QA Room",
    starts_at: startsAt,
    ends_at: endsAt,
    event_status: "scheduled",
    approval_status: "pending"
  }).select().single(), "organizer creates event");
  assert.equal(event.organizer_id, ids.organizer);

  const studentCannotCreate = await student.from("events").insert({
    event_code: "LOCAL-INTEGRATION-FORBIDDEN",
    organizer_id: ids.organizer,
    category_id: ids.category,
    title: "Forbidden",
    venue: "Nowhere",
    starts_at: startsAt,
    ends_at: endsAt
  });
  assert.ok(studentCannotCreate.error, "student must not create an event");
  assert.equal(check(await student.from("events").select("id").eq("id", ids.event), "student reads pending event").length, 0, "student must not see pending event");
  assert.equal(check(await organizerTwo.from("events").select("id").eq("id", ids.event), "other organizer reads pending event").length, 0, "another organizer must not see a pending event owned by someone else");

  check(await organizer.from("event_participants").insert({ event_id: ids.event, student_id: ids.student, participant_status: "confirmed" }), "organizer assigns participant");
  assert.equal(check(await student.from("event_participants").select("student_id").eq("event_id", ids.event), "student reads own participation").length, 1);
  assert.equal(check(await studentTwo.from("event_participants").select("student_id").eq("event_id", ids.event), "other student queries participation").length, 0, "other student must not see another student's participation");
  assert.equal(check(await organizerTwo.from("event_participants").select("student_id").eq("event_id", ids.event), "other organizer queries participation").length, 0, "other organizer must not see participation for an event they do not own");

  check(await admin.from("events").update({ approval_status: "approved" }).eq("id", ids.event), "approve event fixture");
  assert.equal(check(await student.from("events").select("id").eq("id", ids.event), "student reads approved event").length, 1, "student should see approved event");

  const upcomingStartsAt = new Date(Date.now() + 86_400_000).toISOString();
  const upcomingEndsAt = new Date(Date.now() + 90_000_000).toISOString();
  check(await organizer.from("events").insert({
    id: ids.upcomingEvent,
    event_code: "LOCAL-INTEGRATION-02",
    organizer_id: ids.organizer,
    department_id: ids.department,
    category_id: ids.category,
    title: "PLPass Upcoming Student Event",
    description: "Future assigned event for real browser verification.",
    venue: "Local QA Auditorium",
    starts_at: upcomingStartsAt,
    ends_at: upcomingEndsAt,
    event_status: "scheduled",
    approval_status: "approved"
  }), "organizer creates upcoming event");
  check(await organizer.from("event_participants").insert({ event_id: ids.upcomingEvent, student_id: ids.student, participant_status: "confirmed" }), "organizer assigns upcoming participant");

  const liveStart = new Date(Date.now() - 60_000).toISOString();
  const liveEnd = new Date(Date.now() + 3_600_000).toISOString();
  const liveEvent = check(await organizer.from("events").insert({
    event_code: "LOCAL-INTEGRATION-LIVE",
    organizer_id: ids.organizer,
    department_id: ids.department,
    category_id: ids.category,
    title: "Live Attendance Lifecycle",
    venue: "Local Live Room",
    starts_at: liveStart,
    ends_at: liveEnd,
    event_status: "scheduled",
    approval_status: "approved",
    visibility: "assigned"
  }).select().single(), "organizer creates live attendance event");
  check(await organizer.from("event_participants").insert([
    { event_id: liveEvent.id, student_id: ids.student, participant_status: "confirmed" },
    { event_id: liveEvent.id, student_id: ids.studentTwo, participant_status: "confirmed" }
  ]), "organizer assigns live attendance participants");
  const liveSession = check(await organizer.rpc("start_event_attendance_session", {
    p_event_id: liveEvent.id,
    p_venue: "Local Live Room",
    p_scheduled_start: liveStart,
    p_scheduled_end: liveEnd,
    p_mode: "f2f",
    p_late_cutoff_minutes: 15
  }), "owner starts live attendance session");
  const duplicateLiveSession = await organizer.rpc("start_event_attendance_session", {
    p_event_id: liveEvent.id, p_venue: "Local Live Room", p_scheduled_start: liveStart, p_scheduled_end: liveEnd, p_mode: "f2f", p_late_cutoff_minutes: 15
  });
  assert.ok(duplicateLiveSession.error, "only one active session may exist per event");
  const manualRecord = check(await organizer.rpc("record_manual_event_attendance", {
    p_session_id: liveSession.id,
    p_student_id: ids.student,
    p_status: "present",
    p_reason: "Student device was unavailable",
    p_remarks: "Identity checked by organizer",
    p_late_reason: null,
    p_occurred_at: new Date().toISOString()
  }), "owner records manual attendance");
  assert.equal(manualRecord.recorded_by, ids.organizerUser);
  const invalidManualReason = await organizer.rpc("record_manual_event_attendance", {
    p_session_id: liveSession.id, p_student_id: ids.studentTwo, p_status: "present", p_reason: "", p_remarks: null, p_late_reason: null, p_occurred_at: new Date().toISOString()
  });
  assert.ok(invalidManualReason.error, "manual attendance requires a reason");
  const endedLiveSession = check(await organizer.rpc("end_event_attendance_session", {
    p_session_id: liveSession.id,
    p_reason: "Event program completed normally"
  }), "owner ends live attendance session");
  assert.equal(endedLiveSession.session_status, "completed");
  const reconciledAbsent = check(await admin.from("attendance_records").select("attendance_status").eq("event_session_id", liveSession.id).eq("student_id", ids.studentTwo).single(), "read reconciled absence");
  assert.equal(reconciledAbsent.attendance_status, "absent", "missing participants must be marked absent when the session ends");

  check(await organizer.from("event_sessions").insert({
    id: ids.eventSession,
    event_id: ids.event,
    session_name: "Main Session",
    venue: "Local QA Room",
    session_status: "completed",
    scheduled_start: startsAt,
    scheduled_end: endsAt,
    actual_start: startsAt,
    actual_end: endsAt,
    created_by: ids.organizerUser
  }), "organizer creates event session");
  check(await admin.from("attendance_records").insert({
    id: ids.attendanceRecord,
    event_session_id: ids.eventSession,
    student_id: ids.student,
    attendance_status: "absent",
    verification_method: "qr",
    recorded_by: ids.organizerUser
  }), "create attendance record fixture");

  const correction = check(await student.from("attendance_requests").insert({
    student_id: ids.student,
    attendance_record_id: ids.attendanceRecord,
    requested_status: "present",
    explanation: "Verified local integration correction."
  }).select().single(), "student submits correction");
  const otherStudentCorrection = await studentTwo.from("attendance_requests").insert({
    student_id: ids.student,
    attendance_record_id: ids.attendanceRecord,
    requested_status: "present",
    explanation: "Attempted cross-account request."
  });
  assert.ok(otherStudentCorrection.error, "student must not submit a correction for another student");
  const wrongOrganizerReview = await organizerTwo.rpc("review_attendance_request", { p_request_id: correction.id, p_status: "approved", p_reason: "Forbidden cross-owner review" });
  assert.ok(wrongOrganizerReview.error, "organizer must not review another organizer's attendance request");
  const reviewedCorrection = check(await organizer.rpc("review_attendance_request", { p_request_id: correction.id, p_status: "approved", p_reason: "Evidence verified locally" }), "owner reviews attendance correction");
  assert.equal(reviewedCorrection.request_status, "approved");
  const updatedAttendance = check(await student.from("attendance_records").select("attendance_status").eq("id", ids.attendanceRecord).single(), "student sees corrected attendance");
  assert.equal(updatedAttendance.attendance_status, "present");
  check(await organizer.from("event_objectives").insert({ id: ids.eventObjective, event_id: ids.event, objective_order: 1, objective_text: "Validate the completed student workflow." }), "organizer creates event objective");
  check(await student.from("event_feedback").insert({ id: ids.eventFeedback, event_id: ids.event, student_id: ids.student, attendance_record_id: ids.attendanceRecord, comment: "Local integration feedback complete.", sentiment_label: "positive", sentiment_score: 1 }), "student completes event feedback");

  const credentialRequest = check(await student.from("credential_requests").insert({
    student_id: ids.student,
    credential_type: "qr",
    request_type: "replacement",
    reason: "Local integration replacement test."
  }).select().single(), "student submits credential request");
  const studentReview = await student.rpc("review_credential_request", { p_request_id: credentialRequest.id, p_status: "approved", p_remarks: "Forbidden self-review" });
  assert.ok(studentReview.error, "student must not review a credential request");
  const reviewedCredential = check(await organizer.rpc("review_credential_request", { p_request_id: credentialRequest.id, p_status: "approved", p_remarks: "Approved in local integration" }), "organizer reviews credential request");
  assert.equal(reviewedCredential.request_status, "approved");
  const activeCredential = check(await student.from("qr_credentials").select("credential_status").eq("student_id", ids.student).single(), "student reads issued credential");
  assert.equal(activeCredential.credential_status, "activated");

  const rescheduledStart = new Date(Date.now() + 172_800_000).toISOString();
  const rescheduledEnd = new Date(Date.now() + 176_400_000).toISOString();
  const rescheduledEvent = check(await organizer.rpc("reschedule_organizer_event", {
    p_event_id: transactionalEvent.id,
    p_venue: "Rescheduled Integration Room",
    p_starts_at: rescheduledStart,
    p_ends_at: rescheduledEnd,
    p_reason: "Rescheduled by lifecycle integration test"
  }), "owner reschedules event atomically");
  assert.equal(rescheduledEvent.venue, "Rescheduled Integration Room");
  assert.equal(rescheduledEvent.reschedule_count, 1);

  const cancelledEvent = check(await organizer.rpc("cancel_organizer_event", { p_event_id: transactionalEvent.id, p_reason: "Cancelled by lifecycle integration test" }), "owner cancels event");
  assert.equal(cancelledEvent.event_status, "cancelled");
  assert.equal(cancelledEvent.cancellation_reason, "Cancelled by lifecycle integration test");
  const otherOrganizerCancellation = await organizerTwo.rpc("cancel_organizer_event", { p_event_id: ids.upcomingEvent, p_reason: "Forbidden owner mismatch" });
  assert.ok(otherOrganizerCancellation.error, "another organizer must not cancel an event they do not own");

  check(await organizer.rpc("log_client_action", {
    p_action: "Local Priority 1 Audit Check",
    p_target_type: "organizer_profile",
    p_target_id: ids.organizerUser,
    p_metadata: { source: "local_integration" }
  }), "organizer creates an audit entry");
  const auditEntry = check(await admin.from("audit_logs").select("actor_user_id, action").eq("actor_user_id", ids.organizerUser).eq("action", "Local Priority 1 Audit Check").single(), "read organizer audit entry");
  assert.equal(auditEntry.actor_user_id, ids.organizerUser, "the database must derive the audit actor from the authenticated session");
  const studentAuditAttempt = await student.rpc("log_client_action", {
    p_action: "Forbidden Student Audit",
    p_target_type: "organizer_profile",
    p_target_id: ids.organizerUser,
    p_metadata: {}
  });
  assert.ok(studentAuditAttempt.error, "students must not create organizer audit entries");

  const replacementPassword = "PLPass-Local-Changed-2026!";
  check(await organizerTwo.auth.updateUser({ password: replacementPassword }), "organizer changes authenticated password");
  await organizerTwo.auth.signOut();
  const changedPasswordClient = userClient();
  const changedPasswordLogin = check(await changedPasswordClient.auth.signInWithPassword({ email: users[1].email, password: replacementPassword }), "organizer signs in with changed password");
  assert.ok(changedPasswordLogin.session?.access_token, "the changed organizer password must authenticate");

  process.stdout.write([
    "PASS  Real password authentication for two organizers and two students",
    "PASS  Profile RLS and cross-account isolation",
    "PASS  Organizer event creation and student creation denial",
    "PASS  Event participant ownership and student isolation",
    "PASS  Organizer-to-student approved-event visibility",
    "PASS  Transactional event creation, rollback, resources, and assigned visibility",
    "PASS  Owner-scoped event cancellation with a required reason",
    "PASS  Transactional event rescheduling and history count",
    "PASS  Owner-scoped session start, duplicate prevention, manual entry, and end reconciliation",
    "PASS  Student correction submission and owner-organizer review",
    "PASS  Student credential request and organizer issuance workflow",
    "PASS  Database-backed organizer audit logging and student denial",
    "PASS  Real organizer password update and reauthentication",
    ""
  ].join("\n"));
}

await run();
