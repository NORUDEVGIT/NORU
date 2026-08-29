# Why Abera's Take Order screen says "You don't have a shift running right now"

## What the data shows

Abera's shift today is stored as `11:50–17:00`, status `scheduled`, and he is checked in (10:50 UTC, not checked out). The database clock at the moment of the report was `11:01 UTC` (12:01 London).

## The cause

Shift times are stored as plain clock times with no timezone, and the code that decides "is a shift running right now" builds the window as **UTC**: `11:50` is treated as `11:50Z`. So at `11:01 UTC` the shift is considered not started yet — the waiter screen correctly refuses under its own rule, even though by the manager's local clock the shift is live.

Two separate things make this visible:

1. **Timezone convention mismatch.** Managers type shift times on their local clock (UTC+1 in London, UTC+3 in Addis), but the running-shift check compares them against UTC. The window is shifted by the offset, so waiters get locked out at the start of a shift and stay unlocked past the end.
2. **Check-in does not apply the same rule.** Check-in has no time-window test, so Abera could check in successfully while the ordering screen still saw "no shift running". The two screens disagree, which is why it looks like a bug rather than a schedule problem.

In this specific case both apply: even ignoring timezones, `11:50` is 49 minutes in the future relative to `11:01`.

## What the fix would involve (not doing it yet)

- Pick one timezone convention for shifts and apply it in every place that interprets `shift_date + start_time/end_time`: the running-shift lookup for waiter ordering, waiter attribution resolution, lateness, and worked hours.
- Options: (a) treat shift clock times as the restaurant's local time using a restaurant timezone setting, or (b) keep the current UTC convention but make the scheduling UI store times converted to UTC so what's typed matches what's enforced.
- Make check-in and the ordering screen share one "current shift" resolver so they can never disagree, and show the reason precisely ("your shift starts at 11:50", "your shift ended at 17:00") instead of a single generic message.

## Question before I plan the fix

Which convention do you want: shift times meaning **restaurant local time** (needs a timezone on the restaurant, default Africa/Addis_Ababa) or staying on UTC everywhere? Local time is the correct long-term answer for a real restaurant.
