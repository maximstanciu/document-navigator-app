#!/usr/bin/env bash
# Copies the kits made by the *_kit.py generators to Android devices: Download/DocNavigatorTest for «Файл»,
# Pictures/DocNavigatorTest for «Фото из галереи». Replaces what an earlier run put there.
#
# Usage: scripts/eval/synthetic/push-android.sh [dir] [serial...]
#   dir is one kit (a folder with labels.json) or a folder of kits; it defaults to scripts/eval/out, every kit
#   all_kits.py made. Files of the other kits get the kit name in front (invoices-01-….pdf), so they don't
#   collide; tenancy keeps its names, which docs/smoke-test.md uses. No serials means every device
#   `adb devices` lists.
set -euo pipefail

source=${1:-"$(dirname "$0")/../out"}
shift || true
if [ -f "$source/labels.json" ]; then
  kits=("$source")
else
  kits=()
  for labels in "$source"/*/labels.json; do
    [ -f "$labels" ] && kits+=("$(dirname "$labels")")
  done
fi
if [ ${#kits[@]} -eq 0 ]; then
  echo "No kits in $source: run scripts/eval/synthetic/all_kits.py first." >&2
  exit 1
fi

serials=("$@")
if [ ${#serials[@]} -eq 0 ]; then
  mapfile -t serials < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
fi
if [ ${#serials[@]} -eq 0 ]; then
  echo "No Android device is connected (adb devices)." >&2
  exit 1
fi

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
for folder in Download Pictures; do
  mkdir -p "$staging/$folder/DocNavigatorTest"
  for kit in "${kits[@]}"; do
    name=$(basename "$kit")
    prefix=$([ "$name" = tenancy ] && echo "" || echo "$name-")
    for file in "$kit/$folder/DocNavigatorTest"/*; do
      [ -f "$file" ] && cp "$file" "$staging/$folder/DocNavigatorTest/$prefix$(basename "$file")"
    done
  done
done

for serial in "${serials[@]}"; do
  for folder in Download Pictures; do
    # Recreated explicitly: adb doesn't create an empty folder (a kit without photos).
    adb -s "$serial" shell "rm -rf /sdcard/$folder/DocNavigatorTest && mkdir -p /sdcard/$folder/DocNavigatorTest"
    adb -s "$serial" push -q "$staging/$folder/DocNavigatorTest/." "/sdcard/$folder/DocNavigatorTest/"
  done
  # The system pickers list files from MediaStore, which indexes pushed files only after a scan.
  adb -s "$serial" shell 'for f in /sdcard/Download/DocNavigatorTest/* /sdcard/Pictures/DocNavigatorTest/*; do
    am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$f" > /dev/null
  done'
  count=$(adb -s "$serial" shell ls /sdcard/Download/DocNavigatorTest /sdcard/Pictures/DocNavigatorTest | grep -c '\.')
  echo "$serial: $count files from ${#kits[@]} kit(s)"
done
