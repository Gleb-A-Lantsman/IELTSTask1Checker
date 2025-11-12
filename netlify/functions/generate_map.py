import json
from textwrap import dedent

# ⬇️ copy the full SVG generator function we built in chat earlier
from generate_island_svg import generate_island_svg  # optional if you move it to another file


def handler(event, context):
    """Netlify-compatible function that accepts IELTS-style description and returns SVG."""
    try:
        body = json.loads(event["body"])
        description = body.get("content", "").strip()

        if not description:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing description"})
            }

        svg = generate_island_svg(description)

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
