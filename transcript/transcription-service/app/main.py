import os
 
# Must be set before faster_whisper / huggingface_hub are imported
os.environ.setdefault("HF_HOME", r"E:\hf_cache")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
 
import traceback
import json
import asyncio
import tempfile
import time
import requests
from pathlib import Path
 
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel
from google import genai
 
 
# ==========================================
# 1. ENVIRONMENT CONFIGURATION
# ==========================================
 
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_PATH)
 
AI_PROVIDER = os.getenv("AI_PROVIDER", "ollama").lower()
 
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
 
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:4b")
OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://localhost:11434"
)
 
# ---- Transcription provider ----
# "groq"  = Groq's hosted Whisper API (fast, no GPU needed, audio is sent to Groq)
# "local" = faster-whisper on this PC (private, but slow on CPU)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "whisper-large-v3")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
 
TRANSCRIBE_PROVIDER = os.getenv(
    "TRANSCRIBE_PROVIDER",
    "groq" if GROQ_API_KEY else "local"
).strip().lower()
 
# Optional: force a language ("en", "hi", ...). Empty = auto-detect.
TRANSCRIBE_LANGUAGE = os.getenv("TRANSCRIBE_LANGUAGE", "").strip() or None
# Optional: vocabulary hint (names, jargon) to improve accuracy.
TRANSCRIBE_PROMPT = os.getenv("TRANSCRIBE_PROMPT", "").strip() or None
 
# Groq's free tier accepts files up to 25 MB.
GROQ_MAX_FILE_BYTES = 24 * 1024 * 1024
 
# ==========================================
# 2. FASTAPI CONFIGURATION
# ==========================================
 
app = FastAPI(
    title="TeamOS Transcription Service",
    description="Meeting transcription and AI analysis",
    version="1.0.0"
)
 
 
# ==========================================
# 3. WHISPER CONFIGURATION (local fallback)
# ==========================================
 
MODEL_SIZE = "small"
DEVICE = "cpu"
COMPUTE_TYPE = "int8"
WHISPER_DOWNLOAD_ROOT = r"E:\whisper_models"
 
MAX_AUDIO_SIZE = 100 * 1024 * 1024
 
whisper_model = None
 
 
def get_whisper_model():
    """Load local Whisper model only once."""
 
    global whisper_model
 
    if whisper_model is None:
        whisper_model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=WHISPER_DOWNLOAD_ROOT,
        )
 
    return whisper_model
 
 
def transcribe_local(temp_path):
    """Transcribe with local faster-whisper. Returns a list of segment dicts."""
 
    model = get_whisper_model()
 
    segments, info = model.transcribe(
        temp_path,
        vad_filter=True,
        language=TRANSCRIBE_LANGUAGE,
        initial_prompt=TRANSCRIBE_PROMPT,
    )
 
    print(
        f"DEBUG: audio duration {info.duration:.1f}s, "
        f"language {info.language} "
        f"({info.language_probability:.2f})"
    )
 
    transcript = []
 
    for index, segment in enumerate(segments, start=1):
 
        text = segment.text.strip()
 
        if not text:
            continue
 
        transcript.append({
            "segmentId": f"seg_{index:03d}",
            "speakerId": None,
            "startTime": round(segment.start, 2),
            "endTime": round(segment.end, 2),
            "text": text
        })
 
    return transcript
 
 
# ==========================================
# 3B. GROQ WHISPER API
# ==========================================
 
