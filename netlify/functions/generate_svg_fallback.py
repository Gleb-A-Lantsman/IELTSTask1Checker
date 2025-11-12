"""
IELTS Map Visualizer — Emoji-based SVG generator
Uses full emoji list from map_dictionary.py.
"""

import json, re
from map_dictionary import MAP_OBJECTS

def handler(event, context):
    try:
        body = json.loads(event["body"])
        text = body.get("content", "").lower()

        # Detect phase words
        has_before = bool(re.search(r"\bbefore\b", text))
        has_after  = bool(re.search(r"\bafter\b|\bdevelop(ed|ment)\b", text))
        mode = "compare" if has_before and has_after else "single"

        # Compass keywords
        compass = ["north", "south", "east", "west", "centre", "center", "middle"]

        # Initialize detected elements
        detected = []

        # 1️⃣ Detect every emoji key in text
        for key, obj in MAP_OBJECTS.items():
            if key in text:
                # detect nearby compass word (within ~6 words)
                pattern = rf"(\b(?:{'|'.join(compass)})\b[^.]{0,50}\b{key}\b|\b{key}\b[^.]{0,50}\b(?:{'|'.join(compass)})\b)"
                m = re.search(pattern, text)
                zone = "center"
                if m:
                    s = m.group().lower()
                    for c in compass:
                        if c in s:
                            if c in ["centre", "center", "middle"]:
                                zone = "center"
                            else:
                                zone = c
                            break
                detected.append({
                    "type": key,
                    "emoji": obj.emoji,
                    "zone": zone
                })

        # 2️⃣ Group by zone
        zones = {z: [] for z in ["north", "south", "east", "west", "center"]}
        for item in detected:
            zones[item["zone"]].append(item)

        # 3️⃣ Coordinates for both panels
        coords = {
            "north": (250, 80),
            "south": (250, 330),
            "west":  (100, 200),
            "east":  (400, 200),
            "center":(250, 200)
        }

        # 4️⃣ Render one map panel
        def make_panel(title, x_offset, subset):
            svg_elems = [
                f'<rect x="{x_offset}" y="0" width="500" height="400" '
                f'fill="#c6f5c6"/>',
                f'<text x="{x_offset+250}" y="40" font-size="22" '
                f'text-anchor="middle" font-weight="bold">{title}</text>'
            ]
            for z, (cx, cy) in coords.items():
                items = [i for i in subset if i["zone"] == z]
                if not items:
                    continue
                text_block = " ".join(i["emoji"] for i in items)
                label = ", ".join(i["type"].capitalize() for i in items)
                svg_elems.append(
                    f'<text x="{x_offset+cx}" y="{cy}" font-size="28" '
                    f'text-anchor="middle">{text_block}</text>'
                )
                svg_elems.append(
                    f'<text x="{x_offset+cx}" y="{cy+30}" font-size="12" '
                    f'text-anchor="middle" fill="#333">{label}</text>'
                )
            return "\n".join(svg_elems)

        # 5️⃣ Decide panel layout
        if mode == "compare":
            # crude split based on 'before'/'after' paragraphs
            parts = re.split(r"\bafter\b", text, maxsplit=1)
            before_text = parts[0]
            after_text = parts[1] if len(parts) > 1 else ""
            before_objs = [i for i in detected if i["type"] in before_text]
            after_objs = [i for i in detected if i["type"] in after_text]
        else:
            # single description treated as 'after'
            before_objs, after_objs = [], detected

        # 6️⃣ Combine SVG
        svg_parts = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="400" '
            'style="font-family: Segoe UI Emoji, sans-serif;">',
            make_panel("Before Development", 0, before_objs),
            make_panel("After Development", 500, after_objs),
            "</svg>"
        ]
        svg = "\n".join(svg_parts)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "image/svg+xml"},
            "body": svg
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)})
        }
