#!/bin/bash
# PostToolUse hook: validates magical-map-maker data JSON files after Edit/Write
# Exit 0 = pass, Exit 2 = block (show error)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only validate data JSON files
if [[ ! "$FILE_PATH" =~ magical-map-maker-game/js/data/.*\.json$ ]]; then
  exit 0
fi

# Check valid JSON
if ! jq empty "$FILE_PATH" 2>/dev/null; then
  echo "❌ Invalid JSON in $FILE_PATH" >&2
  exit 2
fi

BASENAME=$(basename "$FILE_PATH")

case "$BASENAME" in
  base-types.json)
    # Check for duplicate IDs
    DUPES=$(jq -r '.[].id' "$FILE_PATH" | sort | uniq -d)
    if [ -n "$DUPES" ]; then
      echo "❌ Duplicate base type IDs: $DUPES" >&2
      exit 2
    fi
    # Check required fields
    MISSING=$(jq -r '.[] | select(.id == null or .name == null or .category == null or .colors == null or .themes == null) | .id // "unknown"' "$FILE_PATH")
    if [ -n "$MISSING" ]; then
      echo "❌ Base types missing required fields: $MISSING" >&2
      exit 2
    fi
    COUNT=$(jq 'length' "$FILE_PATH")
    echo "✓ base-types.json: $COUNT entries, no duplicates, all fields present" >&2
    ;;

  overlays.json)
    # Check for duplicate IDs
    DUPES=$(jq -r '.[].id' "$FILE_PATH" | sort | uniq -d)
    if [ -n "$DUPES" ]; then
      echo "❌ Duplicate overlay IDs: $DUPES" >&2
      exit 2
    fi
    # Check required fields
    MISSING=$(jq -r '.[] | select(.id == null or .name == null or .category == null or .svgSymbolId == null) | .id // "unknown"' "$FILE_PATH")
    if [ -n "$MISSING" ]; then
      echo "❌ Overlays missing required fields: $MISSING" >&2
      exit 2
    fi
    COUNT=$(jq 'length' "$FILE_PATH")
    echo "✓ overlays.json: $COUNT entries, no duplicates, all fields present" >&2
    ;;

  themes.json)
    # Check for duplicate IDs
    DUPES=$(jq -r '.[].id' "$FILE_PATH" | sort | uniq -d)
    if [ -n "$DUPES" ]; then
      echo "❌ Duplicate theme IDs: $DUPES" >&2
      exit 2
    fi
    # Check required fields
    MISSING=$(jq -r '.[] | select(.id == null or .name == null or .colors == null or .baseTiles == null) | .id // "unknown"' "$FILE_PATH")
    if [ -n "$MISSING" ]; then
      echo "❌ Themes missing required fields: $MISSING" >&2
      exit 2
    fi
    COUNT=$(jq 'length' "$FILE_PATH")
    echo "✓ themes.json: $COUNT entries, no duplicates, all fields present" >&2
    ;;
esac

exit 0
