# Phase 11 — Keyboard and Motion Accessibility

## Delivered

- Added a keyboard-only skip link that moves focus directly to the main workspace.
- Added shared modal focus management, including initial focus, Tab/Shift+Tab containment, Escape-to-close, and focus restoration.
- Improved the mobile navigation drawer so Escape closes it and returns focus to the menu trigger.
- Added a global reduced-motion safeguard that effectively removes nonessential animations and transitions when requested by the operating system.
- Added organizer and student browser tests for navigation bypass, mobile drawer behavior, modal behavior, and reduced motion.

## Coverage

- Student dashboard keyboard navigation.
- Organizer dashboard keyboard navigation.
- Student shared modal focus behavior.
- Student and organizer mobile navigation drawers.
- Student and organizer reduced-motion workspaces.
- Chromium, Firefox, and WebKit.

## UI impact

Normal pointer and touch use is visually unchanged. The skip link appears only when it receives keyboard focus. Users who enable reduced motion in their device settings will see animations and transitions effectively disabled.

## Remaining manual accessibility work

1. Test representative workflows with NVDA on Windows and VoiceOver on Safari.
2. Confirm 200% and 400% zoom on physical browsers; Phase 12 now provides automated reflow, text-spacing, and forced-colors coverage.
3. Validate complex dropdowns, Phase 14 data grids, charts, and camera controls with physical assistive technology.
4. Validate the Phase 13 chart, facial-verification, and QR alternatives with physical screen readers and devices.
5. Conduct usability testing with students and organizers who have accessibility needs.
