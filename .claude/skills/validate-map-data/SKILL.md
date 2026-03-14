---
name: validate-map-data
description: Validate all magical-map-maker data/*.json files for schema integrity, referential consistency, and completeness against the spec.
argument-hint:
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
---

# Validate Map Data

Run a comprehensive validation of all JSON data files in `js/data/`.

## Files to Validate

1. **js/data/base-types.json** — Base tile type definitions
2. **js/data/overlays.json** — Overlay definitions
3. **js/data/themes.json** — Theme → tile/overlay mappings

## Validation Rules

### base-types.json
- Valid JSON array
- Each entry has required fields: `id` (string, kebab-case), `name` (string), `category` (one of: grassland-plains, forest-vegetation, water, elevation, desert-arid, arctic-cold, dungeon, space, volcanic-hazard, constructed, coastal-ocean, battlefield-tactical, continental-world), `colors` (object with primary, secondary, accent hex strings), `pattern` (string), `themes` (string array)
- No duplicate `id` values
- All `id` values are kebab-case (lowercase, hyphens only)
- `themes` array values must match theme IDs in themes.json
- Spec requires 100 base types total — warn if count differs significantly

### overlays.json
- Valid JSON array
- Each entry has required fields: `id` (string, kebab-case), `name` (string), `category` (one of: settlement, structure, wildlife, character, marker, numbered, lettered, navigation, nature, atmosphere, weather, hazard, label), `themes` (string array — empty means universal), `svgSymbolId` (string), `sizeRatio` (number 0.1–1.0)
- No duplicate `id` values
- `themes` array values must match theme IDs in themes.json (when non-empty)
- Spec requires 55 universal overlays + ~170 theme-specific (~225 total) — warn if counts are significantly off

### themes.json
- Valid JSON array
- Each entry has required fields: `id` (string, kebab-case), `name` (string), `description` (string), `colors` (object with bg, accent, grid hex strings), `baseTiles` (string array), `overlays` (string array)
- No duplicate `id` values
- Spec requires 9 themes — warn if count differs
- Every `baseTiles` ID must exist in base-types.json
- Every `overlays` ID must exist in overlays.json
- Every base type's `themes` array must be consistent with the theme's `baseTiles` array (bidirectional check)

### Cross-File Consistency
- Every base type referenced in a theme's `baseTiles` must also list that theme in its `themes` array
- Every overlay referenced in a theme's `overlays` must also list that theme in its `themes` array (unless universal)
- No orphan base types (not referenced by any theme)
- No orphan overlays (not referenced by any theme and not universal)

## Output Format

```
=== Validating base-types.json ===
✓ Valid JSON (N entries)
✓ All required fields present
✗ ERROR: Duplicate ID "grassland" at indices 0 and 12
✓ All IDs are kebab-case
⚠ WARNING: 32 base types found, spec expects 35

=== Validating overlays.json ===
...

=== Validating themes.json ===
...

=== Cross-File Consistency ===
...

=== Summary ===
N errors, N warnings
```

Report errors (✗) and warnings (⚠) with specific details. Errors must be fixed before committing.
