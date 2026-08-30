"""
supabase_client.py

Queries the real PLPass schema for the two things POST /predict needs:
  - a student's pre-event attendance history (feeds feature_assembly.py)
  - an event's structural features (Event Features, Algorithm 1)

Schema note: attendance_records does NOT link to events directly — it goes
through event_sessions. See hand-off_file.md, Section 7.
"""

import os

import pandas as pd
from supabase import create_client

# Load variables from .env if present
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v)

supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")

supabase = create_client(supabase_url, supabase_key)


def get_batch_student_history(student_ids: list[str], before_starts_at: str) -> dict[str, pd.DataFrame]:
    """
    Fetches the attendance history for a batch of students in a single Supabase query.
    student_ids: list of students.id (uuid)
    before_starts_at: the target event's events.starts_at, as an ISO string.
    
    Returns a dictionary mapping student_id to their history DataFrame.
    """
    if not student_ids:
        return {}
        
    response = (
        supabase.table("attendance_records")
        .select(
            "student_id, attendance_status, late_reason_category, "
            "event_sessions(event_id, events(starts_at))"
        )
        .in_("student_id", student_ids)
        .lt("event_sessions.events.starts_at", before_starts_at)
        .execute()
    )
    
    # Initialize dictionary for all requested students (even if no history)
    rows_by_student = {sid: [] for sid in student_ids}
    
    if response.data:
        for row in response.data:
            sid = row.get("student_id")
            if sid in rows_by_student:
                rows_by_student[sid].append(row)
            
    # Build a DataFrame for each student
    dfs = {}
    empty_df = pd.DataFrame(columns=["attendance_status", "late_reason_category", "starts_at"])
    
    for sid, rows in rows_by_student.items():
        if not rows:
            dfs[sid] = empty_df.copy()
        else:
            df = pd.DataFrame(rows)
            # Unpack starts_at
            df["starts_at"] = df["event_sessions"].apply(lambda x: x["events"]["starts_at"])
            dfs[sid] = df.sort_values("starts_at").reset_index(drop=True)
            
    return dfs


def get_event_features(event_id: str) -> dict:
    response = (
        supabase.table("events")
        .select(
            "category_id, event_categories(category_name), starts_at, ends_at, "
            "venue, target_group, participation_status, created_at"
        )
        .eq("id", event_id)
        .single()
        .execute()
    )
    e = response.data
    starts_at = pd.Timestamp(e["starts_at"])
    ends_at = pd.Timestamp(e["ends_at"])
    created_at = pd.Timestamp(e["created_at"])

    return {
        "event_category": e["event_categories"]["category_name"],
        "day_of_week": starts_at.day_name(),
        "time_of_day_bucket": _bucket_time_of_day(starts_at),
        "duration_hours": (ends_at - starts_at).total_seconds() / 3600,
        # lead_time_days = starts_at - created_at, confirmed (hand-off_file.md, Section 2)
        "lead_time_days": (starts_at - created_at).days,
        "venue": e["venue"],
        "target_group_size_tier": e["target_group"],       # matches DB vocabulary directly
        "mandatory_voluntary": e["participation_status"],
        "event_date": e["starts_at"], # Pass along the raw starts_at string for get_student_history
    }


def _bucket_time_of_day(ts: pd.Timestamp) -> str:
    hour = ts.hour
    if hour < 12:
        return "Morning"
    elif hour < 14:
        return "Midday"
    elif hour < 18:
        return "Afternoon"
    return "Whole Day"