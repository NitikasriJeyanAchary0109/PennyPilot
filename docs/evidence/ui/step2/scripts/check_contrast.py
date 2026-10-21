import math

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

# Raw sampled tokens from pennypilot_ui.png
raw_tokens = {
    "bg_cream": "#fbf7ee",
    "surface_white": "#ffffff",
    "primary_green": "#144a32",
    "primary_pressed": "#0b3121",
    "gold_coins": "#d5ad64",
    "gold_sparkle": "#efc780",
    "sage": "#7f9e76",
    "nudge_peach": "#fdebd8",
    "text_primary_headline": "#0d3a2b",
    "text_primary_tx": "#0b0e17",
    "text_secondary_from": "#80888c",
    "text_secondary_tx": "#73767a",
    "placeholder_input": "#a0a5b1",
    "chip_food_bg": "#fce5dd",
    "chip_edu_bg": "#e1ecf7",
    "chip_transport_bg": "#ede8f5",
    "chip_more_bg": "#f4efe4",
    "badge_danger": "#e47c5b",
}

print("=== RAW SAMPLED CONTRAST RATIOS ===")
checks = [
    ("Body text primary (#0d3a2b) on cream (#fbf7ee)", "#0d3a2b", "#fbf7ee", 4.5),
    ("Body text primary (#0d3a2b) on white (#ffffff)", "#0d3a2b", "#ffffff", 4.5),
    ("Tx title text (#0b0e17) on white (#ffffff)", "#0b0e17", "#ffffff", 4.5),
    ("Secondary text (#73767a) on cream (#fbf7ee)", "#73767a", "#fbf7ee", 4.5),
    ("Secondary text (#73767a) on white (#ffffff)", "#73767a", "#ffffff", 4.5),
    ("Muted text (#80888c) on cream (#fbf7ee)", "#80888c", "#fbf7ee", 4.5),
    ("Muted text (#80888c) on white (#ffffff)", "#80888c", "#ffffff", 4.5),
    ("Placeholder (#a0a5b1) on white (#ffffff)", "#a0a5b1", "#ffffff", 4.5),
    ("White (#ffffff) on primary forest green (#144a32)", "#ffffff", "#144a32", 4.5),
    ("Gold coins (#d5ad64) on cream (#fbf7ee)", "#d5ad64", "#fbf7ee", 3.0),
    ("Gold coins (#d5ad64) on white (#ffffff)", "#d5ad64", "#ffffff", 3.0),
    ("Caption text (#73767a) on white (#ffffff)", "#73767a", "#ffffff", 4.5),
    ("Caption text (#73767a) on cream (#fbf7ee)", "#73767a", "#fbf7ee", 4.5),
]

for label, fg, bg, req in checks:
    ratio = contrast_ratio(fg, bg)
    status = "PASS" if ratio >= req else f"FAIL (Req: {req}:1)"
    print(f"{label:55s} => {ratio:5.2f}:1 [{status}]")
