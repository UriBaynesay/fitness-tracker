# Design guide (Option A: dark with lime)

Source of truth: the ten screen files in `design/screens/` (static HTML mockups, each 390 × 844) and `design/canvas.json` (their layout on the design canvas). Open any `.dc.html` file as text to read exact markup and inline styles. Build the real UI in React; match the tokens and layouts below.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| background | `#101216` | App background |
| surface | `#1A1D23` | Cards, rows |
| surface-raised | `#232730` | Inputs, steppers, segmented-control tracks, inactive progress |
| border | `#2C313B` | Card and row borders, dividers |
| text | `#F3F4F1` | Primary text |
| text-muted | `#9AA0AB` | Labels, secondary text |
| accent | `#C8F135` | Primary buttons, active states, progress fill, hint border |
| on-accent | `#101216` | Text on accent fills |
| danger | `#FF8A80` | Delete account |

Fonts (Google Fonts): **Barlow Condensed** 600/700 for screen titles (uppercase), big numbers (weight, reps, timer) and goal values; **Barlow** 400/500/600 for everything else. Hebrew uses **Heebo** 400/500/600/800; numbers stay in Barlow Condensed with `dir="ltr"`.

Shape and size: card radius 14–16 px, buttons radius 14 px, pills 22 px; minimum touch target 44 px (steppers 56 px, primary button 56–60 px); body text 15–17 px; small uppercase labels 12 px with 1.5 px letter spacing. Icons are 2 px stroke line icons (inline SVG), never emoji. No status bar is drawn.

Bottom tab bar (76 px): Today, Plans, Progress, Goals; the active tab is accent-colored. It appears on those four screens only, not during a workout.

## Screens

1. **Today** (`Main.dc.html`): title and date, account button (opens Settings). Card labelled "CURRENT PLAN · plan name" with today's day title ("Push day"), its first three exercises with sets × target reps, and a Start workout button. Week strip (S M T W T F S): filled circle = workout done with the plan day name (Push / Pull / Legs) under it; today is a ring. "Today's targets": per exercise, last time vs the target now. No general goals here.
2. **Live workout** (`Session.dc.html`): top bar with Exit and exercise position (2 / 5). No elapsed timer. Exercise name, "Target 4 × 8", a hint card (lime border) with the overload suggestion. Sets: finished sets as check rows, the active set as a highlighted card with weight and reps steppers (pre-filled from the hint; the user corrects after doing the set), later sets as dashed rows. Complete set button; "Next exercise: …" below.
3. **Rest timer** (`Rest.dc.html`): the set just logged, a large circular countdown ring with time left, −15 s / +15 s, a preview of the next set, Skip rest.
4. **Live workout, Hebrew** (`Session-he.dc.html`): same as 2 mirrored for right-to-left. This is the reference for RTL: `dir="rtl"` on the root, logical layout, numbers LTR.
5. **Plan editor** (`Plan.dc.html`): plan name, day chips (Push / Pull / Legs / +), expanded exercise card with Sets, Target reps, Rest, Weight step and a Progression control (Hit target / Last set to failure), collapsed cards for the other exercises, "+ Add exercise" (opens screen 9).
6. **Goals** (`Goals.dc.html`): goal cards with exercise, metric chip (REPS / WEIGHT / DURATION), best so far, goal, progress bar, start value and percent; a reached goal shows a check. Add goal button.
7. **Progress** (`History.dc.html`): exercise picker, metric toggle (Weight / Reps / Est. 1RM), line chart of the best set per session, list of recent sessions with their sets.
8. **Settings** (`Settings.dc.html`): language (English / עברית), weight unit (kg / lb), sound and vibration when rest ends, keep screen on, account (email, log out, delete account and all data).
9. **Add exercise** (`AddExercise.dc.html`): search field, muscle-group filter chips, exercise list (from the seed list) with one selected, "Create your own exercise", Add button.
10. **Plan editor, last set to failure** (`Plan-failure.dc.html`): the plan editor with Progression = Last set to failure; extra fields "Failure set goal" (20 reps) and "Confirm over" (2 sessions) and a one-line explanation. Example: 4 × 15, failure goal 20.

## Behaviors the mockups imply (not drawn)

- Tapping "+ 2 more exercises" on the Today card expands the list.
- Logging flow per set: the numbers are pre-filled from the hint, the user does the set, corrects the numbers if needed, taps Complete set, the rest timer starts automatically, and the next set opens pre-filled.
- Rest timer keeps correct time through screen lock (store the end timestamp).
- Week strip day label comes from the plan day the session was started from; a workout with no plan day shows "Custom".
- Data shown in the mockups (names, weights, dates, "[your email]") is placeholder.

## Alternatives that were considered and dropped

A light theme (white with blue), a warm dark theme (charcoal with orange and big side-by-side weight/rep tiles), and a table layout for logging sets (editable rows). Option A was chosen; the table layout can be revisited later as a "quick edit" mode.
