"""
train_attendance_model.py

Trains the RandomForestClassifier attendance-prediction pipeline and produces
two artifacts:
  - attendance_model.pkl   (the fitted sklearn Pipeline: encoder + classifier)
  - model_insights.json    (global permutation importance + partial dependence,
                             for the Event Attendance Prediction analytics tab
                             and the /model/insights endpoint)

Feature set decisions (see hand-off_file.md for the full rationale):
  - college_department / program / year_level / section are identity/
    bookkeeping columns, NOT model features (Decision #3).
  - no_of_pax, day_of_week_number, priority_event_category, college_office
    are excluded — not part of Algorithm 1's declared Event Features.
  - predominant_late_reason and target_group_size_tier use the DB-aligned
    vocabulary (see the corrected dummy xlsx files) — no translation layer
    needed at serving time.
  - Missing-value handling follows the documented Section 2 decision:
    paired binary indicators (has_rolling_rate, has_tardiness_history,
    has_trend, was_ever_late), numeric blanks -> 0.0, predominant_late_reason
    blank -> "No prior lates".
"""

import json
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import partial_dependence, permutation_importance
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

DATA_DIR = "data"
STUDENT_FEATURES_FILE = f"{DATA_DIR}/PLPass_Student_Features_Dummy.xlsx"
EVENT_FEATURES_FILE = f"{DATA_DIR}/PLPass_Event_Features_Table.xlsx"

MODEL_OUT = "attendance_model.pkl"
INSIGHTS_OUT = "model_insights.json"

# Columns the model is actually allowed to see.
NUMERIC_FEATURES = [
    "rolling_participation_rate",
    "tardiness_frequency",
    "participation_trend_slope",
    "consecutive_missed_events",
    "has_rolling_rate",
    "has_tardiness_history",
    "has_trend",
    "was_ever_late",
    "duration_hours",
    "lead_time_days",
]
CATEGORICAL_FEATURES = [
    "predominant_late_reason",
    "event_category",
    "mandatory_voluntary",
    "day_of_week",
    "time_of_day_bucket",
    "venue",
    "target_group_size_tier",
]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

# Explicitly excluded, and why — kept here so the exclusion is a documented
# decision, not a silent omission:
#   event_id, event_name, student_id, event_date  -> identifiers, not features
#   college_department, program, year_level, section -> identity/bookkeeping (Decision #3)
#   prior_event_count, prior_attended_count -> intermediates already folded into
#     rolling_participation_rate; not separately listed in Algorithm 1
#   no_of_pax, day_of_week_number, priority_event_category, college_office
#     -> not part of Algorithm 1's Event Features; priority_event_category
#        belongs to the separate Priority Ranking algorithm


def load_and_join() -> pd.DataFrame:
    student_df = pd.read_excel(STUDENT_FEATURES_FILE)
    event_df = pd.read_excel(EVENT_FEATURES_FILE)

    # Both tables carry event_name/event_date; keep the event table's copies,
    # drop the duplicates from the student table before merging.
    student_df = student_df.drop(columns=["event_name", "event_date"])

    merged = student_df.merge(event_df, on="event_id", how="inner", validate="many_to_one")
    return merged


def apply_missingness_handling(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["has_rolling_rate"] = df["rolling_participation_rate"].notna().astype(int)
    df["rolling_participation_rate"] = df["rolling_participation_rate"].fillna(0.0)

    df["has_tardiness_history"] = df["tardiness_frequency"].notna().astype(int)
    df["tardiness_frequency"] = df["tardiness_frequency"].fillna(0.0)

    df["has_trend"] = df["participation_trend_slope"].notna().astype(int)
    df["participation_trend_slope"] = df["participation_trend_slope"].fillna(0.0)

    df["was_ever_late"] = df["predominant_late_reason"].notna().astype(int)
    df["predominant_late_reason"] = df["predominant_late_reason"].fillna("No prior lates")

    return df


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            ("numeric", "passthrough", NUMERIC_FEATURES),
        ]
    )
    classifier = RandomForestClassifier(
        n_estimators=300,
        random_state=42,
        class_weight="balanced",
    )
    return Pipeline(steps=[("preprocessor", preprocessor), ("classifier", classifier)])


