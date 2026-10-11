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

    function analyzeSentimentFallback(text: string): { label: "positive" | "negative" | "neutral"; score: number } {
      const lower = text.toLowerCase();
      const positiveWords = [
        "good", "great", "excellent", "awesome", "loved", "love", "amazing", "informative",
        "helpful", "clear", "enjoyed", "best", "useful", "inspiring", "smooth", "organized",
        "maganda", "galing", "maayos", "salamat", "masaya", "sulit", "nagustuhan", "malinaw"
      ];
      const negativeWords = [
        "bad", "terrible", "poor", "boring", "waste", "disappointed", "slow", "delayed",
        "confusing", "useless", "worst", "unclear", "disorganized", "noisy", "late",
        "pangit", "panget", "gulo", "magulo", "sayang", "lito", "hirap", "bulok", "walang kwenta"
      ];

      let posCount = 0;
      let negCount = 0;
      for (const word of positiveWords) {
        if (lower.includes(word)) posCount++;
      }
      for (const word of negativeWords) {
        if (lower.includes(word)) negCount++;
      }

      if (posCount > negCount) {
        return { label: "positive", score: Math.min(0.95, 0.6 + (posCount - negCount) * 0.15) };
      } else if (negCount > posCount) {
        return { label: "negative", score: Math.min(0.95, 0.6 + (negCount - posCount) * 0.15) };
      }
      return { label: "neutral", score: 0.5 };
    }

    // Call Hugging Face API if there is a comment
    if (payload.comment && payload.comment.trim() !== "") {
      const trimmedComment = payload.comment.trim();
      let analyzedWithHf = false;

      if (HF_API_TOKEN) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8_000);
        try {
          const hfResponse = await fetch(HF_MODEL_URL, {
            headers: {
              Authorization: `Bearer ${HF_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({ inputs: trimmedComment }),
            signal: controller.signal,
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
              const rawLabel = (bestClass.label || "").toLowerCase();

              if (rawLabel.includes("positive") || rawLabel.includes("pos") || rawLabel === "label_2") sentimentLabel = "positive";
              else if (rawLabel.includes("negative") || rawLabel.includes("neg") || rawLabel === "label_0") sentimentLabel = "negative";
              else sentimentLabel = "neutral";
              analyzedWithHf = true;
            }
          } else {
            console.error("Hugging Face API Error:", await hfResponse.text());
          }
        } catch (error) {
          console.warn("Sentiment analysis unavailable; submitting feedback with neutral sentiment.", error);
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!analyzedWithHf) {
        const fallback = analyzeSentimentFallback(trimmedComment);
        sentimentLabel = fallback.label;
        sentimentScore = fallback.score;
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
