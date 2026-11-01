
import requests
import time

url = "http://localhost:11434/api/generate"

payload = {
    "model": "qwen3:4b",
    "prompt": "Reply with exactly this JSON: {\"status\": \"working\"}",
    "stream": False,
    "format": "json",
    "options": {
        "temperature": 0
    }
}

start = time.perf_counter()

response = requests.post(
    url,
    json=payload,
    timeout=180
)

response.raise_for_status()

result = response.json()

print("Ollama response:")
print(result["response"])

print(
    f"Time taken: {time.perf_counter() - start:.2f} seconds"
)
