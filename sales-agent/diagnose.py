#!/usr/bin/env python3
"""
Diagnostic script to check and fix Google Sheet header issues.
Run: python diagnose.py
"""

from dotenv import load_dotenv
load_dotenv()

import os
from modules.sheets import _get_sheet, diagnose_headers, HEADERS

def fix_duplicate_headers():
    """Automatically fix duplicate and missing headers."""
    sheet = _get_sheet()
    first_row = sheet.row_values(1)

    if not first_row:
        print("❌ No headers found — creating new headers")
        sheet.append_row(HEADERS)
        return

    print("Current headers:", first_row)
    print("Expected headers:", HEADERS)

    # Step 1: Delete duplicate columns
    from collections import Counter
    counts = Counter(first_row)
    duplicates = [col for col, count in counts.items() if count > 1]

    if duplicates:
        print(f"\nRemoving duplicate columns: {duplicates}")
        # Rebuild the row without duplicates, keeping only first occurrence
        seen = set()
        cols_to_delete = []

        for i, col in enumerate(first_row):
            if col in duplicates and col in seen:
                cols_to_delete.append(i + 1)  # 1-indexed for gspread
            else:
                seen.add(col)

        # Delete columns in reverse order (to avoid index shifting)
        for col_idx in sorted(cols_to_delete, reverse=True):
            print(f"  Deleting column {col_idx}...")
            sheet.delete_columns(col_idx, col_idx)

        first_row = sheet.row_values(1)

    # Step 2: Check if phone column is missing and insert it
    if "phone" not in first_row and len(first_row) >= 5:
        # Phone should be at index 5 (column F)
        print("\nInserting missing 'phone' column at position F...")
        # Insert column after 'city' (which is at position 4)
        # In gspread, we need to shift columns and update
        # Get all current data
        all_records = sheet.get_all_values()

        # Insert empty column after city (column E)
        # Shift all data from F onwards
        for row_idx in range(1, len(all_records) + 1):
            values = sheet.row_values(row_idx)
            # Insert "phone" header at position 6 (after city)
            if row_idx == 1:
                new_values = values[:5] + ["phone"] + values[5:]
            else:
                new_values = values[:5] + [""] + values[5:]

            # Update the entire row
            for col_idx, val in enumerate(new_values, 1):
                sheet.update_cell(row_idx, col_idx, val)

        first_row = sheet.row_values(1)

    # Step 3: Verify final headers
    print("\nVerifying headers...")
    if first_row == HEADERS:
        print("✅ Headers are now correct!")
    else:
        print("⚠️ Headers still don't match. Manual intervention needed.")
        diagnose_headers()


def show_sheet_info():
    """Display current sheet information."""
    sheet = _get_sheet()

    print("\n" + "="*60)
    print("Google Sheet Diagnostic Report")
    print("="*60)

    first_row = sheet.row_values(1)
    print(f"\nCurrent Headers ({len(first_row)} columns):")
    for i, header in enumerate(first_row, 1):
        print(f"  Column {chr(64+i)}: {header}")

    print(f"\nExpected Headers ({len(HEADERS)} columns):")
    for i, header in enumerate(HEADERS, 1):
        print(f"  Column {chr(64+i)}: {header}")

    print("\n" + "-"*60)
    print("Header Validation:")
    diagnose_headers()

    try:
        records = sheet.get_all_records()
        print(f"\n✓ Can read records: {len(records)} leads in sheet")
    except Exception as e:
        print(f"\n❌ Cannot read records: {e}")

    print("="*60 + "\n")


if __name__ == "__main__":
    show_sheet_info()

    first_row = _get_sheet().row_values(1)
    from collections import Counter
    counts = Counter(first_row)
    duplicates = [col for col, count in counts.items() if count > 1]

    if duplicates:
        print("Would you like to automatically fix the duplicate headers? (y/n): ", end="")
        response = input().strip().lower()
        if response == "y":
            fix_duplicate_headers()
            show_sheet_info()
        else:
            print("\nTo fix manually:")
            print("1. Open your Google Sheet")
            print(f"2. Find and delete the duplicate '{duplicates[0]}' column")
            print("3. Run this script again to verify")
