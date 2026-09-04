"""DeepFace biometric processing for PLPass's organizer-operated fallback flow.

Embeddings are created only in this service. Browser clients receive status
messages, never an embedding or a candidate list.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any

import cv2
import httpx
import numpy as np

MODEL_NAME = os.environ.get("DEEPFACE_MODEL", "ArcFace")
DETECTOR_BACKEND = os.environ.get("DEEPFACE_DETECTOR", "retinaface")
COSINE_DISTANCE_THRESHOLD = float(os.environ.get("FACE_COSINE_DISTANCE_THRESHOLD", "0.32"))
MINIMUM_MATCH_MARGIN = float(os.environ.get("FACE_MINIMUM_MATCH_MARGIN", "0.04"))
# A single clear live frame keeps the organizer queue responsive. Angle
# tolerance comes from the student's three enrollment embeddings; retries are
# offered by the UI when a face is not confidently identified.
MIN_CAPTURE_FRAMES = int(os.environ.get("DEEPFACE_MIN_CAPTURE_FRAMES", "1"))
MIN_FACE_PIXELS = int(os.environ.get("FACE_MIN_FACE_PIXELS", "110"))
MAX_IMAGE_BYTES = 5 * 1024 * 1024
VALID_POSES = {"front", "left", "right"}


class FacialRecognitionError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class FaceEmbedding:
    vector: np.ndarray[Any, Any]


def warm_model() -> None:
    """Load ArcFace once at API startup; DeepFace subsequently uses its cache."""
    from deepface import DeepFace
    DeepFace.build_model(MODEL_NAME)


def _supabase_settings() -> tuple[str, str]:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY") or ""
    if not url or not key:
        raise FacialRecognitionError("FACE_SERVICE_ERROR", "Supabase facial-recognition configuration is missing.", 503)
    return url, key


def _authorized_headers(access_token: str) -> dict[str, str]:
    _, key = _supabase_settings()
    return {"apikey": key, "Authorization": f"Bearer {access_token}"}


def _service_headers() -> dict[str, str]:
    """The service-role key is server-only; never put it in a VITE variable."""
    url, _ = _supabase_settings()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise FacialRecognitionError("FACE_SERVICE_ERROR", "The server biometric key is not configured.", 503)
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _rpc_error(response: httpx.Response, code: str, fallback: str) -> FacialRecognitionError:
    try:
        payload = response.json()
    except ValueError:
        payload = None
    message = payload.get("message") if isinstance(payload, dict) else None
    safe_message = message.strip() if isinstance(message, str) and message.strip() else fallback
    return FacialRecognitionError(code, safe_message, 403 if response.status_code in {400, 401, 403} else response.status_code)


def _decode_image(image_bytes: bytes) -> np.ndarray[Any, Any]:
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise FacialRecognitionError("LOW_QUALITY_IMAGE", "Use a non-empty image that is 5 MB or smaller.")
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or min(image.shape[:2]) < 160:
        raise FacialRecognitionError("LOW_QUALITY_IMAGE", "Lighting or image quality is insufficient.")
    return image


def _detect_and_embed(image: np.ndarray[Any, Any]) -> FaceEmbedding:
    from deepface import DeepFace

    try:
        faces = DeepFace.extract_faces(img_path=image, detector_backend=DETECTOR_BACKEND, enforce_detection=True, align=True, anti_spoofing=True)
    except ValueError as error:
        # DeepFace's anti-spoof module is optional and requires PyTorch. Its
        # absence must not masquerade as a failed face detection or take QR/
        # manual attendance down. Detection/alignment still use RetinaFace.
        if "install torch" in str(error).lower() or "anti spoofing" in str(error).lower():
            try:
                faces = DeepFace.extract_faces(img_path=image, detector_backend=DETECTOR_BACKEND, enforce_detection=True, align=True, anti_spoofing=False)
            except ValueError as detection_error:
                raise FacialRecognitionError("NO_FACE_DETECTED", "Face could not be detected. Center one face and try again.") from detection_error
            except Exception as detection_error:
                raise FacialRecognitionError("FACE_SERVICE_ERROR", "Face processing is temporarily unavailable. Use QR or manual attendance.", 503) from detection_error
        else:
            raise FacialRecognitionError("NO_FACE_DETECTED", "Face could not be detected. Center one face and try again.") from error
    except Exception as error:
        raise FacialRecognitionError("FACE_SERVICE_ERROR", "Face processing is temporarily unavailable. Use QR or manual attendance.", 503) from error
    if not faces:
        raise FacialRecognitionError("NO_FACE_DETECTED", "Face could not be detected. Center one face and try again.")
    if len(faces) != 1:
        raise FacialRecognitionError("MULTIPLE_FACES", "Only one person should be visible to the camera.")
    face = faces[0]
    if not bool(face.get("is_real", True)):
        raise FacialRecognitionError("SPOOF_DETECTED", "Liveness check failed. Use QR or manual attendance.")
    area = face.get("facial_area") or {}
    if min(int(area.get("w", 0)), int(area.get("h", 0))) < MIN_FACE_PIXELS:
        raise FacialRecognitionError("FACE_TOO_SMALL", "Move closer to the camera and try again.")
    try:
        representations = DeepFace.represent(img_path=image, model_name=MODEL_NAME, detector_backend=DETECTOR_BACKEND, enforce_detection=True, align=True)
    except Exception as error:
        raise FacialRecognitionError("FACE_SERVICE_ERROR", "Face processing is temporarily unavailable. Use QR or manual attendance.", 503) from error
    if len(representations) != 1:
        raise FacialRecognitionError("MULTIPLE_FACES", "Only one person should be visible to the camera.")
    vector = np.asarray(representations[0].get("embedding", []), dtype=np.float32)
    if vector.size < 64 or not np.isfinite(vector).all():
        raise FacialRecognitionError("FACE_PROCESSING_ERROR", "Face embedding could not be created. Try again with better lighting.")
    return FaceEmbedding(vector)


def _cosine_distance(first: np.ndarray[Any, Any], second: np.ndarray[Any, Any]) -> float:
    denominator = float(np.linalg.norm(first) * np.linalg.norm(second))
    return float(1 - np.dot(first, second) / denominator) if denominator else 1.0


async def create_embedding(capture_bytes: bytes) -> list[float]:
    embedding = await asyncio.to_thread(_detect_and_embed, _decode_image(capture_bytes))
    return [float(value) for value in embedding.vector]


async def enroll_pose(*, access_token: str, pose: str, capture_bytes: bytes) -> dict[str, Any]:
    if pose not in VALID_POSES:
        raise FacialRecognitionError("INVALID_POSE", "Choose front, slight left, or slight right.")
    vector = await create_embedding(capture_bytes)
    url, _ = _supabase_settings()
    headers = _authorized_headers(access_token)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{url}/rest/v1/rpc/store_student_face_embedding", headers={**headers, "Content-Type": "application/json"}, json={"p_pose": pose, "p_embedding": vector, "p_model_name": MODEL_NAME, "p_detector_backend": DETECTOR_BACKEND})
    if response.status_code >= 400:
        raise _rpc_error(response, "ALREADY_ENROLLED", "Face enrollment could not be saved.")
    payload = response.json()
    return {"pose": pose, "complete": bool(payload.get("complete")), "completed_poses": payload.get("completed_poses", [])}


async def identify_and_record(*, access_token: str, event_session_id: str, intended_action: str, capture_bytes_list: list[bytes]) -> dict[str, Any]:
    if intended_action not in {"check_in", "check_out"}:
        raise FacialRecognitionError("FACE_PROCESSING_ERROR", "Facial attendance action must be check in or check out.")
    if len(capture_bytes_list) != MIN_CAPTURE_FRAMES:
        raise FacialRecognitionError("FACE_PROCESSING_ERROR", f"Exactly {MIN_CAPTURE_FRAMES} face captures are required for verification.")
    live_embeddings = [await create_embedding(capture) for capture in capture_bytes_list]
    url, _ = _supabase_settings()
    headers = _authorized_headers(access_token)
    async with httpx.AsyncClient(timeout=30) as client:
        candidate_response = await client.post(f"{url}/rest/v1/rpc/get_live_facial_candidate_ids", headers={**headers, "Content-Type": "application/json"}, json={"p_event_session_id": event_session_id})
        if candidate_response.status_code >= 400:
            raise _rpc_error(candidate_response, "SESSION_NOT_ACTIVE", "The active facial session could not be authorized.")
        candidates = candidate_response.json()
        if not candidates:
            raise FacialRecognitionError("NO_FACE_ENROLLMENT", "No fully enrolled facial profiles are available for this event.")
        candidate_ids = ",".join(str(candidate["student_id"]) for candidate in candidates)
        template_response = await client.get(
            f"{url}/rest/v1/student_face_embeddings?select=student_id,embedding&student_id=in.({candidate_ids})&model_name=eq.ArcFace&detector_backend=eq.retinaface",
            headers=_service_headers(),
        )
        if template_response.status_code >= 400:
            raise _rpc_error(template_response, "FACE_SERVICE_ERROR", "Biometric templates could not be loaded.")
        templates_by_student: dict[str, list[Any]] = {}
        for template in template_response.json():
            templates_by_student.setdefault(str(template["student_id"]), []).append(template["embedding"])
        candidates = [{**candidate, "embeddings": templates_by_student.get(str(candidate["student_id"]), [])} for candidate in candidates]
        frame_winners: list[tuple[float, dict[str, Any]]] = []
        for vector in live_embeddings:
            live = np.asarray(vector, dtype=np.float32)
            distances: list[tuple[float, dict[str, Any]]] = []
            for candidate in candidates:
                scores = [_cosine_distance(live, np.asarray(template, dtype=np.float32)) for template in candidate.get("embeddings", [])]
                if scores:
                    distances.append((min(scores), candidate))
            distances.sort(key=lambda item: item[0])
            if not distances or distances[0][0] > COSINE_DISTANCE_THRESHOLD:
                raise FacialRecognitionError("FACE_NOT_MATCHED", "Face was not recognized with enough confidence. Use QR or manual attendance.")
            if len(distances) > 1 and distances[1][0] - distances[0][0] < MINIMUM_MATCH_MARGIN:
                raise FacialRecognitionError("AMBIGUOUS_MATCH", "The face match is too close to another participant. Use QR or manual attendance.")
            frame_winners.append(distances[0])
        winner = frame_winners[0][1]
        if any(candidate["student_id"] != winner["student_id"] for _, candidate in frame_winners[1:]):
            raise FacialRecognitionError("AMBIGUOUS_MATCH", "Face identity was not stable across the verification frames. Try again.")
        distance = float(np.median([score for score, _ in frame_winners]))
        record_response = await client.post(f"{url}/rest/v1/rpc/record_live_facial_attendance", headers={**headers, "Content-Type": "application/json"}, json={"p_event_session_id": event_session_id, "p_student_id": winner["student_id"], "p_similarity": round(1 - distance, 6), "p_action": intended_action})
    if record_response.status_code >= 400:
        raise _rpc_error(record_response, "ALREADY_CHECKED_IN", "The verified attendance result could not be recorded.")
    record = record_response.json()
    return {"student_id": winner["student_id"], "student_number": winner["student_number"], "display_name": winner["display_name"], "distance": round(distance, 4), "action": record.get("action", "checked_in"), "attendance_status": record.get("attendance_status", "present"), "recorded_at": record.get("recorded_at")}
