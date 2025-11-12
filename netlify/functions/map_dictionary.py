"""
IELTS Map Object Dictionary
Defines all canonical object types and their SVG drawing parameters.
"""

from dataclasses import dataclass
from typing import List, Dict, Tuple

@dataclass
class MapObject:
    type: str
    subtype: str
    emoji: str
    fill: str
    shape: str
    z_index: int

# Canonical dictionary of IELTS map features
MAP_OBJECTS: Dict[str, MapObject] = {
    # Natural
    "river": MapObject("natural", "river", "🌊", "#90caf9", "path", 5),
    "lake": MapObject("natural", "lake", "💧", "#64b5f6", "oval", 5),
    "pond": MapObject("natural", "pond", "💦", "#81d4fa", "oval", 5),
    "woodland": MapObject("natural", "woodland", "🌲", "#81c784", "polygon", 6),
    "park": MapObject("natural", "park", "🌳", "#aed581", "rect", 6),
    "garden": MapObject("natural", "garden", "🌸", "#f48fb1", "circle", 6),
    "farmland": MapObject("natural", "farmland", "🌾", "#dcedc8", "rect", 6),
    "beach": MapObject("natural", "beach", "🏖️", "#f3e5ab", "polygon", 5),

    # Buildings
    "housing": MapObject("building", "housing", "🏠", "#d4b483", "cluster", 20),
    "apartments": MapObject("building", "apartments", "🏢", "#cbbeb5", "rect", 20),
    "hotel": MapObject("building", "hotel", "🏨", "#ffd700", "rect", 21),
    "restaurant": MapObject("building", "restaurant", "🍽️", "#ffcc80", "rect", 21),
    "cafe": MapObject("building", "cafe", "☕", "#e0a96d", "rect", 21),
    "shop": MapObject("building", "shop", "🏬", "#ffe4b5", "rect", 21),
    "supermarket": MapObject("building", "supermarket", "🛒", "#e6b980", "rect", 21),
    "market": MapObject("building", "market", "🛍️", "#f7c59f", "rect", 21),
    "office": MapObject("building", "office", "🏢", "#c2c2c2", "rect", 21),
    "factory": MapObject("building", "factory", "🏭", "#b0b0b0", "rect", 22),
    "warehouse": MapObject("building", "warehouse", "🏚️", "#aaaaaa", "rect", 22),
    "post_office": MapObject("building", "post_office", "📮", "#f2b179", "rect", 21),
    "bank": MapObject("building", "bank", "🏦", "#b0e0e6", "rect", 21),
    "community_centre": MapObject("building", "community_centre", "🏛️", "#cfcfcf", "rect", 21),

    # Institutional
    "school": MapObject("institution", "school", "🏫", "#ffe4b5", "rect", 25),
    "university": MapObject("institution", "university", "🎓", "#f4b183", "rect", 25),
    "hospital": MapObject("institution", "hospital", "🏥", "#f48fb1", "rect", 25),
    "museum": MapObject("institution", "museum", "🖼️", "#c8d9eb", "rect", 25),
    "library": MapObject("institution", "library", "📚", "#c6b7a3", "rect", 25),
    "theatre": MapObject("institution", "theatre", "🎭", "#e8a87c", "rect", 25),
    "cinema": MapObject("institution", "cinema", "🎞️", "#f7cac9", "rect", 25),

    # Transport
    "road": MapObject("transport", "road", "🛣️", "#c0b283", "line", 10),
    "bridge": MapObject("transport", "bridge", "🌉", "#9ea7b8", "line", 12),
    "railway": MapObject("transport", "railway", "🚆", "#777777", "dashed_line", 9),
    "pier": MapObject("transport", "pier", "🛳️", "#999999", "rect", 8),
    "airport": MapObject("transport", "airport", "✈️", "#d3d3d3", "rect", 7),
    "car_park": MapObject("transport", "car_park", "🅿️", "#d9d9d9", "rect", 6),

    # Recreation
    "stadium": MapObject("recreation", "stadium", "⚽", "#8bc34a", "rect", 24),
    "tennis_court": MapObject("recreation", "tennis_court", "🎾", "#aed581", "rect", 24),
    "amphitheatre": MapObject("recreation", "amphitheatre", "🎶", "#f4b183", "arc", 24),
    "play_area": MapObject("recreation", "play_area", "🛝", "#fff176", "rect", 24),
    "fountain": MapObject("recreation", "fountain", "💦", "#81d4fa", "circle", 24),
    "golf_course": MapObject("recreation", "golf_course", "⛳", "#9ccc65", "polygon", 24),

    # Tourism
    "accommodation": MapObject("tourism", "accommodation", "🛖", "#d4b483", "cluster", 20),
    "reception": MapObject("tourism", "reception", "🪪", "#ffd54f", "rect", 21),
    "restaurant_tourism": MapObject("tourism", "restaurant_tourism", "🍴", "#ffcc80", "rect", 21),
}

# Simple helper
def get_icon(label: str) -> str:
    """Fuzzy lookup by label string."""
    label = label.lower()
    for key, obj in MAP_OBJECTS.items():
        if key in label or obj.subtype in label:
            return obj.emoji
    return "❓"
