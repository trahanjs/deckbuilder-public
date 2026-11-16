#!/usr/bin/env python3
"""Append cards from updateCards_2.csv into cardcollection format.

Usage examples:
    py -3 .\\update_cardCollection_2.py
    py -3 .\\update_cardCollection_2.py --in-place
    py -3 .\\update_cardCollection_2.py --input updateCards_2.csv --collection cardcollection.csv --output cardcollection_updated.csv
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

DEFAULT_INPUT = "updateCards_2.csv"
DEFAULT_COLLECTION = "cardcollection.csv"
DEFAULT_OUTPUT = "cardcollection_updated.csv"
EXPECTED_COLUMNS = ["name", "type", "set", "number", "rarity", "status", "copies"]
TYPE_PRIORITY = [
    "Battle",
    "Creature",
    "Planeswalker",
    "Land",
    "Artifact",
    "Enchantment",
    "Instant",
    "Sorcery",
]


def normalize(value: str) -> str:
    return (value or "").strip().strip('"').lstrip("\ufeff").lower()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Append updateCards_2 rows into cardcollection schema.")
    parser.add_argument("--input", default=DEFAULT_INPUT, help="Path to updateCards_2 CSV")
    parser.add_argument("--collection", default=DEFAULT_COLLECTION, help="Path to existing cardcollection CSV")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Path to output CSV (ignored with --in-place)")
    parser.add_argument("--in-place", action="store_true", help="Write directly to the collection file")
    return parser.parse_args()


def detect_header(row: list[str]) -> bool:
    if not row:
        return False
    first = normalize(row[0])
    second = normalize(row[1]) if len(row) > 1 else ""
    return first in {"name", "card name", "card_name"} or second == "set"


def status_to_copies(status: str) -> int:
    normalized = normalize(status)
    return 0 if normalized == "not owned" else 1


def simplify_card_type(raw_type: str) -> str:
    value = (raw_type or "").strip().strip('"')
    if not value:
        return "Unknown"

    lowered = value.lower()
    for canonical in TYPE_PRIORITY:
        if canonical.lower() in lowered:
            return canonical

    return "Unknown"


def to_collection_row(raw_row: list[str]) -> list[str] | None:
    if len(raw_row) < 6:
        return None

    name = raw_row[0].strip().strip('"').lstrip("\ufeff")
    set_code = raw_row[1].strip().strip('"')
    number = raw_row[2].strip().strip('"')
    rarity = raw_row[3].strip().strip('"')
    card_type = simplify_card_type(raw_row[4])
    status = raw_row[5].strip().strip('"')

    if not name:
        return None

    copies = status_to_copies(status)
    return [name, card_type, set_code, number, rarity, status, str(copies)]


def load_collection(path: Path) -> tuple[list[str], list[list[str]], set[str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if header is None:
            raise SystemExit(f"Collection CSV is empty: {path}")

        rows = [row for row in reader]

    normalized_header = [normalize(cell) for cell in header]
    if normalized_header != EXPECTED_COLUMNS:
        # Keep existing column order if present; otherwise fail fast.
        missing = [col for col in EXPECTED_COLUMNS if col not in normalized_header]
        if missing:
            raise SystemExit(
                f"Collection CSV missing required columns {missing}: {path}"
            )

    name_idx = normalized_header.index("name")
    existing_names = set()
    for row in rows:
        if name_idx < len(row):
            key = normalize(row[name_idx])
            if key:
                existing_names.add(key)

    return header, rows, existing_names


def main() -> None:
    args = parse_args()

    base_dir = Path(__file__).resolve().parent
    input_path = (base_dir / args.input).resolve() if not Path(args.input).is_absolute() else Path(args.input)
    collection_path = (base_dir / args.collection).resolve() if not Path(args.collection).is_absolute() else Path(args.collection)

    if args.in_place:
        output_path = collection_path
    else:
        output_path = (base_dir / args.output).resolve() if not Path(args.output).is_absolute() else Path(args.output)

    if not input_path.exists():
        raise SystemExit(f"Input CSV not found: {input_path}")
    if not collection_path.exists():
        raise SystemExit(f"Collection CSV not found: {collection_path}")

    header, collection_rows, existing_names = load_collection(collection_path)

    total_input_rows = 0
    malformed_rows = 0
    skipped_existing = 0
    appended = 0

    with input_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        for row_index, row in enumerate(reader):
            if not row or all(not str(cell).strip() for cell in row):
                continue

            if row_index == 0 and detect_header(row):
                continue

            total_input_rows += 1
            converted = to_collection_row(row)
            if converted is None:
                malformed_rows += 1
                continue

            key = normalize(converted[0])
            if key in existing_names:
                skipped_existing += 1
                continue

            collection_rows.append(converted)
            existing_names.add(key)
            appended += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(collection_rows)

    mode_label = "in-place" if args.in_place else "to new file"
    print(f"Wrote {output_path} ({mode_label})")
    print(f"Input rows read: {total_input_rows}")
    print(f"Appended: {appended}")
    print(f"Skipped (already in collection): {skipped_existing}")
    print(f"Skipped (malformed): {malformed_rows}")


if __name__ == "__main__":
    main()
