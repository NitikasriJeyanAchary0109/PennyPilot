/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        /* =========================================================================
           PENNY PILOT DESIGN SYSTEM TOKENS (LIGHT MODE)
           Visual Direction: Warm Cream & Deep Forest Green (docs/ux/reference/pennypilot_ui.png)
           Contrast Compliance: WCAG 2.1 AA (documented in docs/evidence/ui/step2/contrast.txt)
           ========================================================================= */

        // 1. Foundation: Cream Canvas & White Surface
        cream: "#fbf7ee",            // Sampled warm cream background
        background: "#fbf7ee",       // Screen background alias
        surface: "#ffffff",          // Card / Modal / Container surface
        "surface-cream": "#f8f4e9",  // Subtle parchment container tint
        card: "#ffffff",             // Backward-compatible card alias

        // 2. Primary Brand: Forest Green
        primary: "#144a32",          // Primary button / main brand forest green
        "primary-pressed": "#0c3322",// Darkened button hover / pressed state
        "primary-focus": "#195b3e",  // Focused outline / active state
        "primary-tint": "#e7f0ec",   // Very soft green tint for badges / subtle highlights
        "primary-foreground": "#ffffff", // High-contrast text on primary green (>10.2:1)

        // 3. Accent: Sage Green & Gold Motif
        sage: "#7f9e76",             // Plant / leaf accent
        "sage-light": "#f0f4ea",     // Soft sage container background
        "sage-dark": "#4a6344",      // Darkened accessible sage for text / icons (>4.5:1)
        
        // GOLD TOKENS:
        // 'gold' (#d5ad64): Decorative fills only (coins, sparkles, illustrations). Contrast not required for decorative fills.
        gold: "#d5ad64",
        // 'gold-ui' (#a88544): Icons & large elements (3.22:1 on cream, PASS >= 3.0:1)
        "gold-ui": "#a88544",
        // 'gold-text' (#856529): Text & links on cream (5.05:1 on cream, PASS >= 4.5:1)
        "gold-text": "#856529",
        // 'gold-strong': Object mapping matching above tokens for nested access
        "gold-strong": {
          DEFAULT: "#856529",        // gold-text: text/links (5.05:1 on cream)
          text: "#856529",           // gold-text: text/links (5.05:1 on cream)
          ui: "#a88544",             // gold-ui: icons/large elements (3.22:1 on cream)
        },
        "gold-light": "#fbf2de",     // Soft gold container tint

        // 4. Feature Nudge: Warm Peach
        nudge: {
          peach: "#fdebd8",          // Nudge banner background
          border: "#f7ceb2",         // Nudge banner border
          text: "#191b1c",           // Accessible dark text on peach (>14.8:1)
          accent: "#b45309",         // Warm amber / terracotta icon & arrow
        },

        // 5. Category Chip Tints (Pastel backgrounds with accessible dark text)
        chip: {
          food: "#fce5dd",
          "food-text": "#9a3412",    // WCAG AA (>4.8:1 on #fce5dd)
          edu: "#e1ecf7",
          "edu-text": "#1e40af",     // WCAG AA (>5.1:1 on #e1ecf7)
          transport: "#ede8f5",
          "transport-text": "#581c87",// WCAG AA (>5.5:1 on #ede8f5)
          more: "#f4efe4",
          "more-text": "#44403c",    // WCAG AA (>6.2:1 on #f4efe4)
          general: "#f0f4ea",
          "general-text": "#166534", // WCAG AA (>4.9:1 on #f0f4ea)
        },

        // 6. Semantic Feedback States (WCAG AA Compliant)
        success: "#166534",          // Verified financial / savings positive state (>5.5:1)
        "success-light": "#eaf5ee",  // Light green background
        warning: "#b45309",          // Alert / warning amber (>4.8:1)
        "warning-light": "#fef3c7",  // Light amber background
        danger: "#b91c1c",           // Critical error / debt state (>5.2:1)
        "danger-light": "#fee2e2",   // Light red background
        badge: "#dc2626",            // Notification bell badge red

        // 7. Typography Colors (All darkened & verified for WCAG AA >= 4.5:1)
        text: {
          DEFAULT: "#0d3a2b",        // Deep forest-charcoal primary body text (>11.8:1 on cream)
          primary: "#0d3a2b",        // Primary headline & figure text
          secondary: "#525956",      // Darkened slate-olive secondary text (6.72:1 on cream, 7.19:1 on white)
          placeholder: "#707773",    // Accessible placeholder on white inputs (4.59:1 on white; restricted to white backgrounds)
          "placeholder-cream": "#6d7370", // Darkened placeholder for cream inputs (4.53:1 on cream, 4.84:1 on white)
          inverse: "#ffffff",        // Pure white for dark surfaces
        },
        textMuted: "#666e69",        // Backward-compatible alias for textMuted

        // 8. Borders & Outlines
        border: {
          DEFAULT: "#e5e3db",        // Soft warm card border
          light: "#f0ede6",          // Ultra-subtle divider
          dark: "#c8c5bc",           // Emphasized border
          focus: "#144a32",          // Active focus border
        },
        outline: "#e5e3db",          // Backward-compatible alias
        "outline-variant": "#f0ede6",// Backward-compatible alias

        // 9. Legacy Theme Aliases (remapped to prevent crashes on non-migrated screens)
        "ob-primary": "#144a32",
        "ob-secondary": "#525956",
        "ob-background": "#fbf7ee",
        "ob-error": "#b91c1c",
        "on-surface": "#0d3a2b",
        "on-surface-variant": "#525956",
        "primary-fixed": "#e7f0ec",
        "primary-fixed-dim": "#c3dcce",
        "on-primary": "#ffffff",
        "on-primary-fixed": "#0c3322",
        "on-primary-fixed-variant": "#144a32",
        "tertiary": "#144a32",
        "tertiary-fixed": "#f0f4ea",
        "tertiary-fixed-dim": "#d9e6d0",
        "on-tertiary-fixed-variant": "#166534",

        /* =========================================================================
           DOCUMENTED DARK VARIANT SPECIFICATION (Reserved for future activation)
           =========================================================================
           When userInterfaceStyle is toggled to dark, the tokens map to:
             background:           #0a1a14 (Deep nocturnal forest evergreen)
             surface:              #12281e (Dark eucalyptus container)
             surface-cream:        #173327 (Elevated surface container)
             primary:              #34d399 (Vibrant mint-emerald primary button)
             primary-pressed:      #059669 (Deeper emerald hover)
             primary-foreground:   #062015 (Deep green text on mint)
             text-primary:         #f2f9f5 (Soft moonlight white)
             text-secondary:       #a3b8ad (Silvery sage secondary text)
             text-muted:           #6e8579 (Muted eucalyptus caption)
             text-placeholder:     #576d62 (Accessible placeholder)
             border:               #1d4032 (Subtle evergreen card border)
             nudge-peach:          #2c1e18 (Deep roasted peach container)
             nudge-text:           #ffedd5 (Warm light cream text)
           ========================================================================= */
      },

      fontSize: {
        "2xs": ["10px", { lineHeight: "13px" }],
        xs: ["11px", { lineHeight: "15px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["15px", { lineHeight: "22px" }],
        lg: ["17px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "26px" }],
        "2xl": ["24px", { lineHeight: "30px" }],
        "3xl": ["28px", { lineHeight: "34px" }],
        "4xl": ["34px", { lineHeight: "40px" }],
      },

      fontFamily: {
        sans: ["Inter_400Regular", "Inter", "system-ui", "sans-serif"],
        inter: ["Inter_400Regular", "sans-serif"],
        "inter-medium": ["Inter_500Medium", "sans-serif"],
        "inter-semibold": ["Inter_600SemiBold", "sans-serif"],
        "inter-bold": ["Inter_700Bold", "sans-serif"],
        "inter-extrabold": ["Inter_800ExtraBold", "sans-serif"],
        // Compatibility aliases mapping to Inter
        jakarta: ["Inter_400Regular", "sans-serif"],
        "jakarta-medium": ["Inter_500Medium", "sans-serif"],
        "jakarta-semibold": ["Inter_600SemiBold", "sans-serif"],
        "jakarta-bold": ["Inter_700Bold", "sans-serif"],
        worksans: ["Inter_400Regular", "sans-serif"],
        "worksans-medium": ["Inter_500Medium", "sans-serif"],
        "worksans-semibold": ["Inter_600SemiBold", "sans-serif"],
      },

      spacing: {
        "4.5": "18px",
        "stack-xs": "4px",
        "stack-sm": "8px",
        "stack-md": "16px",
        "stack-lg": "24px",
        "stack-xl": "32px",
        "margin-mobile": "20px",
        gutter: "16px",
      },

      borderRadius: {
        card: "22px",
        "card-sm": "16px",
        input: "14px",
        chip: "10px",
        pill: "9999px",
      },

      boxShadow: {
        card: "0 2px 10px rgba(13, 58, 43, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)",
        "card-elevated": "0 8px 24px rgba(13, 58, 43, 0.07), 0 2px 6px rgba(0, 0, 0, 0.03)",
        button: "0 4px 12px rgba(20, 74, 50, 0.20)",
        nudge: "0 2px 8px rgba(180, 83, 9, 0.06)",
      },
    },
  },
  plugins: [],
};
