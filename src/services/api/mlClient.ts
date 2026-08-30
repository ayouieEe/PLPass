/**
 * mlClient.ts
 *
 * Client for the FastAPI Machine Learning backend running on localhost:8000.
 */

const API_BASE = "http://localhost:8000";

export interface MlPredictionInsights {
  feature_importance: Array<{
    feature: string;
    importance_mean: number;
    importance_std: number;
  }>;
  partial_dependence: Record<string, any>;
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

export async function fetchModelInsights(): Promise<MlPredictionInsights> {
  const response = await fetch(`${API_BASE}/model/insights`);
  if (!response.ok) {
    throw new Error(`Failed to fetch model insights: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchBatchPrediction(request: BatchPredictionRequest): Promise<BatchPredictionResponse> {
  const response = await fetch(`${API_BASE}/predict/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch batch prediction: ${response.statusText}`);
  }
  return response.json();
}
