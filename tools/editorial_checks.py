"""Transparent editorial helpers. New baseline utilities, not the unavailable original package.
No network calls, dependencies, engagement predictions or AI-authorship verdicts.
Run: python3 tools/editorial_checks.py caption < request.json
"""
import json
import re
import sys

def analyze(command, text):
    words = re.findall(r"\b[\w'-]+\b", text, re.UNICODE)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if command == "hook":
        first = lines[0] if lines else ""
        checks = {
            "short_opening": 0 < len(first.split()) <= 12,
            "specific_detail": bool(re.search(r"\d", first)),
            "question_or_action": bool(re.search(r"\?|\b(try|stop|save|learn|avoid|discover)\b", first, re.I)),
        }
        return {"opening": first, "checks": checks, "rubric_score": sum(checks.values()), "rubric_max": 3,
                "note": "An editorial checklist; not a prediction of views or engagement."}
    if command == "beats":
        return {"estimated_spoken_seconds": round(len(words) / 2.5, 1),
                "lines": [{"text": line, "estimated_seconds": round(len(line.split()) / 2.5, 1)} for line in lines],
                "note": "Assumes 150 spoken words per minute. Record a read-through to verify timing."}
    if command == "caption":
        return {"characters": len(text), "words": len(words),
                "hashtags": re.findall(r"#[\w]+", text),
                "over_2200_characters": len(text) > 2200}
    phrases = {"delve into": "explore", "leverage": "use", "in today's fast-paced world": "today",
               "it's worth noting that": "", "unlock the potential of": "make the most of"}
    if command == "humanizer":
        edited = text
        for phrase, replacement in phrases.items():
            edited = re.sub(re.escape(phrase), replacement, edited, flags=re.I)
        return {"text": re.sub(r" {2,}", " ", edited).strip(),
                "note": "Simple phrase substitutions only. Review meaning and tone."}
    if command == "detection":
        return {"phrasing_flags": [p for p in phrases if p in text.lower()],
                "note": "Flags generic wording. This cannot determine whether AI wrote a text."}
    if command == "swipe":
        slides = re.split(r"\n\s*\n", text.strip()) if text.strip() else []
        return {"slides": [{"position": i + 1, "words": len(s.split()),
                            "review": "Consider shortening" if len(s.split()) > 40 else "Within the 40-word editorial target"}
                           for i, s in enumerate(slides)],
                "note": "Reviews copy density in the supplied order. It does not predict swipe behaviour."}
    raise ValueError("Unknown editorial check")

if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
        text = data.get("text", "")
        if not isinstance(text, str) or len(text) > 30000:
            raise ValueError("Text must be at most 30000 characters")
        print(json.dumps(analyze(sys.argv[1], text), ensure_ascii=False))
    except (ValueError, IndexError) as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
