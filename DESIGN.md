# p.e.t desktop pet — design contract

## 0. Research Log
- Electron custom-window-styles documentation: frameless transparent pet, separate standard settings window; transparent pixels do not automatically pass clicks through.
- uiohook-napi upstream: global keydown hook with native platform binaries; discard key identity, no logging or transmission.
- OMH local dev-tool palette/font/UX reference queried. Dark console palettes rejected for this light desktop utility. Retain layered surfaces, CJK 14px floor, explicit actionable error messages.
- No supplied visual reference; use native desktop preferences as the layout direction, not a marketing landing page. No remote assets or fonts required.

## 1. Atmosphere & Identity
Primary direction: minimalist utility. Calm, precise, playful only in the pet. Name: p.e.t. Audience: Windows/macOS users who want a small keyboard-reactive companion. Signature: user-provided hand-drawn keyboard character from /Users/vumrra/Downloads/11.png and /Users/vumrra/Downloads/22.png, in that frame order, and a real animation preview stage. Preserve the white character/laptop interior; remove only exterior background. Original files remain untouched. Avoid generic hero/card grids, gradients, cream/serif editorial styling and decorative blobs.
Initial generation: greenfield Electron/TypeScript desktop UI. Implementation owner: Codex CLI, verification owner: Hermes. Core scope: pet window, settings window, local persistence, global-input adapter, installers and tests. No server, analytics, accounts, updater or external publishing.

## 2. Color
background #F5F6F8, surface #FFFFFF, inset #ECEEF2, text #202329, muted #606773, border #DDE1E7, accent #536747, accentHover #425337, accentSoft #EEF3E9, onAccent #FFFFFF, danger #AF3434, warning #875B16. Mostly neutral surfaces, accent under 10%. WCAG AA text contrast target; visible focus ring. Preview uses subtle flat inset stage, not gradients.

## 3. Typography
System native stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif. Korean body/labels minimum 14px, body 15px/1.6, main title 24px/1.3 weight 650, section label 15px/1.5 weight 600, numeric value 14px tabular. Korean word-break keep-all with overflow-wrap anywhere for filenames. No external font fetches.

## 4. Spacing & Layout
4px base, scale 4/8/12/16/24/32. Settings target about 560×740 logical px, min width 420; body vertical scroll when height constrained. Header with name and simple gray-line pet icon, preview stage, ordered five-image strip, two slider rows, keyboard checkbox and permission status, quiet footer. 24px outer padding. No navigation sidebar or duplicate headings. Image strip remains usable at 420px. Pet window small and transparent, padded for bounce, draggable, positioned inside work area. Slider changes image and window bounds around an anchored bottom edge.

## 5. Components
Native labeled range sliders with live numeric values; native checkbox; reusable small outlined icon buttons; primary add-image button; ordered image tile with thumbnail, reorder and remove actions. Native file dialog; PNG/WebP/JPEG raster images, actual decoding validation, max five enforced in main. Default state uses bundled original art. Upload busy state disables repeated import; errors inline role=alert with retry path. Buttons have hover/active/visible keyboard focus, disabled affordance. Permission missing state is distinct from off/listening and offers system-settings/retry action. Saved feedback only after persistence completes. Preview trigger must work without global permission. Quit reachable from settings and system menu/tray.

## 6. Motion & Interaction
UI transitions 140ms ease-out, no bouncing controls. Pet alone uses rAF transform-based small bounded ballistic/sine bounce with subtle squash and independently timed frame changes. Repeated key presses extend activity instead of restarting every frame. Idle returns to first frame after settling. Reduced motion disables bounce while retaining frame feedback. Input checkbox defaults true; false stops hook and returns idle. Never record typed text/key identity. Right-click pet opens settings; pet does not steal typing focus; drag to reposition. Transparent outer space must not trap large unrelated click regions. Frame images share contain-fit bottom alignment; trim/normalize if needed without stretching.

## 7. Depth & Surface
Flat panels and thin borders. No blanket card shadows, glass or gradients. Only pet shadow and native window shadow communicate depth. Bundled default mascot uses the two user-supplied PNGs, not a generated cat. Exterior background is transparent; both frames share a common canvas/crop so the head/laptop do not jitter. Imported user assets remain local.

## 8. Accessibility Constraints & Accepted Debt
All settings keyboard reachable, labels and button accessible names, visible focus, 14px CJK floor, stable layout and no clipped controls. Real settings screenshot + interaction check at native width and minimum size required. States: default/custom/5-image-limit/import-error/permission-denied/listening/off; first-run, persistence after relaunch; pet idle/typing/settling and reduced motion.
Performance budget: animation main-thread frame work below 16ms target on this local Apple Silicon desktop, no network load; not a measured claim until sampled. Web Core Vitals field measurements not applicable to packaged local utility. Cross-OS native hooks, macOS permission grants and Windows executable runtime require platform evidence, not unit-test substitution. Unsigned local builds are permitted, notarized/public distribution is not claimed. Windows build may be cross-built; actual Windows execution must be labelled unverified if unavailable.
