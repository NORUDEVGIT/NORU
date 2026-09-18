# Card 6 — Connectivity & Distribution, Phase 2: Distribution mapping

GitHub issue [#183](https://github.com/NORUDEVGIT/NORU/issues/183) · branch
`feature/183-connectivity-distribution-phase2` · migration slot `0070`.

Phase 2 fills the **Distribution** tab. Integrations stays as Phase 1 shipped it. There is one
overview and one reusable Add/Edit drawer. Mapping sections live inside that drawer. Credentials
are never collected here. There is no sync or activation engine.

## Decisions

- Eligible integrations: enabled Phase 1 rows whose status is `pending` or `connected`. Disabled
  and error rows are shown as unavailable. Labels stay honest — Phase 1 never writes Connected.
- A `distribution` category is added to the Phase 1 catalog (Aiosell, generic channel manager,
  generic OTA). Data only; no new Integrations UI.
- Live `distribution_*` tables are extended. Seeded `DIRECT` is never listed, edited or deleted.
- Meal mappings exist against `pms_meal_plans`. Policy mapping is omitted — NORU has no policy
  entity. The drawer states that in one line.
- External catalogs are a local configuration layer, labelled non-live.
- Last Sync is empty (`—`). Sync Now is a disabled menu item.
- Partial save is allowed. `mapping_status` is `attention` or `pending`. Phase 2 never writes
  `connected`. Operational `distribution_channels.status` for Card 6 rows stays `not_connected`.

## Schema — `0070`

- `distribution_channels.integration_id` nullable → `pms_integrations(id) ON DELETE RESTRICT`
- `environment` (`sandbox` | `production`)
- `mapping_status` (`pending` | `attention` | `disabled`)
- `external_entity_id` on room and rate mappings
- `distribution_meal_mappings` keyed to `pms_meal_plans`
- `pms_integrations` category check widened to include `distribution`

Do not apply to the live project until asked.
