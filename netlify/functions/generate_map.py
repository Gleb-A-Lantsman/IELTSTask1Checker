import json, re, os
from openai import OpenAI
from map_dictionary import MAP_OBJECTS
from generate_svg_fallback import generate_svg  # your previous SVG function

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def handler(event, context):
    try:
        body = json.loads(event["body"])
        text = body.get("content", "")
        lower_text = text.lower()

        # detect mentioned items
        found_items = []
        for key, obj in MAP_OBJECTS.items():
            if key in lower_text:
                found_items.append(f"{key} ({obj.emoji}, color {obj.color})")

        if not found_items:
            found_items.append("trees, buildings, paths, and sea")

        # construct a precise, restrained prompt
        prompt = f"""
Create a clean, formal IELTS Writing Task 1 style educational diagram.
Show two side-by-side maps labelled 'BEFORE' and 'AFTER'.
Include these elements if relevant: {', '.join(found_items)}.
Use their associated colours and emojis as inspiration.
Use only a few basic colours (red, green, blue, grey) for everything else.
Keep the style simple, schematic, and non-creative — focus on clarity.
"""

        # try generating an image
try:
    img = client.images.generate(
        model="gpt-image-1",
        prompt=prompt.strip(),
        size="1024x512",
        response_format="b64_json"
    )
    base64_image = img.data[0].b64_json
except Exception as e:
    print("⚠️ OpenAI image generation error:", e)
    raise
            base64_image = img.data[0].b64_json
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({
                    "generatedImageBase64": f"data:image/png;base64,{base64_image}",
                    "usedPipeline": "image.generate",
                    "prompt": prompt
                })
            }
except Exception as e:
    print("⚠️ image.generate failed:", e)
    fallback_reason = str(e)
    svg = generate_svg(text)
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "generatedSvg": svg,
            "usedPipeline": "svg-fallback",
            "error": fallback_reason
        })
    }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)})
        }
