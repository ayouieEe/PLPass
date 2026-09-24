import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function capitalizePersonName(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim().replace(/\s+/g, " ").replace(/(^|[\s\-'’])(\p{L})/gu, (_match, boundary, letter) => `${boundary}${letter.toLocaleUpperCase()}`);
}

function normalizeNameFields(value: unknown) {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of ["firstName", "middleName", "lastName"]) {
    if (key in record && typeof record[key] === "string") record[key] = capitalizePersonName(record[key]);
  }
}

function compactNamePart(value: unknown) {
  return (typeof value === "string" ? value : "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function generatedAccountEmail(lastName: unknown, firstName: unknown, _middleName: unknown, nameExtension: unknown) {
  const surname = compactNamePart(lastName);
  const extension = compactNamePart(nameExtension);
  const givenName = compactNamePart(firstName);
  if (!surname || !givenName) throw new Error("First name and last name are required to generate the account email.");
  return `${surname}${extension}_${givenName}@plpasig.edu.ph`;
}

function resolveAccountEmail(account: Record<string, unknown>) {
  return generatedAccountEmail(account.lastName, account.firstName, account.middleName, account.nameExtension);
}

function normalizeStudentNumber(value: unknown) {
  const digits = (typeof value === "string" ? value : "").replace(/\D/g, "");
  if (digits.length !== 7) throw new Error("Student number must use the format 00-00000.");
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

async function nextEmployeeId(supabase: ReturnType<typeof createClient>, table: "organizers" | "admin_profiles", column: "employee_id" | "employee_number", prefix: "O" | "A") {
  const { data, error } = await supabase.from(table).select(column).like(column, `${prefix}-%`);
  if (error) throw new Error(`Could not generate an employee ID: ${error.message}`);
  const highest = (data ?? []).reduce((max, row) => {
    const normalized = String((row as Record<string, unknown>)[column] ?? "").trim();
    const match = normalized.match(new RegExp(`^${prefix}-(\\d{3})$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

async function recordAdminAudit(
  supabase: ReturnType<typeof createClient>,
  actorUserId: string,
  targetId: string,
  action: string,
  metadata: Record<string, string | number | boolean>,
  targetType = "user"
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata
  });
  if (error) throw new Error(`Audit log creation failed: ${error.message}`);
}

async function inviteAccount(
  supabase: ReturnType<typeof createClient>,
  email: string,
  metadata: Record<string, string | undefined>
) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { data: metadata });
  if (error || !data.user) throw new Error(error?.message || "Invitation could not be created.");
  return data.user;
}

async function removeAccount(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  profileTable: "organizers" | "admin_profiles" | "students",
  profileColumn: "profile_id"
) {
  await supabase.from(profileTable).delete().eq(profileColumn, userId);
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.auth.admin.deleteUser(userId);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Only POST requests are supported." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Authorization is required." }, 401);

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: "The signed-in user could not be verified." }, 401);

  const requestBody = await request.json().catch(() => ({}));
  const action = typeof requestBody.action === "string" ? requestBody.action : "";

  // Account management is available to university admins and to active
  // department admins within their own department. Scope checks are repeated
  // server-side; the frontend is never the authorization boundary.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, account_status")
    .eq("id", authData.user.id)
    .single();

  // The active admin role on profiles is the authoritative authorization
  // record. admin_profiles stores admin metadata and must not be a second
  // authorization gate, otherwise a metadata lookup failure can lock out a
  // valid administrator from repairing user accounts.
  if (profileError || !profile || !["admin", "department_admin"].includes(profile.role) || profile.account_status !== "active") {
    return json({ error: "Access denied. Only active administrators can manage users." }, 403);
  }

  const isUniversityAdmin = profile.role === "admin";
  const isDepartmentAdmin = profile.role === "department_admin";
  let actorDepartmentId: string | null = null;
  if (isDepartmentAdmin) {
    const { data: actorAdmin, error: actorAdminError } = await supabase
      .from("admin_profiles")
      .select("department_id")
      .eq("profile_id", authData.user.id)
      .maybeSingle();
    if (actorAdminError || !actorAdmin?.department_id) return json({ error: "Your department scope could not be verified." }, 403);
    actorDepartmentId = String(actorAdmin.department_id);
  }
  const requireUniversityAdmin = () => isUniversityAdmin ? null : json({ error: "Only university administrators can perform this action." }, 403);
  const departmentMatches = (departmentId: unknown) => isUniversityAdmin || (typeof departmentId === "string" && departmentId === actorDepartmentId);

  normalizeNameFields(requestBody.organizer);
  normalizeNameFields(requestBody.admin);
  normalizeNameFields(requestBody.student);
  for (const item of [requestBody.organizers, requestBody.students]) {
    if (Array.isArray(item)) item.forEach(normalizeNameFields);
  }
  const students = Array.isArray(requestBody.students) ? requestBody.students : [];
  if (isDepartmentAdmin && !new Set([
    "revoke-user-sessions",
    "prepare-user-invitation-resend",
    "bulk-create-organizers",
    "create-organizer",
    "update-organizer",
    "bulk-create-students",
    "create-student",
    "update-student"
  ]).has(action)) {
    return json({ error: "Department administrators can manage only accounts in their own department." }, 403);
  }

  if (action === "revoke-user-sessions") {
    if (!isUniversityAdmin && !isDepartmentAdmin) return json({ error: "This action is not available for your role." }, 403);
    const userId = requestBody.userId;
    const reason = typeof requestBody.reason === "string" ? requestBody.reason.trim() : "";
    if (!isUuid(userId)) return json({ error: "A valid target user is required." }, 400);
    if (userId === authData.user.id) return json({ error: "Administrators cannot revoke their own sessions." }, 400);
    if (!reason) return json({ error: "A reason is required to revoke user sessions." }, 400);
    if (reason.length > 500) return json({ error: "The reason must be 500 characters or fewer." }, 400);
    if (isDepartmentAdmin) {
      const { data: targetProfile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (targetProfile?.role === "organizer") {
        const { data: targetOrganizer } = await supabase.from("organizers").select("department_id").eq("profile_id", userId).maybeSingle();
        if (!targetOrganizer || !departmentMatches(targetOrganizer.department_id)) return json({ error: "You can only revoke sessions for accounts in your department." }, 403);
      } else if (targetProfile?.role === "student") {
        const { data: targetStudent } = await supabase.from("students").select("department_id").eq("profile_id", userId).maybeSingle();
        if (!targetStudent || !departmentMatches(targetStudent.department_id)) return json({ error: "You can only revoke sessions for accounts in your department." }, 403);
      } else {
        return json({ error: "You can only revoke sessions for organizers or students in your department." }, 403);
      }
    }

    const { data, error } = await supabase.rpc("admin_revoke_user_sessions", {
      p_actor_user_id: authData.user.id,
      p_target_user_id: userId,
      p_reason: reason
    });
    if (error) {
      // The database function is the authorization and audit boundary. Keep its
      // response private while returning a useful, non-sensitive failure.
      return json({ error: "The user sessions could not be revoked." }, 400);
    }
    return json({ success: true, revokedSessionCount: Number(data ?? 0) });
  }

  if (action === "prepare-user-invitation-resend" || action === "prepare-admin-invitation-resend") {
    if (action === "prepare-user-invitation-resend" && !isUniversityAdmin && !isDepartmentAdmin) return json({ error: "This action is not available for your role." }, 403);
    if (action === "prepare-admin-invitation-resend" && !isUniversityAdmin) return json({ error: "Only university administrators can resend administrator invitations." }, 403);
    const userId = requestBody.userId;
    if (!isUuid(userId)) return json({ error: "A valid account is required." }, 400);

    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("email, role, account_status")
      .eq("id", userId)
      .maybeSingle();
    if (targetProfileError || !targetProfile || !["admin", "department_admin", "organizer"].includes(targetProfile.role)) {
      return json({ error: "The account could not be found." }, 404);
    }
    if (targetProfile.account_status !== "active") {
      return json({ error: "Only active accounts can receive an activation email." }, 400);
    }
    if (isDepartmentAdmin) {
      const { data: targetOrganizer } = await supabase.from("organizers").select("department_id").eq("profile_id", userId).maybeSingle();
      if (targetProfile.role !== "organizer" || !targetOrganizer || !departmentMatches(targetOrganizer.department_id)) return json({ error: "You can only resend invitations for organizers in your department." }, 403);
    }

    const { data: authTarget, error: authTargetError } = await supabase.auth.admin.getUserById(userId);
    if (authTargetError || !authTarget.user || !authTarget.user.email) {
      return json({ error: "The account authentication record could not be found." }, 404);
    }
    if (authTarget.user.email_confirmed_at || authTarget.user.confirmed_at || authTarget.user.last_sign_in_at) {
      return json({ error: "This account has already been activated. Use password reset instead." }, 400);
    }
    if (!authTarget.user.invited_at) {
      return json({ error: "This account was not created through an invitation and cannot receive an invitation resend." }, 400);
    }

    // The browser sends the actual recovery email only after this server-side
    // gate succeeds. No account, profile, role, or password is created here.
    return json({ success: true, email: authTarget.user.email });
  }

  if (action === "bulk-create-organizers") {
    if (!isUniversityAdmin && !isDepartmentAdmin) return json({ error: "This action is not available for your role." }, 403);
    const organizers = Array.isArray(requestBody.organizers) ? requestBody.organizers : [];
    if (organizers.length === 0) return json({ error: "No organizers provided." }, 400);
    let success = 0;
    const errors: Array<{ row: number; email?: string; employeeNumber?: string; error: string }> = [];
    for (const [index, organizer] of organizers.entries()) {
      const { firstName, middleName, lastName, nameExtension, departmentId, organizationName } = organizer ?? {};
      const position = "Organizer";
      const email = resolveAccountEmail({ firstName, middleName, lastName, nameExtension });
      const normalizedNameExtension = typeof nameExtension === "string" ? nameExtension.trim() : "";
      try {
        if (!firstName || !lastName || !organizationName || !position) throw new Error("Missing required organizer information.");
        if (!["", "Jr.", "Sr.", "II", "III", "IV", "V"].includes(normalizedNameExtension)) throw new Error("The selected name extension is not valid.");
        if (isDepartmentAdmin && !departmentMatches(departmentId)) throw new Error("Department administrators can only create organizers in their own department.");
        const effectiveDepartmentId = isDepartmentAdmin ? actorDepartmentId : departmentId;
        const employeeNumber = await nextEmployeeId(supabase, "organizers", "employee_id", "O");
        const user = await inviteAccount(supabase, email, { first_name: firstName, middle_name: middleName, last_name: lastName, name_extension: normalizedNameExtension || undefined });
        const userId = user.id;
        const { error: profileError } = await supabase.from("profiles").insert({ id: userId, email, first_name: firstName, middle_name: middleName, last_name: lastName, name_extension: normalizedNameExtension || null, role: "organizer", employee_id: employeeNumber, account_status: "active" });
        if (profileError) { await removeAccount(supabase, userId, "organizers", "profile_id"); throw new Error(profileError.message); }
        const { error: organizerError } = await supabase.from("organizers").insert({ profile_id: userId, employee_id: employeeNumber, department_id: effectiveDepartmentId || null, organization_name: organizationName, position, organizer_status: "active" });
        if (organizerError) { await removeAccount(supabase, userId, "organizers", "profile_id"); throw new Error(organizerError.message); }
        try { await recordAdminAudit(supabase, authData.user.id, userId, "user.organizer_created", { email, employeeNumber, source: "bulk" }); }
        catch (auditError) { await removeAccount(supabase, userId, "organizers", "profile_id"); throw auditError; }
        success++;
      } catch (err) {
        errors.push({ row: index + 2, email, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return json({ success, failed: errors.length, errors });
  }

  if (action === "create-organizer") {
    if (!isUniversityAdmin && !isDepartmentAdmin) return json({ error: "This action is not available for your role." }, 403);
    const organizer = requestBody.organizer;
    if (!organizer) return json({ error: "No organizer provided." }, 400);
      const { firstName, middleName, lastName, nameExtension, departmentId, organizationName } = organizer;
      const position = "Organizer";
      const email = resolveAccountEmail({ firstName, middleName, lastName, nameExtension });
      const normalizedNameExtension = typeof nameExtension === "string" ? nameExtension.trim() : "";
    if (!firstName || !lastName || !organizationName || !position) {
      return json({ error: "Please complete all required organizer information." }, 400);
    }
    if (isDepartmentAdmin && !departmentMatches(departmentId)) return json({ error: "Department administrators can only create organizers in their own department." }, 403);
    const effectiveDepartmentId = isDepartmentAdmin ? actorDepartmentId : departmentId;
    if (!["", "Jr.", "Sr.", "II", "III", "IV", "V"].includes(normalizedNameExtension)) return json({ error: "The selected name extension is not valid." }, 400);
    try {
      const employeeNumber = await nextEmployeeId(supabase, "organizers", "employee_id", "O");
      const user = await inviteAccount(supabase, email, { first_name: firstName, middle_name: middleName, last_name: lastName, name_extension: normalizedNameExtension || undefined });
      const userId = user.id;
      const { error: profileInsertError } = await supabase.from("profiles").upsert({
        id: userId, email, first_name: firstName, middle_name: middleName, last_name: lastName, name_extension: normalizedNameExtension || null,
        role: "organizer", employee_id: employeeNumber, account_status: "active"
      });
      if (profileInsertError) { await removeAccount(supabase, userId, "organizers", "profile_id"); throw new Error(profileInsertError.message); }
      const { error: organizerInsertError } = await supabase.from("organizers").insert({
        profile_id: userId, employee_id: employeeNumber, department_id: effectiveDepartmentId || null,
        organization_name: organizationName, position, organizer_status: "active"
      });
      if (organizerInsertError) { await removeAccount(supabase, userId, "organizers", "profile_id"); throw new Error(organizerInsertError.message); }
      try { await recordAdminAudit(supabase, authData.user.id, userId, "user.organizer_created", { email, employeeNumber, source: "manual" }); }
      catch (auditError) { await removeAccount(supabase, userId, "organizers", "profile_id"); throw auditError; }
      // Existing clients recognize: return json({ success: true, employeeNumber });
      return json({ success: true, employeeNumber, invitationSent: true });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  }

  if (action === "create-admin") {
    const universityOnly = requireUniversityAdmin();
    if (universityOnly) return universityOnly;
    const admin = requestBody.admin;
    if (!admin) return json({ error: "No admin provided." }, 400);
    const { firstName, middleName, lastName, nameExtension, departmentId, officeName, adminRole = "admin" } = admin;
    const email = resolveAccountEmail({ firstName, middleName, lastName });
    const normalizedNameExtension = typeof nameExtension === "string" ? nameExtension.trim() : "";
    const normalizedOfficeName = typeof officeName === "string" ? officeName.trim() : "";
    if (!firstName || !lastName || !departmentId) return json({ error: "Please complete all required admin information." }, 400);
    if (!["admin", "department_admin"].includes(adminRole)) return json({ error: "The selected administrator type is not valid." }, 400);
    if (!["", "Jr.", "Sr.", "II", "III", "IV", "V"].includes(normalizedNameExtension)) return json({ error: "The selected name extension is not valid." }, 400);
    try {
      const employeeNumber = await nextEmployeeId(supabase, "admin_profiles", "employee_number", "A");
      const user = await inviteAccount(supabase, email, { first_name: firstName, middle_name: middleName, last_name: lastName, name_extension: normalizedNameExtension || undefined });
      const userId = user.id;
      const { error: profileInsertError } = await supabase.from("profiles").upsert({ id: userId, email, first_name: firstName, middle_name: middleName, last_name: lastName, name_extension: normalizedNameExtension || null, role: adminRole, employee_id: employeeNumber, account_status: "active" });
      if (profileInsertError) { await removeAccount(supabase, userId, "admin_profiles", "profile_id"); throw new Error(profileInsertError.message); }
      // `office_name` remains non-null for legacy records, but it is not
      // collected or shown in the Add Admin experience.
      const defaultOfficeName = adminRole === "admin" ? "University Admin" : "Department Admin";
      const { error: adminInsertError } = await supabase.from("admin_profiles").insert({ profile_id: userId, employee_number: employeeNumber, department_id: departmentId, office_name: normalizedOfficeName || defaultOfficeName });
      if (adminInsertError) { await removeAccount(supabase, userId, "admin_profiles", "profile_id"); throw new Error(adminInsertError.message); }
      try { await recordAdminAudit(supabase, authData.user.id, userId, "user.admin_created", { email, employeeNumber, source: "manual" }); }
      catch (auditError) { await removeAccount(supabase, userId, "admin_profiles", "profile_id"); throw auditError; }
      return json({ success: true, employeeNumber, invitationSent: true });
    } catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }, 400); }
  }

  if (action === "update-admin") {
    const universityOnly = requireUniversityAdmin();
    if (universityOnly) return universityOnly;
    const admin = requestBody.admin;
    if (!admin) return json({ error: "No admin provided." }, 400);
    try {
      const { id, profileId, email, firstName, middleName, lastName, nameExtension, departmentId, officeName, accountStatus } = admin;
      const normalizedNameExtension = typeof nameExtension === "string" ? nameExtension.trim() : "";
      if (!id || !profileId || !email || !firstName || !lastName || !departmentId || !officeName) return json({ error: "Please complete all required admin information before saving." }, 400);
      if (!["active", "inactive"].includes(accountStatus)) return json({ error: "The selected account access status is not valid." }, 400);
      if (!["", "Jr.", "Sr.", "II", "III", "IV", "V"].includes(normalizedNameExtension)) return json({ error: "The selected name extension is not valid." }, 400);

      const { data: existingProfile, error: profileLoadError } = await supabase.from("profiles").select("email, first_name, middle_name, last_name, name_extension, account_status, role").eq("id", profileId).maybeSingle();
      const { data: existingAdmin, error: adminLoadError } = await supabase.from("admin_profiles").select("department_id, office_name").eq("id", id).eq("profile_id", profileId).maybeSingle();
      if (profileLoadError || !existingProfile || !["admin", "department_admin"].includes(existingProfile.role)) return json({ error: "The administrator profile could not be found." }, 404);
      if (adminLoadError || !existingAdmin) return json({ error: "The administrator account could not be found." }, 404);
      if (profileId === authData.user.id && accountStatus !== "active") return json({ error: "Administrators cannot deactivate their own account." }, 400);

      const emailChanged = String(existingProfile.email ?? "").trim().toLowerCase() !== email.trim().toLowerCase();
      try {
        if (emailChanged) {
          const { error: authUpdateError } = await supabase.auth.admin.updateUserById(profileId, { email });
          if (authUpdateError) throw new Error(`Auth update failed: ${authUpdateError.message}`);
        }
        const { error: profileUpdateError } = await supabase.from("profiles").update({ email, first_name: firstName, middle_name: middleName || null, last_name: lastName, name_extension: normalizedNameExtension || null, account_status: accountStatus }).eq("id", profileId).in("role", ["admin", "department_admin"]);
        if (profileUpdateError) throw new Error(`Profile update failed: ${profileUpdateError.message}`);
        const { error: adminUpdateError } = await supabase.from("admin_profiles").update({ department_id: departmentId, office_name: officeName }).eq("id", id).eq("profile_id", profileId);
        if (adminUpdateError) throw new Error(`Admin update failed: ${adminUpdateError.message}`);
        await recordAdminAudit(supabase, authData.user.id, profileId, "user.admin_updated", { email, adminId: id, accountStatus }, "admin_profile");
        if (accountStatus === "inactive") {
          // The status row remains authoritative even if Auth is temporarily
          // unavailable; do not roll a deactivation back because session
          // revocation is a best-effort immediate safeguard.
          try { await supabase.auth.admin.signOut(profileId, "global"); } catch { /* status enforcement still applies */ }
        }
      } catch (operationError) {
        await supabase.from("profiles").update({ email: existingProfile.email, first_name: existingProfile.first_name, middle_name: existingProfile.middle_name, last_name: existingProfile.last_name, name_extension: existingProfile.name_extension, account_status: existingProfile.account_status }).eq("id", profileId);
        await supabase.from("admin_profiles").update(existingAdmin).eq("id", id).eq("profile_id", profileId);
        if (emailChanged) await supabase.auth.admin.updateUserById(profileId, { email: existingProfile.email });
        throw operationError;
      }
      return json({ success: true });
    } catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }, 400); }
  }

  if (action === "update-organizer") {
    if (!isUniversityAdmin && !isDepartmentAdmin) return json({ error: "This action is not available for your role." }, 403);
    const organizer = requestBody.organizer;
    if (!organizer) return json({ error: "No organizer provided." }, 400);
    try {
      const { id, profileId, email, firstName, middleName, lastName, nameExtension, departmentId, organizationName, position, accountStatus, employmentStatus } = organizer;
      const normalizedNameExtension = typeof nameExtension === "string" ? nameExtension.trim() : "";
      if (!id || !profileId || !email || !firstName || !lastName || !organizationName || !position) {
        return json({ error: "Please complete all required organizer information before saving." }, 400);
      }
      if (!["active", "inactive"].includes(accountStatus)) {
        return json({ error: "The selected account access status is not valid." }, 400);
      }
      if (!["active", "part_time", "on_leave", "separated"].includes(employmentStatus)) {
        return json({ error: "The selected employment status is not valid." }, 400);
      }
      if (!["", "Jr.", "Sr.", "II", "III", "IV", "V"].includes(normalizedNameExtension)) return json({ error: "The selected name extension is not valid." }, 400);

      const { data: existingProfile, error: profileLoadError } = await supabase
        .from("profiles")
        .select("email, first_name, middle_name, last_name, name_extension, account_status, role")
        .eq("id", profileId)
        .maybeSingle();
      if (profileLoadError) throw new Error(`Could not load the organizer profile: ${profileLoadError.message}`);
      if (!existingProfile || existingProfile.role !== "organizer") return json({ error: "The organizer profile could not be found." }, 404);
      const { data: existingOrganizer, error: organizerLoadError } = await supabase
        .from("organizers")
        .select("department_id, organization_name, position, organizer_status")
        .eq("id", id)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (organizerLoadError || !existingOrganizer) throw new Error(`Could not load the organizer account: ${organizerLoadError?.message || "record not found"}`);
      if (isDepartmentAdmin && (!departmentMatches(existingOrganizer.department_id) || (departmentId && !departmentMatches(departmentId)))) return json({ error: "You can only manage organizers in your department." }, 403);
      const effectiveDepartmentId = isDepartmentAdmin ? actorDepartmentId : (departmentId || null);

      const emailChanged = String(existingProfile.email ?? "").trim().toLowerCase() !== email.trim().toLowerCase();
      try {
        if (emailChanged) {
          const { error: authUpdateError } = await supabase.auth.admin.updateUserById(profileId, { email });
          if (authUpdateError) throw new Error(`Auth update failed: ${authUpdateError.message}`);
        }
        const { error: profileUpdateError } = await supabase.from("profiles").update({
          email, first_name: firstName, middle_name: middleName || null, last_name: lastName, name_extension: normalizedNameExtension || null, account_status: accountStatus
        }).eq("id", profileId).eq("role", "organizer");
        if (profileUpdateError) throw new Error(`Profile update failed: ${profileUpdateError.message}`);
        const { error: organizerUpdateError } = await supabase.from("organizers").update({
          department_id: effectiveDepartmentId, organization_name: organizationName, position, organizer_status: employmentStatus
        }).eq("id", id).eq("profile_id", profileId);
        if (organizerUpdateError) throw new Error(`Organizer update failed: ${organizerUpdateError.message}`);
        await recordAdminAudit(supabase, authData.user.id, profileId, "user.organizer_updated", { email, organizerId: id, accountStatus, employmentStatus }, "organizer_profile");
        if (accountStatus === "inactive") {
          // See the equivalent admin-account safeguard above.
          try { await supabase.auth.admin.signOut(profileId, "global"); } catch { /* status enforcement still applies */ }
        }
      } catch (operationError) {
        await supabase.from("profiles").update({ email: existingProfile.email, first_name: existingProfile.first_name, middle_name: existingProfile.middle_name, last_name: existingProfile.last_name, name_extension: existingProfile.name_extension, account_status: existingProfile.account_status }).eq("id", profileId);
        await supabase.from("organizers").update(existingOrganizer).eq("id", id).eq("profile_id", profileId);
        if (emailChanged) await supabase.auth.admin.updateUserById(profileId, { email: existingProfile.email });
        throw operationError;
      }
      return json({ success: true });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  }

  if (action === "update-student") {
    const student = requestBody.student;
    if (!student) return json({ error: "No student provided." }, 400);
    let previousProfileForRollback: Record<string, unknown> | null = null;
    let previousStudentForRollback: Record<string, unknown> | null = null;
    try {
      const { id, profileId, email, firstName, middleName, lastName, nameExtension, programId, departmentId, sectionId, yearLevel, accountStatus, statusOnly } = student;
      const normalizedNameExtension = typeof nameExtension === "string" ? nameExtension.trim() : "";
      if (!["", "Jr.", "Sr.", "II", "III", "IV", "V"].includes(normalizedNameExtension)) return json({ error: "The selected name extension is not valid." }, 400);
      const { data: previousProfile, error: previousProfileError } = await supabase.from("profiles").select("email, first_name, middle_name, last_name, name_extension, account_status, role").eq("id", profileId).maybeSingle();
      if (previousProfileError || !previousProfile) throw new Error(`Could not load the student profile: ${previousProfileError?.message || "record not found"}`);
      const { data: previousStudent, error: previousStudentError } = await supabase.from("students").select("program_id, department_id, section_id, year_level").eq("id", id).maybeSingle();
      if (previousStudentError || !previousStudent) throw new Error(`Could not load the student account: ${previousStudentError?.message || "record not found"}`);
      previousProfileForRollback = previousProfile as Record<string, unknown>;
      previousStudentForRollback = previousStudent as Record<string, unknown>;
      if (previousProfile.role !== "student") return json({ error: "The selected account is not a student." }, 400);
      if (isDepartmentAdmin && !departmentMatches(previousStudent.department_id)) return json({ error: "You can only manage students in your department." }, 403);
      if (statusOnly) {
        if (!id || !profileId || !accountStatus || !["active", "inactive", "suspended"].includes(accountStatus)) {
          return json({ error: "A valid student account status is required." }, 400);
        }
        const { error: statusUpdateError } = await supabase
          .from("profiles")
          .update({ account_status: accountStatus })
          .eq("id", profileId);
        try {
          if (statusUpdateError) throw new Error(`Account status update failed: ${statusUpdateError.message}`);
          await recordAdminAudit(supabase, authData.user.id, profileId, "user.student_status_changed", { studentId: id, accountStatus }, "student_profile");
        } catch (operationError) {
          await supabase.from("profiles").update({ account_status: previousProfile.account_status }).eq("id", profileId);
          throw operationError;
        }
        return json({ success: true });
      }
      if (!id || !profileId || !email || !firstName || !lastName || !programId || !departmentId || !sectionId || !yearLevel) {
        return json({ error: "Please complete all required student information before saving." }, 400);
      }
      if (isDepartmentAdmin && !departmentMatches(departmentId)) return json({ error: "Students must remain in your department." }, 403);
      const effectiveDepartmentId = isDepartmentAdmin ? actorDepartmentId : departmentId;
      const { data: selectedProgram, error: selectedProgramError } = await supabase.from("programs").select("department_id").eq("id", programId).maybeSingle();
      if (selectedProgramError || !selectedProgram || selectedProgram.department_id !== effectiveDepartmentId) return json({ error: "The selected program is not available for this department." }, 400);
      if (accountStatus && !["active", "inactive", "suspended"].includes(accountStatus)) {
        return json({ error: "The selected account status is not valid." }, 400);
      }
      
      const emailChanged = String(previousProfile.email ?? "").trim().toLowerCase() !== email.trim().toLowerCase();
      if (emailChanged) {
        const { error: updateAuthError } = await supabase.auth.admin.updateUserById(profileId, { email });
        if (updateAuthError) throw new Error(`Auth update failed: ${updateAuthError.message}`);
      }
      
      const { error: profileUpdateError } = await supabase.from("profiles").update({
        email: email,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        name_extension: normalizedNameExtension || null,
        ...(accountStatus ? { account_status: accountStatus } : {})
      }).eq("id", profileId);
      
      if (profileUpdateError) throw new Error(`Profile update failed: ${profileUpdateError.message}`);
      
      let actualSectionId = sectionId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sectionId);

      if (isUuid) {
        const { data: selectedSection, error: selectedSectionError } = await supabase
          .from("sections")
          .select("id")
          .eq("id", sectionId)
          .eq("program_id", programId)
          .eq("year_level", yearLevel)
          .eq("is_active", true)
          .maybeSingle();
        if (selectedSectionError || !selectedSection) {
          throw new Error("The selected section is not available for the selected program and year level.");
        }
      }
      
      if (!isUuid) {
        const { data: sectionData } = await supabase
          .from("sections")
          .select("id")
          .eq("section_name", sectionId)
          .eq("program_id", programId)
          .eq("year_level", yearLevel)
          .limit(1)
          .maybeSingle();

        if (sectionData) {
          actualSectionId = sectionData.id;
        } else {
          const { data: settings } = await supabase.from("system_settings").select("current_school_year, current_semester_id").limit(1).maybeSingle();
          const { data: newSection, error: newSectionError } = await supabase
            .from("sections")
            .insert({
              section_name: sectionId,
              program_id: programId,
              year_level: yearLevel,
              academic_year: settings?.current_school_year || "2026-2027",
              semester: settings?.current_semester_id || "1st Semester"
            })
            .select("id")
            .single();

          if (newSectionError) {
            throw new Error(`Failed to create section '${sectionId}': ${newSectionError.message}`);
          }
          actualSectionId = newSection.id;
        }
      }

      const { error: studentUpdateError } = await supabase.from("students").update({
        program_id: programId,
        department_id: effectiveDepartmentId,
        section_id: actualSectionId,
        year_level: yearLevel
      }).eq("id", id);
      
      if (studentUpdateError) throw new Error(`Student update failed: ${studentUpdateError.message}`);
      await recordAdminAudit(supabase, authData.user.id, profileId, "user.student_updated", { studentId: id, accountStatus: accountStatus ?? "unchanged" }, "student_profile");
      return json({ success: true });
    } catch (err) {
      if (student?.profileId && student?.id) {
        if (previousProfileForRollback) await supabase.from("profiles").update(previousProfileForRollback).eq("id", student.profileId);
        if (previousStudentForRollback) await supabase.from("students").update(previousStudentForRollback).eq("id", student.id);
        if (previousProfileForRollback?.email && student.email && String(previousProfileForRollback.email).trim().toLowerCase() !== String(student.email).trim().toLowerCase()) await supabase.auth.admin.updateUserById(student.profileId, { email: String(previousProfileForRollback.email) });
      }
      return json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  }

  if (action !== "bulk-create-students" && action !== "create-student") {
    return json({ error: "Invalid action." }, 400);
  }

  if (students.length === 0) {
    return json({ error: "No students provided." }, 400);
  }

  let success = 0;
  let failed = 0;
  const errors: Record<string, string>[] = [];

  for (const [index, student] of students.entries()) {
    try {
      const { firstName, middleName, lastName, nameExtension, programId, departmentId, sectionId, yearLevel } = student;
      const studentNumber = normalizeStudentNumber(student.studentNumber);
      const email = resolveAccountEmail({ firstName, middleName, lastName });
      const normalizedNameExtension = typeof nameExtension === "string" ? nameExtension.trim() : "";
      if (!["", "Jr.", "Sr.", "II", "III", "IV", "V"].includes(normalizedNameExtension)) {
        throw new Error("The selected name extension is not valid.");
      }
      const { data: existingStudent, error: existingStudentError } = await supabase
        .from("students")
        .select("id")
        .eq("student_id", studentNumber)
        .maybeSingle();
      if (existingStudentError) throw new Error(`Could not check student ID: ${existingStudentError.message}`);
      if (existingStudent) throw new Error(`Student ID "${studentNumber}" already exists.`);
      if (isDepartmentAdmin && !departmentMatches(departmentId)) throw new Error("Students can only be created in your department.");
      const effectiveDepartmentId = isDepartmentAdmin ? actorDepartmentId : departmentId;
      const { data: selectedProgram, error: selectedProgramError } = await supabase.from("programs").select("department_id").eq("id", programId).maybeSingle();
      if (selectedProgramError || !selectedProgram || selectedProgram.department_id !== effectiveDepartmentId) throw new Error("The selected program is not available for this department.");
      const defaultPassword = `${studentNumber}${lastName}`;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sectionId);
      let actualSectionId = sectionId;

      if (isUuid) {
        const { data: selectedSection, error: selectedSectionError } = await supabase
          .from("sections")
          .select("id")
          .eq("id", sectionId)
          .eq("program_id", programId)
          .eq("year_level", yearLevel)
          .eq("is_active", true)
          .maybeSingle();

        if (selectedSectionError || !selectedSection) {
          throw new Error("The selected section is not available for the selected program and year level.");
        }
      }

      // 1. Create auth user
      const { data: userData, error: createUserError } = await supabase.auth.admin.createUser({
        email: email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          name_extension: normalizedNameExtension || undefined
        }
      });

      if (createUserError) {
        throw new Error(`Auth creation failed: ${createUserError.message}`);
      }

      if (!userData.user) {
        throw new Error("User created but no user object returned");
      }

      const userId = userData.user.id;

      // 2. Insert into profiles (Supabase may have triggers, but we do it explicitly just in case. 
      // If there's a unique constraint error, we can catch it or use upsert).
      const { error: profileInsertError } = await supabase.from("profiles").upsert({
        id: userId,
        email: email,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        name_extension: normalizedNameExtension || null,
        role: "student",
        student_id: studentNumber,
        account_status: "active"
      });

      if (profileInsertError) {
        // Rollback auth user
        await supabase.auth.admin.deleteUser(userId);
        throw new Error(`Profile insert failed: ${profileInsertError.message}`);
      }

      // 3. Resolve legacy text section values used by bulk imports.
      if (!isUuid) {
        const { data: sectionData } = await supabase
          .from("sections")
          .select("id")
          .eq("section_name", sectionId)
          .eq("program_id", programId)
          .eq("year_level", yearLevel)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (sectionData) {
          actualSectionId = sectionData.id;
        } else {
          // Fetch defaults from system settings
          const { data: settings } = await supabase.from("system_settings").select("current_school_year, current_semester_id").limit(1).maybeSingle();
          
          const { data: newSection, error: newSectionError } = await supabase
            .from("sections")
            .insert({
              section_name: sectionId,
              program_id: programId,
              year_level: yearLevel,
              academic_year: settings?.current_school_year || "2026-2027",
              semester: settings?.current_semester_id || "1st Semester"
            })
            .select("id")
            .single();

          if (newSectionError) {
            await supabase.auth.admin.deleteUser(userId);
            throw new Error(`Failed to create section '${sectionId}': ${newSectionError.message}`);
          }
          actualSectionId = newSection.id;
        }
      }

      // 4. Insert into students
      const { error: studentInsertError } = await supabase.from("students").insert({
        profile_id: userId,
        student_id: studentNumber,
        program_id: programId,
        department_id: effectiveDepartmentId,
        section_id: actualSectionId,
        year_level: yearLevel,
        student_status: "enrolled"
      });

      if (studentInsertError) {
        // Rollback auth user (profile cascades)
        await supabase.auth.admin.deleteUser(userId);
        throw new Error(`Student insert failed: ${studentInsertError.message}`);
      }

      success++;
    } catch (err) {
      failed++;
      errors.push({ row: index + 2, email: student.email, studentNumber: student.studentNumber, error: err instanceof Error ? err.message : String(err) });
    }
  }

    return json({ processed: students.length, success, failed, errors });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
