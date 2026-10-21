import math
import sys

def srgb_to_luminance(r, g, b):
    def channel_lum(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * channel_lum(r) + 0.7152 * channel_lum(g) + 0.0722 * channel_lum(b)

def hex_to_rgb(hex_code):
    hex_code = hex_code.lstrip("#")
    return tuple(int(hex_code[i:i+2], 16) for i in (0, 2, 4))

def contrast_ratio(hex1, hex2):
    lum1 = srgb_to_luminance(*hex_to_rgb(hex1))
    lum2 = srgb_to_luminance(*hex_to_rgb(hex2))
    l_max, l_min = max(lum1, lum2), min(lum1, lum2)
    return (l_max + 0.05) / (l_min + 0.05)

def darken_until(start_hex, target_bg, target_ratio=4.5):
    r, g, b = hex_to_rgb(start_hex)
    best_hex = start_hex
    for factor in [x / 1000.0 for x in range(1000, 0, -5)]:
        nr, ng, nb = int(r * factor), int(g * factor), int(b * factor)
        h = f"#{nr:02x}{ng:02x}{nb:02x}"
        ratio = contrast_ratio(h, target_bg)
        if ratio >= target_ratio:
            return h, ratio
    return best_hex, contrast_ratio(best_hex, target_bg)

bg_cream = "#fbf7ee"
bg_white = "#ffffff"

lines = []
lines.append("================================================================================")
lines.append("PENNY PILOT STEP 2: WCAG 2.1 AA COLOR CONTRAST AUDIT & DARKENING REPORT")
lines.append("Source Reference: docs/ux/reference/pennypilot_ui.png")
lines.append("Worktree: .worktrees/ui-production")
lines.append("================================================================================\n")

lines.append("PART 1: RAW SAMPLED TOKENS CONTRAST EVALUATION")
lines.append("--------------------------------------------------------------------------------")
lines.append(f"{'Color Pair / Use Case':<48} | {'FG Hex':<9} | {'BG Hex':<9} | {'Req':<5} | {'Ratio':<7} | {'Verdict'}")
lines.append("-" * 92)

raw_tests = [
    ("Body text primary on cream", "#0d3a2b", bg_cream, 4.5, "normal"),
    ("Body text primary on white", "#0d3a2b", bg_white, 4.5, "normal"),
    ("Transaction title text on white", "#0b0e17", bg_white, 4.5, "normal"),
    ("Secondary text on cream", "#73767a", bg_cream, 4.5, "normal"),
    ("Secondary text on white", "#73767a", bg_white, 4.5, "normal"),
    ("Muted text on cream", "#80888c", bg_cream, 4.5, "normal"),
    ("Muted text on white", "#80888c", bg_white, 4.5, "normal"),
    ("Placeholder text on white", "#a0a5b1", bg_white, 4.5, "normal"),
    ("Placeholder text on cream", "#a0a5b1", bg_cream, 4.5, "normal"),
    ("White text on primary forest green", "#ffffff", "#144a32", 4.5, "normal"),
    ("Gold coins/accent on cream (large text)", "#d5ad64", bg_cream, 3.0, "large"),
    ("Gold coins/accent on white (large text)", "#d5ad64", bg_white, 3.0, "large"),
    ("Gold coins/accent on cream (body text)", "#d5ad64", bg_cream, 4.5, "normal"),
    ("Caption text on white", "#73767a", bg_white, 4.5, "normal"),
    ("Caption text on cream", "#73767a", bg_cream, 4.5, "normal"),
    ("Nudge banner text on nudge peach", "#191b1c", "#fdebd8", 4.5, "normal"),
]

for name, fg, bg, req, text_type in raw_tests:
    ratio = contrast_ratio(fg, bg)
    verdict = "PASS" if ratio >= req else f"FAIL (<{req}:1)"
    lines.append(f"{name:<48} | {fg:<9} | {bg:<9} | {req:.1f}:1 | {ratio:5.2f}:1 | {verdict}")

lines.append("\n" + "=" * 80)
lines.append("PART 2: TOKENS REQUIRING DARKENING & ADJUSTED VALUES")
lines.append("--------------------------------------------------------------------------------")
lines.append("Rule: Darken any token under 4.5:1 (3:1 for large text / graphical accents).\n")

# Darkened tokens
darkened_secondary = "#525956"    # Rich slate-forest gray, passes on both cream and white with >6.5:1
darkened_muted = "#666e69"        # Soft muted forest gray, passes on both with >4.7:1
darkened_placeholder_white = "#707773"  # Passes on white input backgrounds (4.59:1)
darkened_placeholder_cream = "#6d7370"  # Darkened to pass on cream (4.53:1) and white (4.84:1)
darkened_gold_large = "#a88544"   # Darkened warm gold for large text / indicators (>=3.0:1)
darkened_gold_body = "#856529"    # Deep bronze-gold for normal text / links (>=4.5:1)
darkened_caption = "#525956"      # Unified with secondary

adjusted_tests = [
    ("Adjusted Secondary text on cream", darkened_secondary, bg_cream, 4.5, "normal", "#73767a", darkened_secondary),
    ("Adjusted Secondary text on white", darkened_secondary, bg_white, 4.5, "normal", "#73767a", darkened_secondary),
    ("Adjusted Muted text on cream", darkened_muted, bg_cream, 4.5, "normal", "#80888c", darkened_muted),
    ("Adjusted Muted text on white", darkened_muted, bg_white, 4.5, "normal", "#80888c", darkened_muted),
    ("Adjusted Placeholder #707773 on white", "#707773", bg_white, 4.5, "normal", "#a0a5b1", "#707773"),
    ("Adjusted Placeholder #707773 on cream", "#707773", bg_cream, 4.5, "normal", "#a0a5b1", "#707773"),
    ("Darkened Placeholder #6d7370 on cream", "#6d7370", bg_cream, 4.5, "normal", "#a0a5b1", "#6d7370"),
    ("Darkened Placeholder #6d7370 on white", "#6d7370", bg_white, 4.5, "normal", "#a0a5b1", "#6d7370"),
    ("Adjusted Caption text on cream", darkened_caption, bg_cream, 4.5, "normal", "#73767a", darkened_caption),
    ("Adjusted Caption text on white", darkened_caption, bg_white, 4.5, "normal", "#73767a", darkened_caption),
    ("Adjusted Gold on cream (large/UI)", darkened_gold_large, bg_cream, 3.0, "large", "#d5ad64", darkened_gold_large),
    ("Adjusted Gold on cream (body text)", darkened_gold_body, bg_cream, 4.5, "normal", "#d5ad64", darkened_gold_body),
]

lines.append(f"{'Use Case':<40} | {'Original':<9} | {'Darkened':<9} | {'On BG':<9} | {'Req':<5} | {'Ratio':<7} | {'Status'}")
lines.append("-" * 96)

for name, fg, bg, req, text_type, orig, dark in adjusted_tests:
    ratio = contrast_ratio(fg, bg)
    status = "PASS" if ratio >= req else "FAIL"
    lines.append(f"{name:<40} | {orig:<9} | {dark:<9} | {bg:<9} | {req:.1f}:1 | {ratio:5.2f}:1 | {status}")

lines.append("\n" + "=" * 80)
lines.append("PART 3: SUMMARY OF COLOR TOKEN MODIFICATIONS")
lines.append("--------------------------------------------------------------------------------")
lines.append(f"1. Secondary Text: Darkened from #73767a -> {darkened_secondary}")
lines.append(f"   - Reason: Raw sampled #73767a had {contrast_ratio('#73767a', bg_cream):.2f}:1 on cream (fails 4.5:1).")
lines.append(f"   - Result: {darkened_secondary} achieves {contrast_ratio(darkened_secondary, bg_cream):.2f}:1 on cream and {contrast_ratio(darkened_secondary, bg_white):.2f}:1 on white (robust PASS).")
lines.append("")
lines.append(f"2. Muted Text: Darkened from #80888c -> {darkened_muted}")
lines.append(f"   - Reason: Raw sampled #80888c had {contrast_ratio('#80888c', bg_cream):.2f}:1 on cream and {contrast_ratio('#80888c', bg_white):.2f}:1 on white (fails 4.5:1).")
lines.append(f"   - Result: {darkened_muted} achieves {contrast_ratio(darkened_muted, bg_cream):.2f}:1 on cream and {contrast_ratio(darkened_muted, bg_white):.2f}:1 on white (PASS).")
lines.append("")
lines.append(f"3. Placeholder Text: Contrast evaluation on white vs cream:")
lines.append(f"   - Raw sampled #a0a5b1 had {contrast_ratio('#a0a5b1', bg_white):.2f}:1 on white and {contrast_ratio('#a0a5b1', bg_cream):.2f}:1 on cream (fails 4.5:1).")
lines.append(f"   - Token #707773 achieves {contrast_ratio('#707773', bg_white):.2f}:1 on white inputs (PASS), but {contrast_ratio('#707773', bg_cream):.2f}:1 on cream (FAILS 4.5:1).")
lines.append(f"   - Background policy: In the reference design, inputs sit inside white cards (#ffffff) where #707773 passes WCAG AA.")
lines.append(f"   - Universal token #6d7370 achieves {contrast_ratio('#6d7370', bg_cream):.2f}:1 on cream and {contrast_ratio('#6d7370', bg_white):.2f}:1 on white (PASS on all surfaces).")
lines.append("")
lines.append(f"4. Gold Accent / Text: Configured as distinct tokens per usage requirements:")
lines.append(f"   - gold = #d5ad64: decorative fills only (coins, sparkles, illustration) where contrast is not required.")
lines.append(f"   - gold-ui = {darkened_gold_large}: icons/large elements ({contrast_ratio(darkened_gold_large, bg_cream):.2f}:1 on cream, PASS >= 3.0:1).")
lines.append(f"   - gold-text = {darkened_gold_body}: text/links ({contrast_ratio(darkened_gold_body, bg_cream):.2f}:1 on cream, PASS >= 4.5:1).")
lines.append("")
lines.append(f"5. Caption Text: Darkened from #73767a -> {darkened_caption}")
lines.append(f"   - Reason: Raw #73767a had {contrast_ratio('#73767a', bg_cream):.2f}:1 on cream.")
lines.append(f"   - Result: Reuses {darkened_caption} for {contrast_ratio(darkened_caption, bg_cream):.2f}:1 on cream and {contrast_ratio(darkened_caption, bg_white):.2f}:1 on white.")
lines.append("================================================================================\n")

output_str = "\n".join(lines)
with open("docs/evidence/ui/step2/contrast.txt", "w") as f:
    f.write(output_str)

sys.stdout.write(output_str)
