import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const HF_API_TOKEN = Deno.env.get("HUGGING_FACE_TOKEN");
const HF_MODEL_URL = "https://api-inference.huggingface.co/models/cardiffnlp/twitter-xlm-roberta-base-sentiment";

interface FeedbackPayload {
  eventId: string;
  attendanceRecordId: string;
  comment?: string;
  ratings: Array<{ objectiveId: string; rating: number }>;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }
    
    // We get the student ID. In this app, student ID might be tied to the user.
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();
      
    if (studentError || !student) {
      throw new Error("Student profile not found");
    }

    const payload: FeedbackPayload = await req.json();

    let sentimentLabel = "neutral";
    let sentimentScore = 0.0;

    // Call Hugging Face API if there is a comment
    if (payload.comment && payload.comment.trim() !== "" && HF_API_TOKEN) {
      const hfResponse = await fetch(HF_MODEL_URL, {
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ inputs: payload.comment }),
      });

      if (hfResponse.ok) {
        const result = await hfResponse.json();
        // The result is usually [[{ label: 'positive', score: 0.9 }, ...]]
        if (Array.isArray(result) && Array.isArray(result[0])) {
          const classifications = result[0];
          // Get argmax (highest score)
          let bestClass = classifications[0];
          for (const cls of classifications) {
            if (cls.score > bestClass.score) {
              bestClass = cls;
            }
          }
          
          sentimentScore = bestClass.score;
          const rawLabel = bestClass.label.toLowerCase();
          
          if (rawLabel.includes("positive") || rawLabel.includes("pos")) sentimentLabel = "positive";
          else if (rawLabel.includes("negative") || rawLabel.includes("neg")) sentimentLabel = "negative";
          else sentimentLabel = "neutral";
        }
      } else {
        console.error("Hugging Face API Error:", await hfResponse.text());
        // If HF fails, we can either throw or proceed with null sentiment. 
        // We'll proceed with neutral as fallback.
      }
    }

    // 1. Upsert into event_feedback (RLS will validate if student attended)
    const { data: feedbackData, error: feedbackError } = await supabase
      .from("event_feedback")
      .upsert({
        event_id: payload.eventId,
        student_id: student.id,
        attendance_record_id: payload.attendanceRecordId,
        comment: payload.comment && payload.comment.trim() !== "" ? payload.comment : null,
        sentiment_label: payload.comment && payload.comment.trim() !== "" ? sentimentLabel : null,
        sentiment_score: payload.comment && payload.comment.trim() !== "" ? sentimentScore : null,
      }, { onConflict: "event_id,student_id" })
      .select("id")
      .single();

    if (feedbackError) throw feedbackError;

    // Clear existing ratings before inserting new ones
    await supabase.from("event_feedback_ratings").delete().eq("feedback_id", feedbackData.id);

    // 2. Insert into event_feedback_ratings
    if (payload.ratings.length > 0) {
      const ratingsData = payload.ratings.map(r => ({
        feedback_id: feedbackData.id,
        objective_id: r.objectiveId,
        rating: r.rating,
      }));

      const { error: ratingsError } = await supabase
        .from("event_feedback_ratings")
        .insert(ratingsData);

      if (ratingsError) throw ratingsError;
    }

    return new Response(
      JSON.stringify({ success: true, feedbackId: feedbackData.id }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 200,
      }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 400,
      }
    );
  }
});
