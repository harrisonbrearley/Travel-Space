import asyncio, base64, os
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")

PROMPTS = [
  ("hero", "Editorial marketing hero image for a travel iOS/Android app called 'Travel Space'. A modern minimalist scene: a person's hand holding an iPhone on a wooden table beside a leather passport, a small cactus, and a cup of matcha; the phone screen displays a beautifully designed travel itinerary app with sage green accents (#788B76), a hero trip card labelled 'Tokyo & Kyoto' and a day-by-day timeline. Warm morning light, shallow depth of field, cream / off-white background (#F9F8F6). Space at the top-left for a headline. Photorealistic, iOS App Store hero aesthetic. No brand watermarks. 16:9."),
  ("multiscreen", "Marketing composite showing THREE floating iPhone 15 mockups in staggered arrangement over a soft cream background (#F9F8F6). Each phone shows a different screen of a travel app: (1) a list of trip cards labelled 'Upcoming', (2) a day-by-day itinerary with sage green timeline dots and cards like 'Qantas QF25' and 'Park Hyatt Tokyo', (3) a map view with numbered pins connected by a dashed green route line. Subtle drop shadows, gentle geometric shapes, sage green (#788B76) and warm neutral palette. Studio product photography, App Store feature-graphic aesthetic. No text overlays. 3:2 landscape."),
  ("autoimport", "Marketing composite. On the left: a person's hands holding a physical hotel booking confirmation printout. On the right: an iPhone with the same booking's details already filled into a beautiful travel app screen (accommodation name, check-in / check-out dates, cost in JPY). A thin sage-green arrow/particle stream flows from the paper into the phone symbolising instant AI extraction. Warm neutral background, editorial photography, iOS-native app aesthetic. Sage green (#788B76). No brand names. 16:9."),
  ("share", "Marketing image of two smiling friends leaning close together looking at one iPhone. The phone screen shows a shared travel itinerary titled 'Tokyo & Kyoto' with a day-by-day plan and small numbered map pins. Warm outdoor cafe setting, golden hour light, muted sage green and cream color palette, natural lifestyle photography, iOS-native app aesthetic. 4:5 portrait for app store."),
]

async def gen(name, prompt):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(api_key=api_key, session_id=f"promo-{name}", system_message="You are an assistant that generates marketing images.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image","text"])
    _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print(f"NO_IMAGE {name}"); return
    out = f"/app/frontend/assets/marketing/{name}.png"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f: f.write(base64.b64decode(images[0]["data"]))
    print("SAVED", out)

async def main():
    for name, prompt in PROMPTS:
        try:
            await gen(name, prompt)
        except Exception as e:
            print("FAIL", name, e)

asyncio.run(main())
