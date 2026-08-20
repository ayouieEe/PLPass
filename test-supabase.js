import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "your_supabase_publishable_key_here";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from("audit_logs").select("*").limit(5);
  if (error) {
    console.error("Error fetching audit_logs:", error);
  } else {
    console.log("Audit Logs data:", data);
  }
}

test();
