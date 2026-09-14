import csv
from pathlib import Path

import pytest

from scripts.load_school import (
    EXPECTED_CANONICAL_CITIES,
    EXPECTED_MISSING,
    EXPECTED_REGIONS,
    EXPECTED_SCHOOLS,
    EXPECTED_SELECTED,
    EXPECTED_USER_ROWS,
    ImportValidationError,
    _display_name,
    normalize_name,
    read_region_overrides,
    read_schools,
    read_user_schools,
    validate_source,
)


ROOT = Path(__file__).resolve().parents[2]


def test_real_school_import_sources_have_expected_control_totals():
    schools = read_schools(ROOT / "temporary" / "ni_schools.csv")
    users = read_user_schools(ROOT / "temporary" / "user_school.csv")

    stats = validate_source(schools, users)

    assert stats["schools_from_csv"] == EXPECTED_SCHOOLS
    assert stats["regions_from_csv"] == EXPECTED_REGIONS
    assert stats["cities_canonical_target"] == EXPECTED_CANONICAL_CITIES
    assert stats["user_mapping_rows"] == EXPECTED_USER_ROWS
    assert stats["selected_source_rows"] == EXPECTED_SELECTED
    assert stats["missing_source_rows"] == EXPECTED_MISSING
    assert stats["unknown_source_school_ids"] == 0


def test_normalize_name_is_consistent_for_spaces_case_and_yo():
    assert normalize_name("  МОУ   Ёлочка ") == normalize_name("моу елочка")
    assert _display_name(["Озерки", "Озёрки"]) == "Озёрки"


def test_region_overrides_reject_duplicate_users(tmp_path):
    path = tmp_path / "overrides.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(["user_id", "region_name"])
        writer.writerow([1, "Москва"])
        writer.writerow([1, "Санкт-Петербург"])

    with pytest.raises(ImportValidationError, match="duplicate override user_id"):
        read_region_overrides(path)


def test_user_mapping_rejects_selected_without_school(tmp_path):
    path = tmp_path / "users.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(["user_id", "source_school_id", "school_status"])
        writer.writerow([1, "", "selected"])

    with pytest.raises(ImportValidationError, match="requires source_school_id"):
        read_user_schools(path)
