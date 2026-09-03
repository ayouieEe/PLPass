"""DeepFace-backed, event-scoped facial identification for live attendance."""

from __future__ import annotations

import os
import asyncio
from typing import Any
from urllib.parse import quote

import cv2
import httpx
import numpy as np

MODEL_NAME = os.environ.get("DEEPFACE_MODEL", "SFace")
DETECTOR_BACKEND = os.environ.get("DEEPFACE_DETECTOR", "opencv")
AMBIGUITY_MARGIN = float(os.environ.get("DEEPFACE_AMBIGUITY_MARGIN", "0.05"))
MAX_IMAGE_BYTES = 5 * 1024 * 1024
_REFERENCE_CACHE: dict[str, tuple[float, ...]] = {}


class FacialRecognitionError(RuntimeError):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _supabase_settings() -> tuple[str, str]:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").rstrip("/")
    key = (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    )
    if not url or not key:
        raise FacialRecognitionError("Supabase facial-recognition configuration is missing.", 503)
    return url, key


def _authorized_headers(access_token: str) -> dict[str, str]:
    _, key = _supabase_settings()
    return {"apikey": key, "Authorization": f"Bearer {access_token}"}


def _decode_image(image_bytes: bytes) -> np.ndarray[Any, Any]:
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise FacialRecognitionError("Capture must be a non-empty image no larger than 5 MB.")
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise FacialRecognitionError("The camera capture is not a supported image.")
    return image


def _embedding(image: np.ndarray[Any, Any]) -> np.ndarray[Any, Any]:
    from deepface import DeepFace

    representations = DeepFace.represent(
        img_path=image,
        model_name=MODEL_NAME,
        detector_backend=DETECTOR_BACKEND,
        enforce_detection=True,
        align=True,
    )
    if len(representations) != 1:
        raise FacialRecognitionError("Exactly one clear face must be visible.")
    return np.asarray(representations[0]["embedding"], dtype=np.float32)


def _assert_live_face(image: np.ndarray[Any, Any]) -> None:
    from deepface import DeepFace

    faces = DeepFace.extract_faces(
        img_path=image,
        detector_backend=DETECTOR_BACKEND,
        enforce_detection=True,
        align=True,
        anti_spoofing=True,
    )
    if len(faces) != 1:
        raise FacialRecognitionError("Exactly one clear face must be visible.")
    if not bool(faces[0].get("is_real")):
        raise FacialRecognitionError("Liveness check failed. Use QR or manual attendance.")


def _cache_reference_embedding(enrollment_reference: str, image_bytes: bytes) -> tuple[float, ...]:
    cached = _REFERENCE_CACHE.get(enrollment_reference)
    if cached is not None:
        return cached
    embedding = tuple(float(value) for value in _embedding(_decode_image(image_bytes)))
    if len(_REFERENCE_CACHE) >= 512:
        _REFERENCE_CACHE.pop(next(iter(_REFERENCE_CACHE)))
    _REFERENCE_CACHE[enrollment_reference] = embedding
    return embedding


def _cosine_similarity(first: np.ndarray[Any, Any], second: np.ndarray[Any, Any]) -> float:
    denominator = float(np.linalg.norm(first) * np.linalg.norm(second))
    return float(np.dot(first, second) / denominator) if denominator else 0.0


def _model_similarity_threshold() -> float:
    from deepface.modules.verification import find_threshold

    return 1.0 - float(find_threshold(MODEL_NAME, "cosine"))


async def identify_and_record(
    *, access_token: str, event_session_id: str, intended_action: str, capture_bytes: bytes
) -> dict[str, Any]:
    if intended_action not in {"check_in", "check_out"}:
        raise FacialRecognitionError("Facial attendance action must be check_in or check_out.")
    url, _ = _supabase_settings()
    headers = _authorized_headers(access_token)
    capture = _decode_image(capture_bytes)
    await asyncio.to_thread(_assert_live_face, capture)
    capture_embedding = await asyncio.to_thread(_embedding, capture)

    async with httpx.AsyncClient(timeout=30.0) as client:
        candidate_response = await client.post(
            f"{url}/rest/v1/rpc/get_live_facial_candidates",
            headers={**headers, "Content-Type": "application/json"},
            json={"p_event_session_id": event_session_id},
        )
        if candidate_response.status_code >= 400:
            raise FacialRecognitionError("The active facial session could not be authorized.", candidate_response.status_code)
        candidates = candidate_response.json()
        if not candidates:
            raise FacialRecognitionError("No enrolled facial profiles are available for this event.")

        matches: list[tuple[float, dict[str, Any]]] = []
        for candidate in candidates:
            reference = str(candidate.get("enrollment_reference") or "")
            if not reference:
                continue
            cached_embedding = _REFERENCE_CACHE.get(reference)
            try:
                if cached_embedding is None:
                    storage_response = await client.get(
                        f"{url}/storage/v1/object/facial-enrollments/{quote(reference, safe='/')}",
                        headers=headers,
                    )
                    if storage_response.status_code >= 400:
                        continue
                    cached_embedding = await asyncio.to_thread(
                        _cache_reference_embedding, reference, storage_response.content
                    )
                reference_embedding = np.asarray(cached_embedding, dtype=np.float32)
            except (FacialRecognitionError, ValueError):
                continue
            matches.append((_cosine_similarity(capture_embedding, reference_embedding), candidate))

        if not matches:
            raise FacialRecognitionError("No usable enrolled facial profiles were found for this event.")
        matches.sort(key=lambda item: item[0], reverse=True)
        best_score, best_candidate = matches[0]
        threshold = _model_similarity_threshold()
        if best_score < threshold:
            raise FacialRecognitionError("Face was not recognized. Use QR or manual attendance.")
        if len(matches) > 1 and best_score - matches[1][0] < AMBIGUITY_MARGIN:
            raise FacialRecognitionError("The facial match is ambiguous. Use QR or manual attendance.")

        record_response = await client.post(
            f"{url}/rest/v1/rpc/record_live_facial_attendance",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "p_event_session_id": event_session_id,
                "p_student_id": best_candidate["student_id"],
                "p_similarity": round(best_score, 6),
                "p_action": intended_action,
            },
        )
        if record_response.status_code >= 400:
            raise FacialRecognitionError("The verified attendance result could not be recorded.", record_response.status_code)

    record = record_response.json()
    return {
        "student_id": best_candidate["student_id"],
        "student_number": best_candidate["student_number"],
        "display_name": best_candidate["display_name"],
        "similarity": round(best_score, 4),
        "action": record.get("action", "checked_in"),
        "attendance_status": record.get("attendance_status", "present"),
        "recorded_at": record.get("recorded_at"),
    }
