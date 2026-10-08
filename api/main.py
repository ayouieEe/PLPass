import os
import sys
import json
import asyncio
import threading
import types
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

if sys.platform == "win32":
    # Windows terminals otherwise default to cp1252 and abort the download.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8")

# Add the parent directory to sys.path so we can import from ml and api modules
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# The frontend and local API share the same Supabase configuration. Load the
# developer-specific file first, while still allowing real environment
# variables to take precedence in hosted environments.
load_dotenv(os.path.join(parent_dir, ".env.local"))
load_dotenv(os.path.join(parent_dir, ".env"))

from api.services.prediction_insights import get_risk_level, get_pattern_insights
# Global dictionary to store ML artifacts
ml_artifacts = {}
prediction_model_lock = threading.Lock()

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "attendance_model.pkl")
INSIGHTS_PATH = os.path.join(os.path.dirname(__file__), "models", "model_insights.json")

def install_prediction_runtime_compatibility() -> None:
    """Avoid importing an unused native sklearn polynomial extension.

    The served attendance pipeline uses OneHotEncoder and RandomForest, not
    PolynomialFeatures. Some Windows Application Control policies block the
    unsigned optional polynomial wheel before sklearn can import any
    preprocessing class, so provide only the import-time symbols required by
    sklearn. If polynomial features are ever added to this service, this
    deliberate ponytail shortcut must be removed and the native dependency
    restored or signed.
    """
    module_name = "sklearn.preprocessing._csr_polynomial_expansion"
    if module_name in sys.modules:
        return

    def unused_native_operation(*_args, **_kwargs):
        raise RuntimeError("Polynomial preprocessing is not part of the PLPass attendance model.")

    compatibility_module = types.ModuleType(module_name)
    compatibility_module._calc_expanded_nnz = unused_native_operation
    compatibility_module._calc_total_nnz = unused_native_operation
    compatibility_module._csr_polynomial_expansion = unused_native_operation
    sys.modules[module_name] = compatibility_module

def load_or_train_prediction_pipeline():
    """Return the served pipeline, creating the missing local artifact once."""
    install_prediction_runtime_compatibility()
    import joblib

    with prediction_model_lock:
        pipeline = ml_artifacts.get("pipeline")
        if pipeline is not None:
            return pipeline
        if not os.path.exists(MODEL_PATH):
            from ml.train_attendance_model import train_and_write_artifacts
            # The explanation file is already versioned separately. The runtime
            # only needs the deterministic pipeline artifact here.
            train_and_write_artifacts(write_insights=False)
        pipeline = joblib.load(MODEL_PATH)
        ml_artifacts["pipeline"] = pipeline
        return pipeline

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    print("Initializing FastAPI server...")
    
    # The attendance model is loaded on its first prediction request instead.
    ml_artifacts["pipeline"] = None

    if os.path.exists(INSIGHTS_PATH):
        print(f"Loading Model Insights from {INSIGHTS_PATH}...")
        with open(INSIGHTS_PATH, "r") as f:
            ml_artifacts["insights"] = json.load(f)
    else:
        print(f"WARNING: Insights not found at {INSIGHTS_PATH}.")
        ml_artifacts["insights"] = None

    yield # App is now running and accepting requests!
    
    # --- SHUTDOWN ---
    print("Shutting down server, cleaning up ML models...")
    ml_artifacts.clear()

app = FastAPI(
    title="PLPass ML API",
    description="API for predicting event attendance",
    lifespan=lifespan
)

# Allow CORS for the frontend (Vite defaults to 5173, but we can allow all in dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictResponse(BaseModel):
    student_id: str
    event_id: str
    attendance_probability: float
    risk_level: str
    pattern_label: str
    explanation: str

class BatchPredictRequest(BaseModel):
    event_id: str
    student_ids: List[str]

class BatchPredictResponse(BaseModel):
    event_id: str
    aggregate_expected_turnout: float
    predictions: List[PredictResponse]

@app.get("/")
def read_root():
    return {"status": "ok", "message": "PLPass ML API is running"}

@app.post("/predict/batch", response_model=BatchPredictResponse)
async def predict_attendance_batch(
    req: BatchPredictRequest,
    authorization: str | None = Header(default=None),
):
    import pandas as pd
    from ml.feature_assembly import assemble_student_features
    from api.services.supabase_client import get_event_features, get_batch_student_history

    if not req.student_ids:
        raise HTTPException(status_code=400, detail="No student_ids provided.")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="An authenticated organizer session is required.")
    access_token = authorization.split(" ", 1)[1].strip()
        
    try:
        pipeline = await asyncio.to_thread(load_or_train_prediction_pipeline)
        # Fetch event features once for the batch
        event_data = get_event_features(req.event_id, access_token)
        event_date = event_data.pop("event_date")
        
        # 1. Fetch ALL student histories in a single Supabase query (N+1 fix)
        histories_by_student = get_batch_student_history(req.student_ids, event_date, access_token)
        
        predictions = []
        rows = []
        assembled_features_list = []
        
        # 2. Build features for each student in memory
        for student_id in req.student_ids:
            history_df = histories_by_student.get(student_id, pd.DataFrame(columns=["attendance_status", "late_reason_category", "starts_at"]))
            student_features = assemble_student_features(history_df)
            assembled_features_list.append(student_features)
            rows.append({**event_data, **student_features})
            
        # 3. Predict all at once
        batch_df = pd.DataFrame(rows)
        probabilities = pipeline.predict_proba(batch_df)[:, 1]
        
        # Aggregate logic: Sum of probabilities
        aggregate_expected_turnout = float(sum(probabilities))
        
        # 4. Map responses
        for i, student_id in enumerate(req.student_ids):
            prob = float(probabilities[i])
            risk_level = get_risk_level(prob)
            pattern_label, explanation = get_pattern_insights(assembled_features_list[i])
            
            predictions.append(
                PredictResponse(
                    student_id=student_id,
                    event_id=req.event_id,
                    attendance_probability=round(prob, 4),
                    risk_level=risk_level,
                    pattern_label=pattern_label,
                    explanation=explanation
                )
            )
            
        return BatchPredictResponse(
            event_id=req.event_id,
            aggregate_expected_turnout=round(aggregate_expected_turnout, 2),
            predictions=predictions
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error during batch prediction: {str(e)}")

@app.get("/model/insights")
async def model_insights():
    insights = ml_artifacts.get("insights")
    if not insights:
        raise HTTPException(status_code=503, detail="Model insights not loaded.")
    return insights
