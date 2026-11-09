# Degree roadmap workspace

The Degree roadmap page shows the whole saved roadmap in one stack. Open semesters independently, expand or collapse all, or show remaining study and Needs placement. Semester headers retain the course count, credits and passed count while closed.

- Drag a course's handle onto an open or closed semester. The destination highlights without changing the layout; a successful move opens both semesters and focuses the moved row.
- The visible **Move to** menu provides the same action for keyboard and touch users. Progress can be updated directly in each row; selecting a course name opens the full editor.
- Add courses and notes inside a semester. Remove courses from their row, and remove a semester once empty. Manual changes have one-step undo; a later edit invalidates the previous undo rather than overwriting newer work.
- Placement uses the existing manual prerequisite validation. Rejected moves explain the conflict and leave courses, notes and progress unchanged. Completed-history placement is not a drag destination.
- Manual editing uses no AI allowance. Workspace persistence and cloud conflict checks remain unchanged. A degree-change proposal still requires explicit acceptance.

The Excel overview has separate Semester, Course name, Course code and Credits columns. Each semester has a SUM formula and cached total, with green labels and collapsible detail rows. A smaller cumulative planned-credit total appears below each semester, alongside the published degree-credit requirement. Prior completed study starts the running total; scheduled semesters follow in chronological order. Each cumulative formula links the previous cumulative value and the current semester subtotal, so editing course credits recalculates later totals without double-counting course rows and subtotals. These are planned credits through that semester, not a claim that all are earned. Needs placement retains its own subtotal and notes but is excluded from the cumulative sequence. Semester notes, completed course labels and the Course details sheet are retained. The export is an editable copy; workbook changes do not sync back into GoPlan.