def transcribe_groq(content, filename):
    """
    Send the uploaded audio to Groq's Whisper API.
    Returns a list of segment dicts in the same format as the local path.
    """
 
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is missing from .env "
            "(get a free key at https://console.groq.com)"
        )
 
    if len(content) > GROQ_MAX_FILE_BYTES:
        raise RuntimeError(
            f"Audio is {len(content) / 1048576:.1f} MB; Groq accepts up to "
            f"{GROQ_MAX_FILE_BYTES // 1048576} MB per request. "
            "Record a shorter clip, or set TRANSCRIBE_PROVIDER=local."
        )
 
    data = {
        "model": GROQ_MODEL,
        "response_format": "verbose_json",
        "temperature": "0",
    }
 
    if TRANSCRIBE_LANGUAGE:
        data["language"] = TRANSCRIBE_LANGUAGE
 
    if TRANSCRIBE_PROMPT:
        data["prompt"] = TRANSCRIBE_PROMPT[:800]
 
    url = f"{GROQ_BASE_URL}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
 
    response = None
 
    for attempt in range(6):
 
        try:
            response = requests.post(
                url,
                headers=headers,
                files={"file": (filename, content)},
                data=data,
                timeout=180
            )
        except requests.RequestException as network_error:
            if attempt >= 3:
                raise RuntimeError(
                    f"Network error talking to Groq: {network_error}"
                )
            time.sleep(2 * (attempt + 1))
            continue
 
        if response.status_code == 200:
            break
 
        # Rate limited or temporary server problem: wait and retry
        if response.status_code == 429 or response.status_code >= 500:
            try:
                delay = float(response.headers.get("retry-after", ""))
            except ValueError:
                delay = 5.0 * (attempt + 1)
            print(
                f"Groq returned {response.status_code}, "
                f"retrying in {min(delay, 60):.0f}s..."
            )
            time.sleep(min(delay, 60))
            continue
 
        if response.status_code == 401:
            raise RuntimeError(
                "Groq rejected the API key (401). Check GROQ_API_KEY in .env"
            )
 
        raise RuntimeError(
            f"Groq error {response.status_code}: {response.text[:300]}"
        )
 
    if response is None or response.status_code != 200:
        raise RuntimeError(
            "Groq kept rate-limiting or failing this request. Try again shortly."
        )
 
    payload = response.json()
 
    print(
        f"DEBUG: Groq model {GROQ_MODEL}, "
        f"duration {payload.get('duration')}, "
        f"language {payload.get('language')}"
    )
 
    transcript = []
 
    for raw in payload.get("segments") or []:
 
        text = (raw.get("text") or "").strip()
 
        if not text:
            continue
 
        # Drop Whisper's classic hallucinations on silence/noise
        if (
            raw.get("no_speech_prob", 0) > 0.8
            and raw.get("avg_logprob", 0) < -0.8
        ):
            continue
 
        transcript.append({
            "segmentId": f"seg_{len(transcript) + 1:03d}",
            "speakerId": None,
            "startTime": round(float(raw["start"]), 2),
            "endTime": round(float(raw["end"]), 2),
            "text": text
        })
 
    return transcript
 
 
# ==========================================
# 4. GEMINI CLIENT
# ==========================================
 
def get_gemini_client():
    """Create Gemini API client."""
 
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is missing from .env"
        )
 
    return genai.Client(api_key=GEMINI_API_KEY)
 
 
# ==========================================
# 5. TRANSCRIPT CHUNKING
# ==========================================
 
def split_transcript_into_chunks(
    transcript_segments,
    chunk_duration=300
):
    """
    Divide transcript into approximately 5-minute chunks.
 
    Original segment IDs and timestamps are preserved.
    """
 
    chunks = []
    current_chunk = []
    chunk_start = 0
 
    for segment in transcript_segments:
 
        if (
            current_chunk
            and segment["startTime"] >= chunk_start + chunk_duration
        ):
            chunks.append(current_chunk)
 
            current_chunk = []
            chunk_start = segment["startTime"]
 
        current_chunk.append(segment)
 
    if current_chunk:
        chunks.append(current_chunk)
 
    return chunks
 
 
# ==========================================
# 6. GEMINI CHUNK ANALYSIS
# ==========================================
 
