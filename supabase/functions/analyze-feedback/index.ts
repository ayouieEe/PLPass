import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const HF_API_TOKEN = Deno.env.get("HUGGING_FACE_TOKEN");
const HF_MODEL_URL = "https://api-inference.huggingface.co/models/cardiffnlp/twitter-xlm-roberta-base-sentiment";

interface FeedbackPayload {
  taskId: string;
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
    
    // Students are linked to the authenticated profile through students.profile_id.
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("profile_id", user.id)
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

    const { data: feedbackId, error: submissionError } = await supabase.rpc("submit_feedback_task", {
      p_task_id: payload.taskId,
      p_comment: payload.comment?.trim() || null,
      p_ratings: payload.ratings.map((rating) => ({ objective_id: rating.objectiveId, rating: rating.rating })),
      p_sentiment_label: payload.comment?.trim() ? sentimentLabel : null,
      p_sentiment_score: payload.comment?.trim() ? sentimentScore : null,
    });
    if (submissionError) throw submissionError;

    return new Response(
      JSON.stringify({ success: true, feedbackId }),
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
