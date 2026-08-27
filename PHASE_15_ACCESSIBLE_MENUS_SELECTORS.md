# Phase 15 — Accessible Menus and Selectors

## Delivered

- Converted the custom student selector into a labeled listbox pattern with expanded state, selected-option announcements, and trigger/listbox relationships.
- Added Arrow Up, Arrow Down, Home, End, Enter, and Escape keyboard behavior to student selectors.
- Restored focus to the selector trigger after choosing an option or closing with Escape.
- Added explicit menu/button semantics to organizer and student account menus.
- Added Arrow Down opening, Escape closing, outside-click closing, and trigger-focus restoration to account menus.
- Added menu-item semantics to Profile and Logout actions.
- Tightened the profile logout regression test so it targets the page action rather than similarly named menu actions.

## Verification

- Menu and selector browser journeys: 9/9 passed across Chromium, Firefox, and WebKit.
- Chromium automated WCAG 2.1 AA scan: 6/6 passed.
- Production build: passed with 2,723 modules transformed.
- Focused authentication suite: 15/15 passed.
- Lint: passed with zero reported errors or warnings.

## UI impact

No intended visual change. The improvements affect keyboard focus, accessible roles, state announcements, and closing behavior.

## Remaining manual accessibility work

1. Validate menus, listboxes, and selected-state announcements with NVDA and VoiceOver.
2. Confirm touch-screen reader behavior on Android and iOS.
3. Validate Phase 16 form errors and Phase 17 asynchronous feedback, then conduct usability testing with students and organizers who regularly use assistive technology.