async def analyze_transcript_with_ai(
    transcript_segments
):
    """Analyze transcript chunks using Gemini."""
 
    client = None
 
    if AI_PROVIDER == "gemini":
        client = get_gemini_client()
 
    chunks = split_transcript_into_chunks(
        transcript_segments
    )
 
    print(f"Total transcript chunks: {len(chunks)}")
 
    valid_ids = {
        segment["segmentId"]
        for segment in transcript_segments
    }
 
    valid_task_types = {
        "confirmed_commitment",
        "proposal",
        "follow_up"
    }
 
    valid_flags = {
        "owner_unclear",
        "deadline_ambiguous",
        "commitment_uncertain"
    }
 
    # ------------------------------------------
    # Analyze one transcript chunk
    # ------------------------------------------
 
    def analyze_chunk(chunk):
 
        transcript_json = json.dumps(
            chunk,
            ensure_ascii=False
        )
 
        prompt = """
You are TeamOS, an AI meeting analysis assistant.
 
Analyze this meeting transcript section.
 
Extract:
1. Tasks
2. Decisions
3. Unresolved questions
 
RULES:
- Extract only information supported by the transcript.
- Never invent tasks, decisions, owners, deadlines or evidence.
- confirmed_commitment means explicitly accepted responsibility.
- proposal means suggested work not yet agreed upon.
- follow_up means an action requiring further discussion.
- Keep suggestedOwnerSpeakerId and suggestedDeadlineAt null.
- Preserve mentioned deadlines in suggestedDeadlineText.
- Use null for missing descriptions or deadlines.
- Every evidenceSegmentId must match an existing segmentId.
- Confidence must be between 0 and 1.
- Allowed uncertaintyFlags:
  owner_unclear, deadline_ambiguous, commitment_uncertain.
- Return empty arrays when nothing is found.
 
Return ONLY JSON in this structure:
 
{
  "tasks": [
    {
      "type": "confirmed_commitment",
      "title": "Task title",
      "description": null,
      "suggestedOwnerSpeakerId": null,
      "suggestedDeadlineText": null,
      "suggestedDeadlineAt": null,
      "evidenceSegmentIds": ["seg_001"],
      "uncertaintyFlags": [],
      "confidence": 0.9
    }
  ],
  "decisions": [
    {
      "title": "Decision",
      "evidenceSegmentIds": ["seg_001"],
      "confidence": 0.9
    }
  ],
  "openQuestions": [
    {
      "question": "Unresolved question",
      "evidenceSegmentIds": ["seg_001"],
      "confidence": 0.9
    }
  ]
}
 
TRANSCRIPT:
""" + transcript_json
 
        api_start_time = time.perf_counter()
 
        if AI_PROVIDER == "ollama":
 
            response = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                    "think": False,
                    "options": {
                        "temperature": 0.1
                    }
                },
                timeout=600
            )
 
            response.raise_for_status()
 
            response_data = response.json()
            print("DEBUG: Ollama response received")
            response_text = response_data.get("response", "")
 
        elif AI_PROVIDER == "gemini":
 
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "temperature": 0.1
                }
            )
 
            response_text = response.text or ""
            print("DEBUG: Gemini response received")
 
        else:
            raise ValueError(
                f"Unsupported AI provider: {AI_PROVIDER}"
            )
 
        api_elapsed = time.perf_counter() - api_start_time
 
        print(
            f"{AI_PROVIDER.upper()} chunk API call: "
            f"{api_elapsed:.2f} seconds"
        )
 
        if not response_text:
            raise ValueError(
                f"{AI_PROVIDER} returned an empty response"
            )
 
        print("\n========== RAW AI RESPONSE ==========")
        print(response_text)
        print("=====================================\n")
 
        parsed_response = json.loads(response_text)
 
        print("AI response keys:", parsed_response.keys())
        print("Tasks received:", len(parsed_response.get("tasks", [])))
        print("Decisions received:", len(parsed_response.get("decisions", [])))
        print("Questions received:", len(parsed_response.get("openQuestions", [])))
 
        return parsed_response
 
    # ------------------------------------------
    # Process chunks with limited concurrency
    # ------------------------------------------
 
    semaphore = asyncio.Semaphore(
        1 if AI_PROVIDER == "ollama" else 2
    )
 
    async def process_chunk(chunk):
 
        async with semaphore:
 
            return await asyncio.to_thread(
                analyze_chunk,
                chunk
            )
 
    gemini_start_time = time.perf_counter()
 
    results = await asyncio.gather(
        *(process_chunk(chunk) for chunk in chunks)
    )
 
    gemini_elapsed = time.perf_counter() - gemini_start_time
 
    print(
        f"Gemini chunk analysis total: "
        f"{gemini_elapsed:.2f} seconds"
    )
 
    # ==========================================
    # 7. COMBINE CHUNK RESULTS
    # ==========================================
 
    all_tasks = []
    all_decisions = []
    all_questions = []
 
    for result in results:
 
        all_tasks.extend(
            result.get("tasks", [])
        )
 
        all_decisions.extend(
            result.get("decisions", [])
        )
 
        all_questions.extend(
            result.get("openQuestions", [])
        )
 
    # ------------------------------------------
    # Validate tasks
    # ------------------------------------------
 
    tasks = []
 
    for task in all_tasks:
        if not isinstance(task, dict):
            continue
 
        if task.get("type") not in valid_task_types:
            continue
 
        evidence = [
            item
            for item in task.get("evidenceSegmentIds", [])
            if item in valid_ids
        ]
 
        if not evidence or not task.get("title"):
            continue
 
        try:
            confidence = float(
                task.get("confidence", 0.5)
            )
        except (TypeError, ValueError):
            confidence = 0.5
 
        tasks.append({
            "type": task["type"],
            "title": task["title"],
            "description": task.get("description"),
            "suggestedOwnerSpeakerId": None,
            "suggestedDeadlineText": task.get(
                "suggestedDeadlineText"
            ),
            "suggestedDeadlineAt": None,
            "evidenceSegmentIds": list(
                dict.fromkeys(evidence)
            ),
            "uncertaintyFlags": [
                flag
                for flag in task.get("uncertaintyFlags", [])
                if flag in valid_flags
            ],
            "confidence": max(
                0.0,
                min(1.0, confidence)
            )
        })
 
    # ------------------------------------------
    # Validate decisions
    # ------------------------------------------
 
    decisions = []
 
    for decision in all_decisions:
        if not isinstance(decision, dict):
            continue
 
        evidence = [
            item
            for item in decision.get("evidenceSegmentIds", [])
            if item in valid_ids
        ]
 
        if not evidence or not decision.get("title"):
            continue
 
        try:
            confidence = float(
                decision.get("confidence", 0.5)
            )
        except (TypeError, ValueError):
            confidence = 0.5
 
        decisions.append({
            "title": decision["title"],
            "evidenceSegmentIds": list(
                dict.fromkeys(evidence)
            ),
            "confidence": max(
                0.0,
                min(1.0, confidence)
            )
        })
 
    # ------------------------------------------
    # Validate open questions
    # ------------------------------------------
 
    open_questions = []
 
    for question in all_questions:
        if not isinstance(question, dict):
            continue
 
        evidence = [
            item
            for item in question.get("evidenceSegmentIds", [])
            if item in valid_ids
        ]
 
        if not evidence or not question.get("question"):
            continue
 
        try:
            confidence = float(
                question.get("confidence", 0.5)
            )
        except (TypeError, ValueError):
            confidence = 0.5
 
        open_questions.append({
            "question": question["question"],
            "evidenceSegmentIds": list(
                dict.fromkeys(evidence)
            ),
            "confidence": max(
                0.0,
                min(1.0, confidence)
            )
        })
 
    # ------------------------------------------
    # Return final response
    # ------------------------------------------
 
    return {
        "transcriptSegments": transcript_segments,
        "tasks": tasks,
        "decisions": decisions,
        "openQuestions": open_questions
    }
 
 
