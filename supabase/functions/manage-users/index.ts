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

  // Check if the user is an organizer or admin
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile || (profile.role !== "organizer" && profile.role !== "admin")) {
    return json({ error: "Access denied. Only organizers can manage users." }, 403);
  }

  const requestBody = await request.json().catch(() => ({}));
  const action = typeof requestBody.action === "string" ? requestBody.action : "";
  const students = Array.isArray(requestBody.students) ? requestBody.students : [];

  if (action === "update-student") {
    const student = requestBody.student;
    if (!student) return json({ error: "No student provided." }, 400);
    try {
      const { id, profileId, email, firstName, middleName, lastName, programId, departmentId, sectionId, yearLevel } = student;
      
      if (email) {
        const { error: updateAuthError } = await supabase.auth.admin.updateUserById(profileId, {
          email: email,
          user_metadata: {
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName
          }
        });
        if (updateAuthError) throw new Error(`Auth update failed: ${updateAuthError.message}`);
      }
      
      const { error: profileUpdateError } = await supabase.from("profiles").update({
        email: email,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName
      }).eq("id", profileId);
      
      if (profileUpdateError) throw new Error(`Profile update failed: ${profileUpdateError.message}`);
      
      let actualSectionId = sectionId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sectionId);
      
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
        department_id: departmentId,
        section_id: actualSectionId,
        year_level: yearLevel
      }).eq("id", id);
      
      if (studentUpdateError) throw new Error(`Student update failed: ${studentUpdateError.message}`);
      
      return json({ success: true });
    } catch (err) {
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

  for (const student of students) {
    try {
      const { email, firstName, middleName, lastName, studentNumber, programId, departmentId, sectionId, yearLevel } = student;
      const defaultPassword = studentNumber;

      // 1. Create auth user
      const { data: userData, error: createUserError } = await supabase.auth.admin.createUser({
        email: email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName
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
        middle_name: middleName,
        last_name: lastName,
        role: "student",
        student_id: studentNumber,
        account_status: "active"
      });

      if (profileInsertError) {
        // Rollback auth user
        await supabase.auth.admin.deleteUser(userId);
        throw new Error(`Profile insert failed: ${profileInsertError.message}`);
      }

      // 3. Resolve Section UUID
      let actualSectionId = sectionId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sectionId);
      
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
        department_id: departmentId,
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
      errors.push({ email: student.email, error: err instanceof Error ? err.message : String(err) });
    }
  }

    return json({ processed: students.length, success, failed, errors });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
