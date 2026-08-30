"""
feature_assembly.py

Single source of truth for turning a student's raw attendance history into
the Student Features the model expects. Imported by BOTH
train_attendance_model.py (via the already-aggregated dummy Excel columns)
and api/main.py (via this module directly, fed by supabase_client.py's raw
per-record history) so training and serving can never silently disagree
about what "blank" means.

All formulas below were verified against the real dummy dataset by
reconstructing each student's chronological history and confirming the
formula reproduces the file's own values exactly (see hand-off_file.md,
Section 4). Do not change the trend window or any formula here without
re-verifying and updating that section.

Vocabulary note: as of the data-integrity fixes, predominant_late_reason and
target_group_size_tier already use the DB's real vocabulary on both the
training side (corrected dummy xlsx files) and the serving side (Supabase's
native column values) — no translation mapping needed here.
"""

import numpy as np
import pandas as pd

TREND_WINDOW = 5

# attendance_status values that count as "excused" for streak purposes but
# NOT as "attended" — see hand-off_file.md, Section 2 (excused = not-attended).
NOT_ATTENDED_STATUSES = ("absent", "excused")
ATTENDED_STATUSES = ("present", "late")


def assemble_student_features(history: pd.DataFrame) -> dict:
    """
    history: this student's attendance rows strictly before the target event,
    sorted by event date ascending, with columns:
      - attendance_status: 'present' | 'late' | 'absent' | 'excused'
      - late_reason_category: str | None

    Returns a dict with the 5 Student Features plus their 4 paired
    missingness indicators, ready to be combined with Event Features into a
    single-row DataFrame for pipeline.predict_proba().
    """
    attended_mask = history["attendance_status"].isin(ATTENDED_STATUSES)
    attended_binary = attended_mask.astype(int).tolist()

    prior_event_count = len(history)
    prior_attended_count = int(attended_mask.sum())

    features = {}

    # rolling_participation_rate
    if prior_event_count == 0:
        features["rolling_participation_rate"] = 0.0
        features["has_rolling_rate"] = 0
    else:
        features["rolling_participation_rate"] = prior_attended_count / prior_event_count
        features["has_rolling_rate"] = 1

    # consecutive_missed_events — always defined, never blank
    streak = 0
    for status in reversed(history["attendance_status"].tolist()):
        if status in NOT_ATTENDED_STATUSES:
            streak += 1
        else:
            break
    features["consecutive_missed_events"] = streak

    # tardiness_frequency
    if prior_attended_count == 0:
        features["tardiness_frequency"] = 0.0
        features["has_tardiness_history"] = 0
    else:
        late_count = (history["attendance_status"] == "late").sum()
        features["tardiness_frequency"] = late_count / prior_attended_count
        features["has_tardiness_history"] = 1

    # participation_trend_slope — linear-regression slope over the LAST 5
    # prior events only, not full history (verified window size, see docstring)
    if prior_event_count < 2:
        features["participation_trend_slope"] = 0.0
        features["has_trend"] = 0
    else:
        window = attended_binary[-TREND_WINDOW:]
        x = np.arange(len(window))
        features["participation_trend_slope"] = float(np.polyfit(x, window, 1)[0])
        features["has_trend"] = 1

    # predominant_late_reason — most frequent; ties broken by most recent occurrence
    # (tie-break rule is an assumption, not verifiable from the dummy data —
    # see hand-off_file.md, Section 4)
    late_rows = history[history["attendance_status"] == "late"]
    if late_rows.empty:
        features["predominant_late_reason"] = "No prior lates"
        features["was_ever_late"] = 0
    else:
        reasons = late_rows["late_reason_category"]
        counts = reasons.value_counts()
        top_count = counts.max()
        top_reasons = counts[counts == top_count].index.tolist()
        for reason in reversed(reasons.tolist()):
            if reason in top_reasons:
                features["predominant_late_reason"] = reason
                break
        features["was_ever_late"] = 1

    return features