import csv

cardcollection_path = "cardcollection.csv"
set_count_threshold = 49

def read_cards(csv_file):
    rows = []
    with open(csv_file, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            rows.append(row)
    return rows

def count_owned_cards(cards): 
    count = 0
    for card in cards: 
        if card["status"] == "own exact edition":
            count += 1
    return count

def count_total_cards(cards):
    return len(cards)

def set_totals(cards):
    card_data = {}
    for card in cards:
        set_name = card["set"]
        if card["status"] == "own exact edition":
            if set_name not in card_data:
                card_data[set_name] = 0
            card_data[set_name] += 1
    for set_name, count in card_data.items():
        if count > set_count_threshold:
            print(f"{set_name}: {count}")

def main(): 
    cards = read_cards(cardcollection_path)
    owned_count = count_owned_cards(cards)
    total_count = count_total_cards(cards)
    print(f"Owned cards: {owned_count}")
    print(f"Total cards: {total_count}")
    print(f"Missing cards: {total_count - owned_count}")
    print(f"Set totals:")
    set_totals(cards)

if __name__ == "__main__":
    main()