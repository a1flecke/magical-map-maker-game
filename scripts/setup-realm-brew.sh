#!/bin/bash
# Setup Realm Brew assets from the Kickstarter bundle
# Usage: ./scripts/setup-realm-brew.sh /path/to/realm-brew-bundle

set -euo pipefail

BUNDLE_DIR="${1:-}"

if [ -z "$BUNDLE_DIR" ]; then
  echo "Usage: $0 /path/to/realm-brew-bundle"
  echo ""
  echo "The bundle directory should contain folders like:"
  echo "  0 • Realm Brew - Man Hewn Dungeons Tiles/"
  echo "  0 • Realm Brew Subterranean Rivers - Digital Tiles/"
  echo "  0 • Realm Brew Underdark Caverns - Digital Tiles/"
  echo "  0 • Realm Brew - Man Hewn Dungeons Overlays/"
  echo "  etc."
  exit 1
fi

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "Error: Directory not found: $BUNDLE_DIR"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEST="$PROJECT_DIR/assets/realm-brew"

echo "Setting up Realm Brew assets..."
echo "Source: $BUNDLE_DIR"
echo "Destination: $DEST"
echo ""

# Create directory structure
mkdir -p "$DEST/tiles/man-hewn-dungeons"
mkdir -p "$DEST/tiles/subterranean-rivers"
mkdir -p "$DEST/tiles/underdark-caverns"
mkdir -p "$DEST/overlays/man-hewn-dungeons"
mkdir -p "$DEST/overlays/subterranean-rivers"
mkdir -p "$DEST/overlays/underdark-caverns"
mkdir -p "$DEST/overlays/alchemists-workshop"
mkdir -p "$DEST/overlays/goblins-hideout"
mkdir -p "$DEST/overlays/red-dragons-lair"

# Copy tiles
echo "Copying tiles..."

copy_tiles() {
  local src_pattern="$1"
  local dest_dir="$2"
  local label="$3"

  local src_dir
  src_dir=$(find "$BUNDLE_DIR" -maxdepth 1 -type d -name "$src_pattern" | head -1)

  if [ -z "$src_dir" ]; then
    echo "  WARNING: Could not find $label directory matching '$src_pattern'"
    return
  fi

  local count
  count=$(find "$src_dir" -maxdepth 1 -name "*.png" | wc -l | tr -d ' ')
  cp "$src_dir"/*.png "$dest_dir/" 2>/dev/null || true
  echo "  $label: $count files"
}

copy_tiles "0*Man Hewn Dungeons*Tiles*" "$DEST/tiles/man-hewn-dungeons" "Man Hewn Dungeons tiles"
copy_tiles "0*Subterranean Rivers*Tiles*" "$DEST/tiles/subterranean-rivers" "Subterranean Rivers tiles"
copy_tiles "0*Underdark Caverns*Tiles*" "$DEST/tiles/underdark-caverns" "Underdark Caverns tiles"

# Copy overlays
echo ""
echo "Copying overlays..."

copy_tiles "0*Man Hewn Dungeons*Overlays*" "$DEST/overlays/man-hewn-dungeons" "Man Hewn Dungeons overlays"
copy_tiles "0*Subterranean Rivers*Overlays*" "$DEST/overlays/subterranean-rivers" "Subterranean Rivers overlays"
copy_tiles "0*Underdark Caverns*Overlays*" "$DEST/overlays/underdark-caverns" "Underdark Caverns overlays"
copy_tiles "1*Alchemist*Workshop*" "$DEST/overlays/alchemists-workshop" "Alchemist's Workshop overlays"
copy_tiles "1*Goblin*Hideout*" "$DEST/overlays/goblins-hideout" "Goblin's Hideout overlays"
copy_tiles "1*Red Dragon*Lair*" "$DEST/overlays/red-dragons-lair" "Red Dragon's Lair overlays"

# Verify file counts
echo ""
echo "=== Verification ==="

verify() {
  local dir="$1"
  local label="$2"
  local expected="$3"
  local count
  count=$(find "$dir" -maxdepth 1 -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -eq "$expected" ]; then
    echo "  OK  $label: $count files (expected $expected)"
  else
    echo "  !!  $label: $count files (expected $expected)"
  fi
}

verify "$DEST/tiles/man-hewn-dungeons" "Man Hewn tiles" 37
verify "$DEST/tiles/subterranean-rivers" "Subterranean tiles" 37
verify "$DEST/tiles/underdark-caverns" "Underdark tiles" 37
verify "$DEST/overlays/man-hewn-dungeons" "Man Hewn overlays" 66
verify "$DEST/overlays/subterranean-rivers" "Subterranean overlays" 31
verify "$DEST/overlays/underdark-caverns" "Underdark overlays" 35
verify "$DEST/overlays/alchemists-workshop" "Alchemist overlays" 62
verify "$DEST/overlays/goblins-hideout" "Goblin overlays" 62
verify "$DEST/overlays/red-dragons-lair" "Dragon overlays" 37

echo ""
echo "Done! Realm Brew assets are ready."
echo "The game will auto-detect them on next load."
