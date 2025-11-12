"""
Netlify Function: generate_map
Accepts JSON or text describing IELTS map changes.
Uses the object dictionary to render a schematic SVG.
"""

import json
from map_dictionary import MAP_OBJECTS, get_icon

def render_element(el, x, y):
    """Draws a simple SVG element."""
    icon = get_icon(el.get("type", ""))
    label = el.get("type", "").capitalize()
    return f'<text x="{x}" y="{y}" font-size="22">{icon} {label}</text>'

def generate_svg(data):
    """Generates the full SVG map (before/after panels)."""
    w, h = 1000, 500
    svg = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">']
    svg.append('<rect width="100%" height="100%" fill="#eef5f3"/>')
    svg.append('<text x="250" y="40" font-size="26" font-weight="bold">Before</text>')
    svg.append('<text x="750" y="40" font-size="26" font-weight="bold">After</text>')

    elements = data.get("elements", [])
    spacing = 60
    for i, el in enumerate(elements):
        # Left (before)
        svg.append(render_element(el, 150, 100 + i * spacing))
        # Right (after)
        svg.append(render_element(el, 650, 100 + i * spacing))

    svg.append("</svg>")
    return "\n".join(svg)

def handler(event, context):
    try:
        if event.get("body"):
            body = json.loads(event["body"])
        else:
            body = {}

        # expected: either full json or minimal {elements: [...]}
        elements = body.get("elements")
        if not elements and "content" in body:
            # Minimal fallback if just text is provided
            text = body["content"]
            # trivial keyword extraction
            found = []
            for key in MAP_OBJECTS.keys():
                if key in text.lower():
                    found.append({"type": key})
            elements = found

        data = {"elements": elements}
        svg = generate_svg(data)

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "image/svg+xml",
                "Access-Control-Allow-Origin": "*"
            },
            "body": svg
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }
