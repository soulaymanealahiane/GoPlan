# Temporary notifications

Public pages, sign-in, the planner and operations share one viewport-level notification surface. Errors and update messages appear at the bottom without scrolling or moving keyboard focus. After six seconds, the toast slides downward and fades out over220ms, reversing its upward entrance. Hovering or focusing pauses the countdown so it can be read. A close button dismisses it without waiting for the countdown. New messages replace the current one and restart its timer; an earlier exit cannot hide a newer message.

The component stays mounted in the browser top layer until its exit finishes, with an ordinary fixed-position fallback. It respects safe-area insets; reduced-motion users get immediate dismissal without sliding. Errors use an assertive live region; informational messages use a polite one. Content is inserted as text, never HTML.

Existing inline error targets remain available to form and controller logic, but their text is hidden and forwarded into the notification. Retry and sign-in controls remain available. Unchanged errors are not replayed when a view redraws; a new invalid attempt can notify again. Mixed error/status targets become visible again when restored to normal status. Native form validation uses the same surface and keeps invalid fields marked.

The notification layer makes no network requests and does not store messages. Academic review notices, requirement checks, save state and form validation rules retain their existing meaning. Failed course moves still leave the roadmap unchanged and consume no AI allowance.
