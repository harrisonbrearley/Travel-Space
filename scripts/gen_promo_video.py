"""Generate a promotional video for Travel Space using Sora 2.

Run:
    python3 /app/scripts/gen_promo_video.py

Writes: /app/frontend/assets/marketing/promo.mp4
Model:  sora-2 (landscape 1280x720, 12s)  ≈ $1.20 per call
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

from emergentintegrations.llm.openai import OpenAIVideoGeneration  # noqa: E402

OUT = Path("/app/frontend/assets/marketing/promo.mp4")
OUT.parent.mkdir(parents=True, exist_ok=True)

PROMPT = """
Fast-paced 12-second horizontal (16:9 landscape) mobile app promo for "Travel Space", a modern travel-planning iOS/Android app.
Style: clean, minimal, premium — soft off-white background, subtle sage-green accent, upbeat and energetic mood.
Show a sleek smartphone tilted at a slight angle on the left third of the frame throughout. Right two-thirds show breathing lifestyle backgrounds
(a soft world map, wisps of clouds passing behind mountains, then Paris rooftops at golden hour, then Tokyo neon at night) that cross-fade as the app UI on the phone changes.

Scene 1 (0-2s): App logo — a stylized black hole with "TS" in the middle — spins on and lands, then the phone home screen appears with clean trip cards
("Tokyo Escape", "Paris Getaway") each with a big cover photo and a "Leaves in 12 days" countdown badge.
Scene 2 (2-5s): A finger taps a trip card, opens the Trip Detail screen. A horizontal strip of tabs slides in: Itinerary, Map, Flights, Transport, Stays, Attractions, Tickets, Docs, Budget.
Scene 3 (5-7s): The Map tab pans across an interactive world map with pins connecting Sydney → Tokyo → Paris; a flight arc animates between them.
Scene 4 (7-9s): The Auto-Add sheet slides up — a booking screenshot drops in, an AI sparkle runs, and the details snap into the Flights tab automatically.
Scene 5 (9-11s): The Budget tab shows a large green ring filling up as costs get deducted; currency symbols morph ($, €, ¥).
Scene 6 (11-12s): The phone glides to the center, the "Travel Space" wordmark appears to its right beside the black-hole logo, tagline "Travel itinerary made easy" beneath it.

Motion: smooth ease-out transitions, gentle parallax, tasteful UI micro-interactions, no jitter, no cluttered text overlays.
Colour palette: off-white #F7F5F0 background, muted sage green #6B8E7A brand accent, deep ink text.
Photorealistic phone rendering with realistic screen glow. No talking heads, no logos other than Travel Space.
""".strip()


def main() -> int:
    key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if not key:
        print("EMERGENT_LLM_KEY not set", file=sys.stderr)
        return 1

    client = OpenAIVideoGeneration(key)
    print("Requesting Sora 2 render (landscape 1280x720, 12s)…")
    video_bytes = client.text_to_video(
        prompt=PROMPT,
        model="sora-2",
        size="1280x720",
        duration=12,
        max_wait_time=900,  # 15 min ceiling
    )
    if not video_bytes:
        print("No bytes returned", file=sys.stderr)
        return 2
    OUT.write_bytes(video_bytes)
    print(f"Wrote {len(video_bytes) / 1024 / 1024:.2f} MB → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
