import os
import time
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(Path(__file__).resolve().parent / ".env")

print("Loading Gemini configuration...", flush=True)

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

if not api_key:
    raise ValueError("GEMINI_API_KEY is missing from .env")

client = genai.Client(api_key=api_key)

print(f"Using model: {model}", flush=True)
print("Sending request to Gemini...", flush=True)

start = time.perf_counter()

try:
    response = client.models.generate_content(
        model=model,
        contents='Return this exact JSON: {"status": "ok"}',
        config=types.GenerateContentConfig(
            response_mime_type="application/json"
        )
    )

    end = time.perf_counter()

    print("\nGemini response:", response.text)
    print(f"Gemini API response time: {end - start:.2f} seconds")

except Exception as error:
    print("\nGemini API error:", repr(error))