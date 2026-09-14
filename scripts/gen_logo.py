import asyncio, base64, os, sys
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")

async def gen(prompt: str, out_path: str):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(api_key=api_key, session_id=f"gen-{os.path.basename(out_path)}", system_message="You are an assistant that generates images.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print("NO_IMAGE", text[:120])
        return False
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(images[0]["data"]))
    print("SAVED", out_path, images[0]["mime_type"])
    return True

logo_prompt = (
    "Minimalist app-icon style illustration. A cinematic swirling black hole with a bright warm accretion "
    "disk (soft sage green #788B76 highlights over deep charcoal). In the very center of the black hole, "
    "the letters 'TS' are set as a clean, bold, modern sans-serif monogram in solid warm cream white "
    "(#F9F8F6), glowing softly against the darkness — perfectly centered, legible, no serifs, no decoration. "
    "Small line-art travel icons — an airplane, a car, a train, a hotel building, a map pin, a ticket — are "
    "spiralling into the black hole along elegant curved paths around the TS monogram. Cream / warm off-white "
    "background (#F9F8F6). Rounded square framing, centered, soft shadows. Clean, modern, iOS-native "
    "aesthetic. Only the letters TS appear in the image, no other text or watermark."
)

cover_prompt = (
    "Wide landscape hero graphic. A minimalist stylised globe or map horizon at sunrise in warm sage green and "
    "cream tones (#F9F8F6, #788B76, #E6EBE5). Above the horizon, delicate line-art travel icons (airplane, hotel, "
    "map pin, camera, suitcase, train) float and connect with dashed route lines. The bottom-left corner has a "
    "small subtle 'Travel Space' wordmark in a modern sans-serif. Soft cinematic lighting, plenty of negative "
    "space top-right for a title overlay. Editorial, calm, iOS-native aesthetic. 16:9."
)

async def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which in ("logo", "both"):
        await gen(logo_prompt, "/app/frontend/assets/images/travel-space-logo.png")
    if which in ("cover", "both"):
        await gen(cover_prompt, "/app/frontend/assets/images/travel-space-cover.png")

asyncio.run(main())
