# Card 4 — Guest & Services, Phase 2: Required Fields

GitHub issue [#197](https://github.com/NORUDEVGIT/NORU/issues/197) · branch
`feature/197-card4-required-fields-phase2` · migration slot `0078`.

Phase 2 makes **Guest Profile Rules → Required Fields** functional. Identity
Documents, Preferences and Company & Business stay placeholders. Operational
guest create, check-in and reservation forms are unchanged (SET3 still owns
those toggles).

## Honesty

- This catalogue does not drive guest create, check-in or reservations.
- Profile Types associate by live field UUIDs; they do not copy field rows.
- Do not replace SET3 `#guest-profile`.
