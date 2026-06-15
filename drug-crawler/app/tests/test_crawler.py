from __future__ import annotations

import pytest

from app.crawler.prefix import (
    ALPHABET,
    SEED_PREFIXES,
    children_needed,
    expand_prefix,
    is_leaf,
    normalize_prefix,
    prefix_depth,
    validate_prefix,
)


class TestPrefixExpansion:
    def test_seed_prefixes_length(self):
        assert len(SEED_PREFIXES) == 36  # 26 letters + 10 digits

    def test_seed_prefixes_contains_all_chars(self):
        assert "a" in SEED_PREFIXES
        assert "z" in SEED_PREFIXES
        assert "0" in SEED_PREFIXES
        assert "9" in SEED_PREFIXES

    def test_expand_prefix_creates_36_children(self):
        children = expand_prefix("cr")
        assert len(children) == 36
        assert "cra" in children
        assert "crz" in children
        assert "cr0" in children
        assert "cr9" in children

    def test_expand_prefix_single_char(self):
        children = expand_prefix("a")
        assert len(children) == 36
        assert all(c.startswith("a") for c in children)

    def test_expand_prefix_deep(self):
        children = expand_prefix("croaz")
        assert all(c.startswith("croaz") for c in children)
        assert len(children) == 36

    def test_prefix_depth(self):
        assert prefix_depth("a") == 1
        assert prefix_depth("ab") == 2
        assert prefix_depth("abcde") == 5

    def test_is_leaf_below_limit(self):
        assert is_leaf(result_count=5, api_limit=8) is True
        assert is_leaf(result_count=7, api_limit=8) is True

    def test_is_leaf_at_limit(self):
        assert is_leaf(result_count=8, api_limit=8) is False

    def test_children_needed_at_limit(self):
        assert children_needed(result_count=8, api_limit=8) is True
        assert children_needed(result_count=5, api_limit=8) is False

    def test_validate_prefix_valid(self):
        assert validate_prefix("abc") is True
        assert validate_prefix("a1b2") is True
        assert validate_prefix("0") is True

    def test_validate_prefix_invalid(self):
        assert validate_prefix("") is False
        assert validate_prefix("ABC") is False  # uppercase not valid raw
        assert validate_prefix("ab!") is False

    def test_normalize_prefix(self):
        assert normalize_prefix("  ABC  ") == "abc"
        assert normalize_prefix("CRO") == "cro"


class TestPrefixAlgorithm:
    def test_expansion_is_recursive_in_nature(self):
        """Simulate two levels of expansion."""
        level1 = expand_prefix("a")
        assert len(level1) == 36

        level2_first = expand_prefix(level1[0])
        assert len(level2_first) == 36
        assert level2_first[0].startswith(level1[0])

    def test_all_prefixes_unique_at_each_level(self):
        level1 = expand_prefix("c")
        assert len(set(level1)) == len(level1)

        level2 = []
        for p in level1[:5]:
            level2.extend(expand_prefix(p))
        assert len(set(level2)) == len(level2)
