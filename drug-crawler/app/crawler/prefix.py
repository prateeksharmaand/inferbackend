from __future__ import annotations

import string

# Characters used for prefix expansion (lowercase alpha + digits)
ALPHABET = string.ascii_lowercase + string.digits  # a-z then 0-9

# Single-character seed prefixes for Phase 1
SEED_PREFIXES: list[str] = list(ALPHABET)


def expand_prefix(prefix: str) -> list[str]:
    """Return all one-character extensions of prefix."""
    return [prefix + ch for ch in ALPHABET]


def prefix_depth(prefix: str) -> int:
    """Return the depth of a prefix (1 = single char, 2 = two chars, etc.)."""
    return len(prefix)


def is_leaf(result_count: int, api_limit: int) -> bool:
    """A prefix is a leaf node if results came back under the API limit."""
    return result_count < api_limit


def children_needed(result_count: int, api_limit: int) -> bool:
    """Returns True if we need to expand this prefix further."""
    return result_count >= api_limit


def validate_prefix(prefix: str) -> bool:
    """Ensure prefix only contains valid characters."""
    return bool(prefix) and all(c in ALPHABET for c in prefix.lower())


def normalize_prefix(prefix: str) -> str:
    return prefix.lower().strip()
