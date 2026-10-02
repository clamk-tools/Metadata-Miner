"""Regex-based metadata extraction from file names, CellProfiler style.

CellProfiler's Metadata module pulls plate/well/site/channel tags out of file
names with a named-group regex (e.g. `(?P<Well>[A-Z][0-9]{2})_s(?P<Site>\\d+)`).
These are the two functions of HC-Flow's `metadata.py` that Detect uses.
"""
from __future__ import annotations

import re


def compile_pattern(pattern: str) -> re.Pattern:
    """Compiles `pattern`, requiring at least one named group.

    Raises ValueError (not re.error) so callers can show it as a message.
    """
    try:
        compiled = re.compile(pattern)
    except re.error as exc:
        raise ValueError(f"invalid regular expression: {exc}") from exc
    if not compiled.groupindex:
        raise ValueError(
            "pattern must contain at least one named group, e.g. (?P<Well>[A-Z][0-9]{2})"
        )
    return compiled


def extract_metadata(compiled: re.Pattern, text: str) -> dict[str, str] | None:
    """The named groups from the first match of `compiled` in `text`, or None."""
    match = compiled.search(text)
    return match.groupdict() if match else None
