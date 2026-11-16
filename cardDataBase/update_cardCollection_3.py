# run:  & "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" .\update_cardCollection_3.py

import csv

cardcollection_path = "cardcollection.csv"
update_cards_path = "updateCards_3.csv"
output_path = "cardcollection_updated.csv"

# Read the card names that should be accepted
accepted_names = set()
with open(update_cards_path, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        if not row:
            continue

        name = row[0].strip().strip('"').lstrip("\ufeff")
        if name:
            accepted_names.add(name)

updated_count = 0
rows = []

with open(cardcollection_path, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader, None)
    if header is None:
        raise SystemExit("cardcollection.csv is empty")

    rows.append(header)

    normalized = [cell.strip().lstrip("\ufeff").lower() for cell in header]
    name_idx = normalized.index("name") if "name" in normalized else 0
    status_idx = normalized.index("status") if "status" in normalized else 5
    copies_idx = normalized.index("copies") if "copies" in normalized else 6

    for row in reader:
        if not row:
            rows.append(row)
            continue

        name = row[name_idx].strip().strip('"') if name_idx < len(row) else ""
        if name in accepted_names:
            if status_idx < len(row):
                row[status_idx] = "accepted"
            if copies_idx < len(row):
                row[copies_idx] = "1"
            updated_count += 1

        rows.append(row)

with open(output_path, "w", newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerows(rows)

print(f"Updated {updated_count} cards in {output_path}")
print(f"Changed matches from {update_cards_path} to status='accepted' and copies='1'")
