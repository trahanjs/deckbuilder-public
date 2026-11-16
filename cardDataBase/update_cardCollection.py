# run:  & "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" .\update_cardCollection.py

import csv

cardcollection_path = "cardcollection.csv"
cards_updated_path = "updateCards.csv"
output_path = "cardcollection_updated.csv"

# Read updated cards with their preferred sets (card_name: preferred_set)
updated_cards = {}
with open(cards_updated_path, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        if len(row) < 2:
            continue
        card_name = row[0].strip().strip('"').lstrip("\ufeff")
        preferred_set = row[1].strip().strip('"')
        updated_cards[card_name] = preferred_set

updated_count = 0
rows = []

with open(cardcollection_path, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader, None)
    if header is None:
        raise SystemExit("cardcollection.csv is empty")

    normalized = [cell.strip().lstrip("\ufeff").lower() for cell in header]

    name_idx = normalized.index("name") if "name" in normalized else 0
    set_idx = normalized.index("set") if "set" in normalized else 1
    status_idx = normalized.index("status") if "status" in normalized else 4

    rows.append(header)

    for row in reader:
        if not row:
            rows.append(row)
            continue

        name = row[name_idx].strip().strip('"') if name_idx < len(row) else ""
        if name in updated_cards:
            preferred_set = updated_cards[name]

            if set_idx < len(row) and row[set_idx] != preferred_set:
                row[set_idx] = preferred_set

            if status_idx < len(row) and row[status_idx] != "own exact edition":
                row[status_idx] = "own exact edition"

            updated_count += 1

        rows.append(row)

with open(output_path, "w", newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f"Updated {updated_count} cards in {output_path}")
print(f"Cards updated with status and/or preferred set from {cards_updated_path}")