import numpy as np
from PIL import Image

img = Image.open('docs/ux/reference/pennypilot_ui.png')
arr = np.array(img)

def sample_patch(name, x, y, size=7):
    patch = arr[y-size//2:y+size//2+1, x-size//2:x+size//2+1, :3]
    med = np.median(patch, axis=(0,1)).astype(int)
    hex_val = f"#{med[0]:02x}{med[1]:02x}{med[2]:02x}"
    print(f"{name:40s} | Coord: ({x:4d}, {y:4d}) | Hex: {hex_val} | RGB: ({med[0]}, {med[1]}, {med[2]})")
    return hex_val, med

print("=================== EXACT TOKEN SAMPLING ===================")

# 1. Background Cream
sample_patch("Background Cream (Home Screen Top)", 1050, 130)
sample_patch("Background Cream (Login Screen Top)", 350, 100)
sample_patch("Background Cream (Left Mid-Canvas)", 290, 220)

# 2. Surface White
sample_patch("Surface White (Login Form Card)", 350, 520)
sample_patch("Surface White (Home Swipe Card)", 1050, 480)
sample_patch("Surface White (Home Tx List Card)", 1050, 750)

# 3. Primary Forest Green
sample_patch("Primary Forest Green (Sign In Button)", 350, 725)
sample_patch("Primary Forest Green (Home Swipe CTA)", 1050, 625)
sample_patch("Primary Forest Green (Penny Pilot Logo)", 360, 200)

# 4. Sage Green
sample_patch("Sage Green (Progress Bar Fill)", 930, 310)
sample_patch("Sage Green (Plant Sprout Leaf)", 595, 315)
sample_patch("Sage Green (Card Light Tint / Stats)", 1050, 280)
sample_patch("Sage Green (Bottom Wave Accent)", 300, 930)

# 5. Gold / Honey Accent
sample_patch("Gold (Coins in Savings Jar)", 575, 435)
sample_patch("Gold (Sparkle / Star Motif)", 520, 345)
sample_patch("Gold (Logo Chart Accent)", 500, 155)

# 6. Nudge Peach
sample_patch("Nudge Peach (Thinking of buying banner)", 1050, 385)
sample_patch("Nudge Peach Border / Accent", 850, 385)

# 7. Category Chip Tints
sample_patch("Chip Food (Pastel Salmon/Peach)", 895, 565)
sample_patch("Chip Education (Pastel Soft Blue)", 985, 565)
sample_patch("Chip Transport (Pastel Lavender)", 1105, 565)
sample_patch("Chip More (Pastel Neutral/Gray)", 1195, 565)

# 8. Text Colors
sample_patch("Text Primary (Headline / Numbers)", 310, 305)
sample_patch("Text Primary (Home Balance)", 960, 275)
sample_patch("Text Secondary (Subtitle / Labels)", 1050, 170)
sample_patch("Text Muted (From 47 round-ups)", 950, 305)
sample_patch("Text Placeholder (Input Field)", 350, 555)

# 9. Border / Stroke
sample_patch("Border Card (Home Swipe Card)", 835, 500)
sample_patch("Border Input (Login Email Input)", 300, 560)

# 10. Notification / Danger / Warning
sample_patch("Notification Badge (Home Bell Alert)", 1255, 95)
