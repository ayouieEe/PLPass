import { createClient } from "@supabase/supabase-js";
import console from "node:console";

const supabaseUrl = "https://ouwyhaozkqvhjalqdsvc.supabase.co";
const supabaseKey = "sb_publishable_kLvghN2dv7WzTkAzcp8FpQ_B75GiDxf";

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
