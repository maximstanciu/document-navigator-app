#!/usr/bin/env bash
# Copies a kit made by one of the *_kit.py generators to Android devices: Download/DocNavigatorTest for «Файл»,
# Pictures/DocNavigatorTest for «Фото из галереи». Replaces what an earlier run put there.
#
# Usage: scripts/eval/synthetic/push-android.sh [kit_dir] [serial...]
#   kit_dir defaults to scripts/eval/out/tenancy; no serials means every device `adb devices` lists.
set -euo pipefail

kit=${1:-"$(dirname "$0")/../out/tenancy"}
shift || true
serials=("$@")
if [ ${#serials[@]} -eq 0 ]; then
  mapfile -t serials < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
fi
if [ ${#serials[@]} -eq 0 ]; then
  echo "No Android device is connected (adb devices)." >&2
  exit 1
fi

for serial in "${serials[@]}"; do
  for folder in Download Pictures; do
    adb -s "$serial" shell rm -rf "/sdcard/$folder/DocNavigatorTest"
    adb -s "$serial" push -q "$kit/$folder/DocNavigatorTest" "/sdcard/$folder/"
  done
  # The system pickers list files from MediaStore, which indexes pushed files only after a scan.
  adb -s "$serial" shell 'for f in /sdcard/Download/DocNavigatorTest/* /sdcard/Pictures/DocNavigatorTest/*; do
    am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$f" > /dev/null
  done'
  count=$(adb -s "$serial" shell ls /sdcard/Download/DocNavigatorTest /sdcard/Pictures/DocNavigatorTest | grep -c '\.')
  echo "$serial: $count files"
done
