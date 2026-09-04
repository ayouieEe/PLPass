import os
import sys
import json
import joblib
import pandas as pd
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

if sys.platform == "win32":
    # DeepFace logs Unicode status symbols while downloading model weights.
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

from ml.feature_assembly import assemble_student_features
from api.services.supabase_client import get_event_features, get_batch_student_history
from api.services.prediction_insights import get_risk_level, get_pattern_insights
from api.services.facial_recognition import FacialRecognitionError, MIN_CAPTURE_FRAMES, identify_and_record

# Global dictionary to store ML artifacts
ml_artifacts = {}

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "attendance_model.pkl")
INSIGHTS_PATH = os.path.join(os.path.dirname(__file__), "models", "model_insights.json")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    print("Initializing FastAPI server...")
    
    if os.path.exists(MODEL_PATH):
        print(f"Loading ML model from {MODEL_PATH}...")
        ml_artifacts["pipeline"] = joblib.load(MODEL_PATH)
        print("Model loaded successfully!")
    else:
        print(f"WARNING: Model not found at {MODEL_PATH}.")
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
async def predict_attendance_batch(req: BatchPredictRequest):
    pipeline = ml_artifacts.get("pipeline")
    if not pipeline:
        raise HTTPException(status_code=503, detail="Model is not loaded.")
        
    if not req.student_ids:
        raise HTTPException(status_code=400, detail="No student_ids provided.")
        
    try:
        # Fetch event features once for the batch
        event_data = get_event_features(req.event_id)
        event_date = event_data.pop("event_date")
        
        # 1. Fetch ALL student histories in a single Supabase query (N+1 fix)
        histories_by_student = get_batch_student_history(req.student_ids, event_date)
        
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

@app.post("/facial/identify")
async def identify_live_face(
    event_session_id: str = Form(...),
    intended_action: str = Form("check_in"),
    captures: list[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="An authenticated organizer session is required.")
    if len(captures) != MIN_CAPTURE_FRAMES:
        raise HTTPException(status_code=422, detail=f"Exactly {MIN_CAPTURE_FRAMES} camera frames are required.")
    if any(capture.content_type not in {"image/jpeg", "image/png", "image/webp"} for capture in captures):
        raise HTTPException(status_code=415, detail="Capture must be a JPEG, PNG, or WebP image.")
    try:
        return await identify_and_record(
            access_token=authorization.split(" ", 1)[1].strip(),
            event_session_id=event_session_id,
            intended_action=intended_action,
            capture_bytes_list=[await capture.read() for capture in captures],
        )
    except FacialRecognitionError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error
