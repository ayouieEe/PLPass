/**
 * mlClient.ts
 *
 * Client for the FastAPI Machine Learning backend running on localhost:8000.
 * Operates gracefully with resilient null fallbacks when the ML backend is offline.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Electron binds the local model service explicitly to IPv4 loopback. Using
// `localhost` here can resolve to IPv6 first on Windows and silently miss the
// service, leaving automatic forecasts perpetually unavailable.
const API_BASE = import.meta.env.VITE_ML_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface MlPredictionInsights {
  feature_importance: Array<{
    feature: string;
    importance_mean: number;
    importance_std: number;
  }>;
  partial_dependence: Record<string, unknown>;
  trained_on_rows: number;
  test_rows: number;
  test_accuracy: number;
  test_auc: number;
  model_features: string[];
  generated_at: string;
}

export interface BatchPredictionRequest {
  event_id: string;
  student_ids: string[];
}

export interface BatchPredictionResponse {
  event_id: string;
  aggregate_expected_turnout: number;
  predictions: Array<{
    student_id: string;
    event_id: string;
    attendance_probability: number;
    risk_level: string;
    pattern_label: string;
    explanation: string;
  }>;
}

export async function fetchModelInsights(): Promise<MlPredictionInsights | null> {
  try {
    const response = await fetch(`${API_BASE}/model/insights`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Return null cleanly when the FastAPI ML server on port 8000 is offline/unreachable
    return null;
  }
}

export async function fetchBatchPrediction(request: BatchPredictionRequest): Promise<BatchPredictionResponse | null> {
  try {
    // The local ML API reads only through the signed-in organizer's RLS scope.
    // It must never fall back to anonymous access or a privileged server
    // credential in browser code.
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return null;
    const response = await fetch(`${API_BASE}/predict/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Return null cleanly when the FastAPI ML server on port 8000 is offline/unreachable
    return null;
  }
}
