# JIALAT development instructions

## Project and scope
JIALAT is an existing Christmas event website. Improve it incrementally;
do not rebuild it. Keep the existing hosting and ntfy provider unless
the user explicitly approves a change.

The site uses static HTML, CSS and JavaScript:
- `index.html`: main menu.
- `itinerary/index.html`: four-day itinerary.
- `roomwars/index.html`: phone games, pair rankings and room selection.
- `after18years/index.html`: presentation wheel and Host/TV displays.
- `scoreboard/index.html`: nine-game scoring and Host/TV displays.
- `assets/`: shared styling, controls, reliability helpers and artwork.

Much application logic remains inside the HTML files. Connection logic
is duplicated across three pages; check affected copies when changing it.

## Design and devices
Preserve the existing visual style, layouts, artwork, animations, audio
and gameplay unless the requested change explicitly authorises otherwise.
Reuse existing shared styles and controls.

Consider Safari and Chrome on iPhone, iPad and MacBook. Preserve keyboard
access, visible focus, labelled controls, text resizing, reduced motion
and safe-area spacing. Distinguish viewport simulation from real-device
testing; do not claim compatibility that was not verified.

## Synchronisation and privacy
Keep development and automated tests isolated from live event data.
Use simulated ntfy traffic for routine tests; do not publish test messages
to production topics.

Preserve host ownership, message delivery, saved results and recovery.
Check duplicate, delayed and out-of-order messages, queued updates,
refreshes and reconnects when changing synchronisation.

Reduce publishes only when delivery and recovery remain reliable.
Respect applicable server cooldowns; available daily messages alone
do not prove every type of limit has cleared.

Browser host checks are not server authentication. Verify actual ntfy
permissions before making security claims. Do not add personal details,
private addresses, credentials, tokens or sensitive diagnostics to
instructions, fixtures, logs or reports.

## Game integrity
Preserve established scoring, timing, tie-break rules, practice limits
and presentation behaviour. Ask the user about unresolved rule decisions;
do not silently invent a policy.

Room Wars correction policy:
- If a score correction after room selection starts changes the final
  valid picking order, pause selection.
- Resolve any new tie using the existing rules.
- Warn the host and obtain confirmation before clearing all room choices.
- If the host does not confirm, keep selection paused and retain corrected
  scores. Never continue with an outdated order or silently discard scores.
- After confirmation, restart with the corrected order while preserving
  valid game results.
- If the valid picking order is unchanged, retain existing room choices.
- Prevent obsolete messages, queued updates or saved browser state from
  restoring selections from the previous picking session.

Restart timing details and scoreboard tie-break correction policy must
follow explicit user decisions.

## Testing
Before fixing a bug, reproduce or establish the relevant current
behaviour. Use focused checks proportionate to the change; a full
repository audit is not required for every edit.

Retest the changed behaviour and nearby features. For relevant changes,
check scoring totals, Host/TV agreement, timers, audio, animations and
recovery. Preserve the last valid state when rejecting invalid updates.

Use available tools; avoid unnecessary dependencies and configuration.
Report what passed, what was simulated and what remains untested.

## Authorisation and communication
Work only within the user's authorised scope. Once the user explicitly
authorises a specific implementation task, edit the relevant files and
run appropriate tests in an isolated development branch. Prepare changes
for review without requesting repeated approval for routine actions
already covered by those instructions.

Approval of a plan or this file alone does not authorise implementation.
Commits and pushes must also be explicitly authorised.

Never merge, deploy, change live services, alter production permissions
or access sensitive credentials without separate explicit approval.

Explain changes, side effects and test results in plain English.
Separate verified findings from potential risks. Ask only for decisions
that materially affect behaviour or scope.

Keep temporary audit tasks and progress in the task discussion rather
than accumulating a bug backlog in this file.
