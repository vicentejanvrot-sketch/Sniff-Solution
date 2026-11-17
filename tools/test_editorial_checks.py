import unittest
from editorial_checks import analyze

class EditorialTests(unittest.TestCase):
    def test_spoken_timing(self):
        self.assertEqual(analyze("beats", "one two three four five")["estimated_spoken_seconds"], 2.0)

    def test_humanizer_keeps_facts(self):
        self.assertEqual(analyze("humanizer", "Leverage 3 trips for $25.")["text"], "use 3 trips for $25.")

    def test_detection_is_not_authorship(self):
        result = analyze("detection", "We leverage useful tools.")
        self.assertEqual(result["phrasing_flags"], ["leverage"])
        self.assertIn("cannot determine", result["note"])

    def test_caption_threshold(self):
        self.assertFalse(analyze("caption", "a" * 2200)["over_2200_characters"])
        self.assertTrue(analyze("caption", "a" * 2201)["over_2200_characters"])

    def test_hook_rubric(self):
        self.assertEqual(analyze("hook", "Try these 3 ideas?")["rubric_score"], 3)

    def test_swipe_keeps_order(self):
        result = analyze("swipe", "First slide\n\n" + "word " * 41)
        self.assertEqual(result["slides"][1]["review"], "Consider shortening")

if __name__ == "__main__":
    unittest.main()
