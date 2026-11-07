# Roadmap course finder

The sticky roadmap toolbar includes **Find a course**. Type part of a name or code, then choose a suggestion to open the course's current semester and scroll to its row. The course name receives keyboard focus, so Enter opens the normal editor. Existing progress and move controls work as usual.

Suggestions show the course name, code, semester and progress. Search includes Needs placement, prior study, manually added courses and distinct retake attempts in the current plan. It ignores case, accents and spacing in codes, matches words in any order and tolerates small spelling mistakes. Up to eight matches appear; a count prompts the student to narrow broader searches. No matches produces a short helpful message.

Arrow keys select suggestions, Enter jumps, Escape dismisses, and Tab continues normally. A clear button resets the input. Results also work by mouse and touch. The destination opens even if its semester was collapsed or hidden by the current filter. The course row is highlighted and shows its semester beside the name, so the location remains clear even when the section heading is off screen. Scroll offset respects the sticky toolbar and reduced-motion preference.

Queries stay in the browser's temporary interface state. No catalogue search, network request, analytics event, plan write or AI allowance is used. Each search and jump reads the current plan, so it follows course moves and does not resurrect removed courses.

`verify-course-finder.mjs` covers matching, retakes, placeholders, bounded output, current placement, stale selections, navigation and no-write/no-AI behaviour. Browser checks cover suggestion selection, keyboard navigation, focus, scroll visibility and responsive layout.
