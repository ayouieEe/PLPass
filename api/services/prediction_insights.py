"""
prediction_insights.py

Generates risk levels, pattern labels, and explanations based on attendance
probabilities and student features. These values map to the ml_predictions 
table in Supabase.
"""

def get_risk_level(probability: float) -> str:
    """
    Maps an attendance probability to a discrete risk tier.
    Note: "Risk" implies risk of absence, so higher attendance probability
    means lower risk.
    """
    if probability >= 0.80:
        return "low"
    elif probability >= 0.50:
        return "medium"
    elif probability >= 0.20:
        return "high"
    else:
        return "critical"

def get_pattern_insights(features: dict) -> tuple[str, str]:
    """
    Inspects a student's assembled features and returns a human-readable 
    pattern label and explanation.
    
    Returns:
        (pattern_label, explanation)
    """
    # 1. New Student (No history)
    if features.get("has_rolling_rate", 1) == 0:
        return "New Student", "No prior attendance history available."
    
    # 2. Chronic Absentee
    consecutive_missed = features.get("consecutive_missed_events", 0)
    if consecutive_missed >= 3:
        return "Chronic Absentee", f"Has missed {int(consecutive_missed)} consecutive events."
    
    # 3. Frequent Tardiness
    if features.get("has_tardiness_history", 0) == 1 and features.get("tardiness_frequency", 0.0) >= 0.5:
        return "Frequent Tardiness", "Historically late to the majority of attended events."
    
    # 4. Low Overall Participation
    participation_rate = features.get("rolling_participation_rate", 1.0)
    if participation_rate <= 0.3:
        return "Low Participation", f"Historically low participation rate ({participation_rate:.0%})."
    
    # 5. Recent Absence
    if consecutive_missed > 0:
        return "Recent Absence", f"Missed {int(consecutive_missed)} recent event(s)."
        
    # 6. Consistent Attendee
    if participation_rate >= 0.8:
        return "Consistent Attendee", f"High overall participation rate ({participation_rate:.0%})."
        
    # Fallback
    return "Standard Profile", "No outstanding attendance flags."