def main():
    print("Loading and joining Student Features + Event Features...")
    df = load_and_join()
    df = apply_missingness_handling(df)

    # attended = Present or Late; Absent (and, at serving time, Excused) = not attended
    df["attended"] = df["actual_attendance_status"].isin(["Present", "Late"]).astype(int)

    # sklearn's partial_dependence warns (and will error in 1.9) on integer
    # dtypes, so the indicator/count columns need to be float going in.
    df[NUMERIC_FEATURES] = df[NUMERIC_FEATURES].astype(float)

    X = df[ALL_FEATURES]
    y = df["attended"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"Train rows: {len(X_train)}  Test rows: {len(X_test)}")
    print("Training RandomForestClassifier pipeline...")
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    auc_score = roc_auc_score(y_test, y_proba)

    print("\n=== Evaluation report (held-out test set) ===")
    print(f"Accuracy: {accuracy:.4f}")
    print(f"ROC AUC:  {auc_score:.4f}")
    print(classification_report(y_test, y_pred, target_names=["Not Attended", "Attended"]))

    # --- Permutation importance, computed on the RAW (pre-encoding) feature
    # columns by permuting the whole pipeline's input, so importances are
    # reported per human-meaningful feature (e.g. "predominant_late_reason"),
    # not per one-hot sub-column.
    print("Computing permutation importance...")
    perm_result = permutation_importance(
        pipeline, X_test, y_test,
        n_repeats=30,
        random_state=42,
        scoring="accuracy",
    )
    importance_ranked = sorted(
        zip(ALL_FEATURES, perm_result.importances_mean, perm_result.importances_std),
        key=lambda item: item[1],
        reverse=True,
    )

    print("\n=== Ranked feature importance (top 10) ===")
    for feat, mean, std in importance_ranked[:10]:
        print(f"  {feat:32s} {mean:+.4f} (+/- {std:.4f})")

    # --- Partial dependence for the top 5 features only (cheap to compute,
    # and these are the only ones the analytics tab needs).
    print("\nComputing partial dependence for top 5 features...")
    top_features = [feat for feat, _, _ in importance_ranked[:5]]
    pdp_results = {}
    for feat in top_features:
        try:
            pd_out = partial_dependence(pipeline, X_test, features=[feat], kind="average")
            grid_values = pd_out["grid_values"][0]
            average = pd_out["average"][0]
            # numpy types aren't JSON-serializable; cast explicitly
            pdp_results[feat] = {
                "grid_values": [v.item() if hasattr(v, "item") else v for v in grid_values],
                "average": [v.item() for v in average],
            }
        except Exception as exc:
            print(f"  Skipped partial dependence for {feat}: {exc}")

    insights = {
        "feature_importance": [
            {"feature": feat, "importance_mean": float(mean), "importance_std": float(std)}
            for feat, mean, std in importance_ranked
        ],
        "partial_dependence": pdp_results,
        "trained_on_rows": int(len(df)),
        "test_rows": int(len(X_test)),
        "test_accuracy": float(accuracy),
        "test_auc": float(auc_score),
        "model_features": ALL_FEATURES,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(INSIGHTS_OUT, "w") as f:
        json.dump(insights, f, indent=2)
    print(f"\nSaved global model insights to {INSIGHTS_OUT}")

    # --- Refit on the FULL dataset for the artifact that actually gets served
    print("Refitting on full dataset...")
    final_pipeline = build_pipeline()
    final_pipeline.fit(X, y)
    joblib.dump(final_pipeline, MODEL_OUT)
    print(f"Saved trained pipeline to {MODEL_OUT}")


if __name__ == "__main__":
    main()