# ==========================================
# 8. HEALTH CHECK ENDPOINT
# ==========================================
 
@app.get("/api/v1/health")
def health_check():
 
    return {
        "success": True,
        "data": {
            "status": "ok",
            "service": "transcription-service",
            "transcriptionProvider": TRANSCRIBE_PROVIDER
        }
    }
 
 
# ==========================================
# 9. MAIN MEETING ANALYSIS ENDPOINT
# ==========================================
 
@app.post("/api/v1/analyze")
async def analyze_meeting(
    audio: UploadFile = File(...)
):
 
    request_start_time = time.perf_counter()
 
    if not audio.filename:
        raise HTTPException(
            status_code=400,
            detail="Audio filename is missing"
        )
 
    content = await audio.read()
 
    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio file is empty"
        )
 
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Audio file exceeds the 100 MB limit"
        )
 
    suffix = Path(audio.filename).suffix or ".audio"
 
    temp_path = None
 
    try:
 
        # --------------------------------------
        # Save uploaded audio temporarily
        # --------------------------------------
 
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:
 
            temp_file.write(content)
            temp_path = temp_file.name
 
        # DEBUG: keep a copy of the uploaded audio so you can play it
        debug_audio_path = Path(r"E:\transcript\debug_upload" + suffix)
        try:
            debug_audio_path.write_bytes(content)
            print(
                f"DEBUG: saved upload to {debug_audio_path} "
                f"({len(content) / 1024:.1f} KB)"
            )
        except Exception as save_error:
            print("DEBUG: could not save debug audio:", save_error)
 
        # --------------------------------------
        # STEP 1: Transcribe audio
        # --------------------------------------
 
        print(f"Transcription provider: {TRANSCRIBE_PROVIDER}")
 
        start_time = time.perf_counter()
 
        if TRANSCRIBE_PROVIDER == "groq":
 
            transcript_segments = await asyncio.to_thread(
                transcribe_groq,
                content,
                audio.filename
            )
 
        elif TRANSCRIBE_PROVIDER == "local":
 
            transcript_segments = await asyncio.to_thread(
                transcribe_local,
                temp_path
            )
 
        else:
            raise ValueError(
                f"Unsupported TRANSCRIBE_PROVIDER: {TRANSCRIBE_PROVIDER}"
            )
 
        transcription_time = (
            time.perf_counter() - start_time
        )
 
        print(
            f"Transcription ({TRANSCRIBE_PROVIDER}): "
            f"{transcription_time:.2f} seconds"
        )
 
        # ---- DEBUG: what did Whisper actually hear? ----
        print("SEGMENT COUNT:", len(transcript_segments))
        if transcript_segments:
            print("AUDIO LENGTH (s):", transcript_segments[-1]["endTime"])
        for seg in transcript_segments:
            print(
                f'{seg["segmentId"]} '
                f'[{seg["startTime"]}-{seg["endTime"]}] '
                f'{seg["text"]!r}'
            )
        # ------------------------------------------------
 
        # --------------------------------------
        # Return if no speech is detected
        # --------------------------------------
 
        if not transcript_segments:
 
            print(
                "No speech detected in uploaded audio."
            )
 
            return {
                "transcriptSegments": [],
                "tasks": [],
                "decisions": [],
                "openQuestions": []
            }
 
        # --------------------------------------
        # STEP 2: AI meeting analysis
        # --------------------------------------
 
        result = await analyze_transcript_with_ai(
            transcript_segments
        )
 
        # --------------------------------------
        # STEP 3: Total request time
        # --------------------------------------
 
        total_time = (
            time.perf_counter() - request_start_time
        )
 
        print("----------------------------------")
        print(
            f"Total request time: "
            f"{total_time:.2f} seconds"
        )
        print("----------------------------------")
 
        return result
 
    except HTTPException:
        raise
 
    except Exception as error:
        print("========== PYTHON ERROR ==========")
        traceback.print_exc()
        print("=================================")
 
        raise HTTPException(
            status_code=502,
            detail="Meeting transcription or AI analysis failed."
        )
 
    finally:
        # Delete temporary audio file
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
 
