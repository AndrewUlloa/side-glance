# Linear homepage token audit

> Source: `https://linear.app/homepage`
> Captured: 2026-08-13 (America/New_York)
> Purpose: primary-source evidence for Signal's requested token parity

## Scope

Signal adopts the measurable typography, neutral design-token, control-feedback, and entrance-motion values served by Linear's current homepage. It does not copy Linear's content, logo, product illustrations, proprietary code, or brand identity. Signal's lifecycle colors and four-terminal story remain product-specific.

## First-party assets inspected

- Global CSS: `https://static.linear.app/web/_next/static/css/index.DBhe20pm.css`
- Hero JavaScript: `https://static.linear.app/web/_next/static/chunks/Hero-DtVVJNsn.js`
- Hero CSS: `https://static.linear.app/web/_next/static/css/Hero.D42gc8OB.css`
- Shared motion: `https://static.linear.app/web/_next/static/chunks/motion-BWyn8xNP.js`
- Illustration JavaScript: `https://static.linear.app/web/_next/static/chunks/NewHeroIllustration-B6FjYVzc.js`
- Illustration CSS: `https://static.linear.app/web/_next/static/css/NewHeroIllustration.WjPxlfcr.css`
- Button, Header, and PageSection CSS bundles served by the same page
- Animate-once hook: `https://static.linear.app/web/_next/static/chunks/useAnimateOnce-C3afxKUL.js`

Hashed filenames are a dated snapshot and may change independently of behavior.

## Typography facts

- Marketing family: Inter Variable, normal and italic, weight range 100–900.
- Named weights: light 300, normal 400, medium 510, semibold 590, bold 680.
- Font features: `"cv01", "ss03"`; optical sizing: `"opsz" auto`.
- Hero: 64px/1 at desktop, 56px/1.1 at laptop, 38px/1.1 at mobile; weight 510 and `-.022em` tracking.
- Regular body: 15px/1.6 with `-.011em` tracking; tertiary text is `#8a8f98`.
- Monospace stack starts with Berkeley Mono, then ui-monospace, SF Mono, Menlo, monospace.

Inter is open source and is loaded by Signal through Next's supported font integration. Berkeley Mono is separately licensed. Signal may name it as the first local preference but must not copy Linear's font file or depend on Linear's CDN; visitors without a license receive the system fallback.

## Layout and visual tokens

- Header: 72px desktop, 64px mobile; backdrop blur 20px.
- Homepage outer padding: 46px desktop, 10px at ≤1280px, 28px at ≤1024px, 16px at ≤640px.
- Content width: 1344px plus outer padding; inner inset 32px desktop and 8px at ≤1024px.
- Radius scale: 4, 6, 8, 12, 16, 24, 32px, plus 9999px.
- Backgrounds: `#08090a`, `#0f1011`, `#141516`, `#191a1b`.
- Text: `#f7f8f8`, `#d0d6e0`, `#8a8f98`, `#62666d`.
- Borders: `#23252a`, `#34343a`, `#3e3e44`, `#ffffff0d`, `#ffffff14`.
- Shadows: `0 2px 4px #0000001a`, `0 4px 24px #0003`, `0 7px 32px #00000059`.

## Motion facts

- Hero transition: tween, 1 second, `cubic-bezier(.25, .1, .25, 1)`.
- Hero initial/final: opacity 0→1, blur 10px→0, translateY 20%→0.
- Desktop line delays: .4s/.5s; mobile increments .033s; description .6s.
- Illustration UI/background: 1.3s delay, 1.5s duration, `cubic-bezier(.455, .03, .515, .955)`.
- Shine: .4s delay, .5s duration, same easing.
- Controls: .16s `cubic-bezier(.25, .46, .45, .94)` and pressed scale .97.
- Global speeds: .1s quick and .25s regular.
- Fresh-visit guard skips reduced-motion, hash navigation, and an already-used key; first scroll cancels an active initial sequence.

## Signal mapping decisions

- Adopt exactly: Inter typography, measured neutrals, radii, shadows, duration/easing tokens, hero reveal primitive, delays, and fresh-visit guard.
- Preserve intentionally: Signal's canonical CLI phase colors, terminal meaning, content, four-terminal composition, accessibility, Lenis reduced-motion behavior, and preview-only Agentation boundary.
- Do not adopt: Linear logos, copy, screenshots, illustration assets, proprietary font binaries, or unrelated product-specific sequences.
