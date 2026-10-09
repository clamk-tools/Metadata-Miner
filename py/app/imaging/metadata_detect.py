"""Detecting a metadata pattern from file names, behind the Load images screen's Detect button.

The user labels parts of one sample file name (Well, Site, Channel ...) and this module writes the regular
expression: it reads what the other names have in those places, picks the tightest pattern that fits them,
and keeps enough of the surrounding text for the pattern to match only there. The result is an ordinary
named-group pattern for `metadata_pattern` (`metadata.py`); nothing here runs during a pipeline.

A name is split into **parts** at `_ - . space`, and each part into **runs** (a run is a block of letters, of
digits, or of anything else: `08(fld` is `08`, `(`, `fld`). A **field** is a stretch of the sample from one run
to another, so it follows the same place in the other names even when they differ in length (`B03` / `B3`).
A name with more parts than the sample, because one of its values holds a separator (`Far Red` where the sample
has `Blue`), is compared too when there is only one way to line it up with the sample (`align`).
Everything is plain `re`, so what the screen shows is what a run will give.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache

from app.imaging.metadata import compile_pattern, extract_metadata

COVER = 0.95  # a pattern may leave out 5% of the names (the odd ones) and still count as fitting
# From the tightest pattern to the loosest. "words" = "word", with more words where some names have them (Far Red);
# "list" = the values seen.
MODES = ("shape", "flex", "word", "words", "list")
AUTO_ORDER = ("shape", "flex", "word")  # what "auto" tries, tightest first; then "words" where some names need it
MODE_LABEL = {
    "shape": "same shape", "flex": "flexible", "word": "any word", "words": "several words", "list": "seen values",
}
_RANK = {mode: rank for rank, mode in enumerate(MODES)}
NUMERIC_NAMES = {"Site", "Time", "Z"}  # their letters ("s" in s2) are fixed text, not part of the value
NAME = re.compile(r"[A-Za-z][A-Za-z0-9_]*")
PREVIEW_VALUES = 8  # distinct values listed per field
PREVIEW_ROWS = 8

ALNUM = re.compile(r"[A-Za-z0-9]")
_PART = re.compile(r"[^_\-.\s]+")
_RUN = re.compile(r"[A-Za-z]+|\d+|[^A-Za-z\d]+")
_PREFIXED = re.compile(r"([A-Za-z]+)(\d+)")
_EXTENSION = re.compile(r"tif|tiff|png|jpe?g|nd2|czi|lif|ome|bmp|gif", re.IGNORECASE)
_WELL = re.compile(r"[A-P]\d{1,2}")
# Words that say what the next group is: "fld 4" is a field, "wv Blue" a channel.
_ALIAS = {
    "fld": "Field", "field": "Field", "f": "Field", "site": "Site", "s": "Site", "t": "Time", "tp": "Time",
    "z": "Z", "w": "Channel", "wv": "Channel", "ch": "Channel", "c": "Channel", "plate": "Plate", "p": "Plate",
}


def esc(text: str) -> str:
    """Escapes regex metacharacters only (re.escape would also escape spaces and dashes, which read badly)."""
    return re.sub(r"([.^$*+?{}\[\]\\|()])", r"\\\1", text)


# ---- names, parts and runs ------------------------------------------------------------------------------------


@lru_cache(maxsize=100_000)
def _runs(text: str) -> tuple[str, ...]:
    """Cached: every request reads the same names again, and a plate holds the same few hundred different parts."""
    return tuple(_RUN.findall(text))


def _run_type(run: str) -> str:
    """'d' digits, 'a' letters, 'o' anything else."""
    return "d" if run[0] in "0123456789" else "a" if run[0].isalpha() and run[0].isascii() else "o"


@lru_cache(maxsize=100_000)
def _shape(text: str) -> str:
    return "".join(_run_type(r) for r in _runs(text))


@dataclass
class Part:
    start: int
    end: int
    text: str
    runs: list[tuple[int, int]]  # offsets inside the part
    inner: tuple[str, ...] = ()  # the separators inside it, when it is several parts taken as one (see `align`)


@dataclass
class Parsed:
    text: str
    parts: list[Part]


def _part(name: str, start: int, end: int, inner: tuple[str, ...] = ()) -> Part:
    runs, at = [], 0
    for run in _runs(name[start:end]):
        runs.append((at, at + len(run)))
        at += len(run)
    return Part(start, end, name[start:end], runs, inner)


@lru_cache(maxsize=100_000)
def parse(name: str) -> Parsed:
    """Cached: the names are the same from one request to the next. Nothing changes a Parsed once it is made."""
    return Parsed(name, [_part(name, match.start(), match.end()) for match in _PART.finditer(name)])


def _separators(parsed: Parsed) -> list[str]:
    """The text between each part and the next."""
    return [parsed.text[a.end:b.start] for a, b in zip(parsed.parts, parsed.parts[1:])]


@lru_cache(maxsize=100_000)
def align(name: str, sample_name: str, fixed: tuple[str | None, ...], shapes: tuple[str | None, ...]) -> Parsed | None:
    """`name`, which has more parts than the sample, cut the way the sample is: some neighbouring parts are taken
    as one (`Far` and `Red` where the sample has `Blue`), so that the separators between the parts are the
    sample's. `fixed[j]` is the text part j must have (a word every name shares, like `wv`) and `shapes[j]` the
    shape it must have when it is a single part of the name. None unless there is exactly one way to do it: a name
    that could be cut two ways (`plate1_extra_B03` against `plate1_B03`) is left out rather than guessed at.
    Cached like `parse`: every request lines the same names up with the same sample.
    """
    other, sample = parse(name), parse(sample_name)
    n, m = len(sample.parts), len(other.parts)
    want, have = _separators(sample), _separators(other)

    def fits(rules: tuple[str | None, ...], j: int, first: int, last: int) -> bool:
        text = other.text[other.parts[first].start:other.parts[last].end]
        if rules[j] is not None:
            return text == rules[j]
        return last > first or shapes[j] is None or _shape(text) == shapes[j]

    def ways(rules: tuple[str | None, ...], j: int, first: int, seen: dict[tuple[int, int], int]) -> int:
        """How many ways (2 = several) parts `first`... of `other` make parts `j`... of the sample."""
        if (j, first) not in seen:
            if j == n - 1:
                count = 1 if fits(rules, j, first, m - 1) else 0
            else:
                count = 0
                for last in range(first, m - n + j + 1):  # leaves a part of `other` for each part that follows
                    if have[last] == want[j] and fits(rules, j, first, last):
                        count += ways(rules, j + 1, last + 1, seen)
                        if count > 1:
                            break
            seen[(j, first)] = min(count, 2)
        return seen[(j, first)]

    for rules in (fixed, (None,) * n):  # the shared words first; without them when they leave no way at all
        seen: dict[tuple[int, int], int] = {}
        found = ways(rules, 0, 0, seen)
        if found > 1:
            return None
        if found == 0:
            continue
        parts, first = [], 0
        for j in range(n):
            last = m - 1 if j == n - 1 else next(
                e for e in range(first, m - n + j + 1)
                if have[e] == want[j] and fits(rules, j, first, e) and ways(rules, j + 1, e + 1, seen)
            )
            if last == first:
                parts.append(other.parts[first])
            else:
                parts.append(_part(other.text, other.parts[first].start, other.parts[last].end, tuple(have[first:last])))
            first = last + 1
        return Parsed(other.text, parts)
    return None


def tokens(parsed: Parsed) -> list[dict]:
    """The sample cut into runs and the separators between them: what a drag can snap to on the screen."""
    out: list[dict] = []
    at = 0
    for index, part in enumerate(parsed.parts):
        if part.start > at:
            out.append({"start": at, "end": part.start, "text": parsed.text[at:part.start], "sep": True, "seg": None, "k": None})
        for k, (a, b) in enumerate(part.runs):
            out.append({"start": part.start + a, "end": part.start + b, "text": part.text[a:b], "sep": False, "seg": index, "k": k})
        at = part.end
    if at < len(parsed.text):
        out.append({"start": at, "end": len(parsed.text), "text": parsed.text[at:], "sep": True, "seg": None, "k": None})
    return out


# ---- fields ---------------------------------------------------------------------------------------------------


@dataclass
class Field:
    """A stretch of the sample from run `k0` of part `s_seg` to run `k1` of part `e_seg`. `s0` / `e1` mean "from
    the start of the part" / "to the end of the part" and follow the part when the sample is another name.
    `mode` is the pattern style the user chose, unless `auto`."""

    name: str
    s_seg: int
    k0: int
    e_seg: int
    k1: int
    s0: bool
    e1: bool
    prefix: bool
    auto: bool = True
    mode: str = "shape"

    @classmethod
    def from_wire(cls, raw: dict) -> "Field":
        try:
            name = str(raw["name"])
            field = cls(
                name=name, s_seg=int(raw["s_seg"]), k0=int(raw["k0"]), e_seg=int(raw["e_seg"]), k1=int(raw["k1"]),
                s0=bool(raw["s0"]), e1=bool(raw["e1"]), prefix=bool(raw.get("prefix", name in NUMERIC_NAMES)),
                auto=bool(raw.get("auto", True)), mode=str(raw.get("mode", "shape")),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"malformed field {raw!r}: {exc}") from exc
        check_name(field.name)
        if field.mode not in MODES:
            raise ValueError(f"unknown pattern style '{field.mode}'")
        return field

    def to_wire(self) -> dict:
        return {
            "name": self.name, "s_seg": self.s_seg, "k0": self.k0, "e_seg": self.e_seg, "k1": self.k1,
            "s0": self.s0, "e1": self.e1, "prefix": self.prefix, "auto": self.auto, "mode": self.mode,
        }


def check_name(name: str) -> str:
    if not NAME.fullmatch(name):
        raise ValueError(f"'{name}' is not a usable field name: start with a letter, then letters, digits or _")
    return name


def resolve(field: Field, parsed: Parsed) -> tuple[int, int] | None:
    """Where `field` sits in `parsed` as (start, end), or None when this name has no such run."""
    parts = parsed.parts
    if field.s_seg >= len(parts) or field.e_seg >= len(parts):
        return None
    first, last = parts[field.s_seg], parts[field.e_seg]
    k0 = _word_bounds(first)[0] if field.s0 else field.k0
    k1 = _word_bounds(last)[1] if field.e1 else field.k1
    if k0 >= len(first.runs) or not 0 <= k1 < len(last.runs):
        return None
    start, end = first.start + first.runs[k0][0], last.start + last.runs[k1][1]
    return (start, end) if end > start else None


def whole_part(name: str, sample: Parsed, index: int) -> Field:
    first, last = _word_bounds(sample.parts[index])
    return new_field(name, sample, index, first, index, last)


def _word_bounds(part: Part) -> tuple[int, int]:
    """The first and last run of the part that are letters or digits: the brackets around `(08)` are not part
    of the value, so "to the end of the part" means to its last letters or digits."""
    found = part.__dict__.get("_bounds")  # worked out once per part: a field asks for it once per name
    if found is None:
        words = [k for k, (a, b) in enumerate(part.runs) if _run_type(part.text[a:b]) != "o"]
        found = part.__dict__["_bounds"] = (words[0], words[-1]) if words else (0, len(part.runs) - 1)
    return found


def new_field(name: str, sample: Parsed, s_seg: int, k0: int, e_seg: int, k1: int) -> Field:
    return Field(
        name=check_name(name), s_seg=s_seg, k0=k0, e_seg=e_seg, k1=k1,
        s0=k0 == _word_bounds(sample.parts[s_seg])[0], e1=k1 == _word_bounds(sample.parts[e_seg])[1],
        prefix=name in NUMERIC_NAMES,
    )


# ---- what the folder's names say ------------------------------------------------------------------------------


class Context:
    """The folder's parsed names, which one is the sample, and the options; caches what is asked of every name."""

    def __init__(self, names: list[str], index: int, generalize: bool, anchor: bool):
        self.parsed = [parse(n) for n in names]
        self.index = index
        self.generalize = generalize
        self.anchor = anchor
        self._varies: dict[int, bool] = {}
        self._letters: dict[tuple[int, int], list[str]] = {}
        self._layout: list[Parsed] | None = None
        self._lined_up: dict[int, Parsed] = {}  # by index: the names with more parts, cut the way the sample is
        self._inner: dict[int, tuple[str, ...]] = {}
        self._observed: dict[tuple, list[str | None]] = {}

    @property
    def sample(self) -> Parsed:
        return self.parsed[self.index]

    @property
    def same_layout(self) -> list[Parsed]:
        """The names a field can be compared across: those with as many parts as the sample, and those with more
        parts that line up with it in exactly one way (`align`), cut the way the sample is."""
        if self._layout is None:
            n = len(self.sample.parts)
            if all(len(p.parts) <= n for p in self.parsed):
                self._layout = [p for p in self.parsed if len(p.parts) == n]
                return self._layout
            plain = [p for p in self.parsed if len(p.parts) == n]
            fixed: list[str | None] = []
            shapes: list[str | None] = []
            for j, part in enumerate(self.sample.parts):
                same_text = len(plain) > 1 and all(p.parts[j].text == part.text for p in plain)
                same_shape = all(_shape(p.parts[j].text) == _shape(part.text) for p in plain)
                fixed.append(part.text if same_text else None)
                shapes.append(_shape(part.text) if same_shape else None)
            rules = tuple(fixed), tuple(shapes)
            layout = []
            for index, p in enumerate(self.parsed):
                found = p if len(p.parts) == n else align(p.text, self.sample.text, *rules) if len(p.parts) > n else None
                if found is not None:
                    layout.append(found)
                    if found is not p:
                        self._lined_up[index] = found
            self._layout = layout
        return self._layout

    def lined_up(self, index: int) -> Parsed | None:
        """Name `index` cut the way the sample is, when it has more parts than the sample and lines up with it."""
        return self._lined_up.get(index) if self.same_layout else None

    def inner(self, first: int, last: int | None = None) -> tuple[str, ...]:
        """The separators some names hold inside parts `first` to `last` (the space of `Far Red`), longest first."""
        lined_up = self._lined_up.values() if self.same_layout else ()  # only these hold a separator in a part
        seen: set[str] = set()
        for seg in range(first, (first if last is None else last) + 1):
            if seg not in self._inner:
                self._inner[seg] = tuple({sep for p in lined_up for sep in p.parts[seg].inner})
            seen.update(self._inner[seg])
        return tuple(sorted(seen, key=lambda sep: (-len(sep), sep)))

    def observed(self, field: Field) -> list[str | None]:
        """What `field` holds in every name laid out like the sample (None where the name has no such run).
        Cached: one request asks this of the same field several times."""
        key = (field.s_seg, field.k0, field.e_seg, field.k1, field.s0, field.e1)
        if key not in self._observed:
            # inside one part, the value depends on that part's text only, and a folder has few different ones
            one_part = field.s_seg == field.e_seg < len(self.sample.parts)
            seen: dict[str, str | None] = {}
            values: list[str | None] = []
            for p in self.same_layout:
                where = p.parts[field.s_seg].text if one_part else p.text
                if where not in seen:
                    found = resolve(field, p)
                    seen[where] = p.text[found[0]:found[1]] if found else None
                values.append(seen[where])
            self._observed[key] = values
        return self._observed[key]

    def varies(self, seg: int) -> bool:
        """True when the part is built differently in some names (FITC) vs Cy5)), so it can only be matched loosely."""
        if seg not in self._varies:
            mine = _shape(self.sample.parts[seg].text)
            self._varies[seg] = any(_shape(p.parts[seg].text) != mine for p in self.same_layout)
        return self._varies[seg]

    def letters_seen(self, seg: int, k: int) -> list[str]:
        """The text of run `k` of part `seg` across the names that have it, sample first."""
        if (seg, k) not in self._letters:
            sample = self.sample.parts[seg]
            seen = [sample.text[sample.runs[k][0]:sample.runs[k][1]]]
            for p in self.same_layout:
                if k < len(p.parts[seg].runs):
                    a, b = p.parts[seg].runs[k]
                    seen.append(p.parts[seg].text[a:b])
            self._letters[(seg, k)] = seen
        return self._letters[(seg, k)]


# ---- patterns -------------------------------------------------------------------------------------------------


def _same_runs(core: str, observed: list[str]) -> list[tuple[str, ...]]:
    shape = _shape(core)
    return [_runs(v) for v in observed if _shape(v) == shape]


def _letter_class(values: list[str], plus: bool) -> str:
    cls = "[A-Z]" if all(v.isupper() for v in values) else "[a-z]" if all(v.islower() for v in values) else "[A-Za-z]"
    return cls + ("+" if plus else "")


def _more(inner: tuple[str, ...], word: str) -> str:
    """What lets `word` repeat across the separators in `inner` (`Far Red` where the sample has `Blue`)."""
    if not inner:
        return ""
    between = esc(inner[0]) if len(inner) == 1 else "(?:" + "|".join(esc(sep) for sep in inner) + ")"
    return f"(?:{between}{word})*"


def core_pattern(mode: str, core: str, observed: list[str], inner: tuple[str, ...] = ()) -> str:
    """The pattern for a field's value (`core`), written from what `observed` (the values the other names have
    there) says it looks like elsewhere. `inner` holds the separators some names have inside the value: only the
    "words" style reads those."""
    runs = _runs(core)
    if mode in ("word", "words"):  # every group of letters or digits is any word; spaces, dashes, brackets stay
        more = _more(inner, "[A-Za-z0-9]+") if mode == "words" else ""
        out, in_word = [], False
        for run in runs:
            if _run_type(run) == "o":
                out.append(esc(run))
                in_word = False
            elif not in_word:
                out.append("[A-Za-z0-9]+" + more)
                in_word = True
        return "".join(out)
    if mode == "list":
        values = sorted(set(observed), key=lambda v: (-len(v), v))
        return "(?:" + "|".join(esc(v) for v in values) + ")" if values else esc(core)

    same = _same_runs(core, observed)
    out = []
    for i, run in enumerate(runs):
        kind = _run_type(run)
        if kind == "o":
            out.append(esc(run))
        elif mode == "flex":
            out.append(r"\d+" if kind == "d" else _letter_class([x[i] for x in same] or [run], plus=True))
        elif kind == "d":
            out.append(r"\d+" if len(run) == 1 else rf"\d{{{len(run)}}}")
        elif len(run) > 1 and same and all(x[i] == run for x in same):
            out.append(esc(run))  # a word every name has ("plate") stays as it is; a lone letter is a variable
        else:
            cls = _letter_class([run], plus=False)
            out.append(cls if len(run) == 1 else f"{cls}{{{len(run)}}}")
    return "".join(out)


def _token_pattern(ctx: Context, token: dict) -> str:
    """Unlabeled text around a field: separators stay as they are, letters stay when every name agrees and
    become a class when they vary, digits become \\d+ when the option is on."""
    if token["sep"]:
        return esc(token["text"])
    kind = _run_type(token["text"])
    if kind == "d":
        return r"\d+" if ctx.generalize else esc(token["text"])
    if kind != "a":
        return esc(token["text"])
    seen = ctx.letters_seen(token["seg"], token["k"])
    if all(v == token["text"] for v in seen):
        return esc(token["text"])
    return _letter_class(seen, plus=True)


def _gap_pattern(ctx: Context, start: int, end: int) -> str:
    out, done = [], set()
    for token in tokens(ctx.sample):
        if token["end"] <= start or token["start"] >= end:
            continue
        if not token["sep"] and ctx.varies(token["seg"]):
            if token["seg"] in done:
                continue  # the loose pattern for this part already covers what follows
            if ALNUM.match(token["text"]):
                done.add(token["seg"])
                out.append(r"[^_\-.\s]+" + _more(ctx.inner(token["seg"]), r"[^_\-.\s]+"))
                continue
        out.append(_token_pattern(ctx, token))
    return "".join(out)


@dataclass
class Item:
    """A field analysed against the sample and the folder."""

    field: Field
    start: int
    end: int
    text: str
    eligible: bool  # the text is letters then digits, so the letters can be left out of the value ("s2")
    prefix_text: str
    prefix_lit: str  # the letters kept as fixed text (empty unless the field skips them)
    core: str
    mode: str  # the pattern style in use
    fit: str  # the tightest style that fits the sample and most names
    pattern: str
    patterns: dict[str, str]
    covers: dict[str, int]
    total: int
    fits: bool  # the pattern in use matches the sample's own value


def analyze(ctx: Context, fields: list[Field]) -> list[Item]:
    items = []
    for field in fields:
        found = resolve(field, ctx.sample)
        assert found is not None, f"field {field.name} does not sit in the sample"
        start, end = found
        text = ctx.sample.text[start:end]
        prefixed = _PREFIXED.fullmatch(text)
        use_prefix = field.prefix and prefixed is not None
        prefix_lit = prefixed.group(1) if use_prefix else ""
        core = prefixed.group(2) if use_prefix else text

        counts: Counter[str] = Counter()  # each value seen, with how many names have it: a folder has few of them
        for value, times in Counter(ctx.observed(field)).items():
            if value is not None and use_prefix:
                other = _PREFIXED.fullmatch(value)
                value = other.group(2) if other and other.group(1) == prefix_lit else None
            if value is not None:
                counts[value] += times

        total = len(ctx.same_layout)
        inner = ctx.inner(field.s_seg, field.e_seg)
        seen = list(counts)
        patterns = {mode: core_pattern(mode, core, seen, inner) for mode in MODES}
        covers = {}
        for mode, pattern in patterns.items():
            if mode == "words" and pattern == patterns["word"]:  # no name holds several words here: nothing to recount
                covers[mode] = covers["word"]
            elif mode == "list":  # written from these very values, so it reads them all
                covers[mode] = sum(counts.values())
            else:
                compiled = re.compile(pattern)
                covers[mode] = sum(times for value, times in counts.items() if compiled.fullmatch(value))

        fit, best = None, None
        for mode in AUTO_ORDER + (("words",) if inner else ()):
            if not re.fullmatch(patterns[mode], core):
                continue
            if covers[mode] / total >= COVER:
                fit = mode
                break
            if best is None or covers[mode] > covers[best]:
                best = mode  # nothing reaches the threshold: the style that covers the most, the tightest on a tie
        fit = fit or best or "word"
        mode = fit if field.auto else field.mode
        items.append(Item(
            field=field, start=start, end=end, text=text, eligible=prefixed is not None,
            prefix_text=prefixed.group(1) if prefixed else "", prefix_lit=prefix_lit, core=core, mode=mode, fit=fit,
            pattern=patterns[mode], patterns=patterns, covers=covers, total=total,
            fits=re.fullmatch(patterns[mode], core) is not None,
        ))
    items.sort(key=lambda item: item.start)
    return items


def _part_at(sample: Parsed, pos: int) -> int:
    return next(i for i, part in enumerate(sample.parts) if part.start <= pos < part.end)


def misread(pattern: str, items: list[Item], sample: str) -> list[tuple[Item, str | None]]:
    """The fields the pattern does not read where they were labeled in the sample, with what it reads instead. A
    pattern is looked for anywhere in a name (`extract_metadata`), so loose text around the labels can make it match
    earlier in the name than the labels are (`s1_s2_s3`, labeling the last 3)."""
    match = re.search(pattern, sample) if pattern else None
    wrong = []
    for item in items:
        span = match.span(item.field.name) if match else (-1, -1)
        if span != (item.start + len(item.prefix_lit), item.end):
            wrong.append((item, match.group(item.field.name) if match else None))
    return wrong


def build_pattern(ctx: Context, items: list[Item]) -> list[tuple[str, str | None]]:
    """The pattern as (text, field name or None) pieces, so the screen can colour each group. With `anchor`, a
    pattern that would read the sample somewhere else than its labels is tied to the start of the name (`^`), and
    if that is not enough to its end too (`$`). When neither reads the sample right (two loose stretches in one
    part, where nothing tells where one ends), the anchored pattern is kept and `detect` says so in a note."""
    pieces = _pieces(ctx, items)
    if ctx.anchor and misread("".join(text for text, _ in pieces), items, ctx.sample.text):
        for to_end in (False, True):
            tied = [("^", None)] + _pieces(ctx, items, from_start=True, to_end=to_end) + ([("$", None)] if to_end else [])
            if not misread("".join(text for text, _ in tied), items, ctx.sample.text):
                return tied
    return pieces


def _pieces(ctx: Context, items: list[Item], from_start: bool = False, to_end: bool = False) -> list[tuple[str, str | None]]:
    if not items:
        return []
    sample = ctx.sample
    first, last = items[0], items[-1]
    first_part, last_part = _part_at(sample, first.start), _part_at(sample, last.end - 1)
    start, end = sample.parts[first_part].start, sample.parts[last_part].end
    # anchor: keep the whole neighbouring part on each side, so the pattern cannot match somewhere else in the name
    if ctx.anchor and first_part > 0:
        start = sample.parts[first_part - 1].start
    if ctx.anchor and last_part < len(sample.parts) - 1 and not _EXTENSION.fullmatch(sample.parts[last_part + 1].text):
        end = sample.parts[last_part + 1].end
    if from_start:
        start = 0
    if to_end:
        end = len(sample.text)

    pieces: list[tuple[str, str | None]] = []
    if first.start > start:
        pieces.append((_gap_pattern(ctx, start, first.start), None))
    for i, item in enumerate(items):
        if i:
            pieces.append((_gap_pattern(ctx, items[i - 1].end, item.start), None))
        if item.prefix_lit:
            pieces.append((esc(item.prefix_lit), None))
        pieces.append((f"(?P<{item.field.name}>{item.pattern})", item.field.name))
    if last.end < end:
        pieces.append((_gap_pattern(ctx, last.end, end), None))
    return [piece for piece in pieces if piece[0]]


# ---- editing the fields ---------------------------------------------------------------------------------------


def add_field(ctx: Context, fields: list[Field], name: str, start: int, end: int) -> list[Field]:
    """Labels the stretch [start, end) of the sample. Every run the stretch touches is included, so its ends
    snap to whole groups of letters or digits. A field already there, or already called `name`, is replaced."""
    check_name(name)
    touched = [t for t in tokens(ctx.sample) if not t["sep"] and t["end"] > start and t["start"] < max(end, start + 1)]
    if not touched:
        raise ValueError("select part of the name (letters or digits), not just a separator")
    first, last = touched[0], touched[-1]
    kept = []
    for field in fields:
        found = resolve(field, ctx.sample)
        overlaps = found is not None and found[0] < last["end"] and found[1] > first["start"]
        if not overlaps and field.name != name:
            kept.append(field)
    kept.append(new_field(name, ctx.sample, first["seg"], first["k"], last["seg"], last["k"]))
    return kept


def suggest_fields(ctx: Context) -> list[Field]:
    """Fields proposed from what varies across the names: a part that looks like a well, a site, a channel
    name ..., or, inside a part that is none of those, one group of letters or digits at a time."""
    sample = ctx.sample
    n = len(sample.parts)
    sample_tokens = tokens(sample)

    def share(counts: Counter[str], pattern: re.Pattern) -> float:
        """`counts` holds each value with how many names have it: a folder has few different ones."""
        return sum(times for v, times in counts.items() if pattern.fullmatch(v)) / sum(counts.values()) if counts else 0.0

    def previous_word(seg: int, k: int) -> str:
        at = next(i for i, t in enumerate(sample_tokens) if not t["sep"] and t["seg"] == seg and t["k"] == k)
        return next((t["text"] for t in reversed(sample_tokens[:at]) if not t["sep"] and ALNUM.search(t["text"])), "")

    known = (  # (label, pattern, rank): a whole part of this shape is that field
        ("Well", _WELL, 1), ("Site", re.compile(r"[sf]\d+", re.I), 1), ("Time", re.compile(r"t\d+", re.I), 1),
        ("Z", re.compile(r"z\d+", re.I), 1), ("Plate", re.compile(r"(plate|p)\d+", re.I), 1),
        ("Channel", re.compile(r"[wc]\d+", re.I), 3),
    )
    word = r"[A-Za-z][A-Za-z0-9]{2,}"
    candidates: list[tuple[int, int, int, str, Field]] = []  # rank, part, run, label, field
    numbered = 0

    for c in range(n):
        values = Counter(p.parts[c].text for p in ctx.same_layout)
        distinct = Counter(values.keys())  # each value once
        if len(distinct) < 2 or share(distinct, _EXTENSION) == 1:
            continue
        label, rank = None, 0
        for name, pattern, rank_ in known:
            if share(values, pattern) >= COVER:
                label, rank = name, rank_
                break
        else:
            if len(distinct) <= 12 and share(distinct, re.compile(word + _more(ctx.inner(c), word))) >= COVER:
                label, rank = "Channel", 2
        if label:
            candidates.append((rank, c, 0, label, whole_part(label, sample, c)))
            continue
        if ctx.varies(c):
            continue  # its letters and digits fall in different places from name to name (a GUID): runs don't line up
        for k, (a, b) in enumerate(sample.parts[c].runs):
            probe = new_field("x", sample, c, k, c, k)
            seen = Counter(v for v in ctx.observed(probe) if v is not None)
            kind = _run_type(sample.parts[c].text[a:b])
            if len(seen) < 2 or kind == "o":
                continue
            names = sum(seen.values())
            if len(seen) > 0.5 * names and names >= 8:
                continue  # almost every name has its own value: an identifier, not something to label
            before = previous_word(c, k)
            alias, rank = _ALIAS.get(before.lower()), 1
            if kind == "a" and share(seen, re.compile(r"[A-P]")) >= COVER:
                label = "Row"
            elif alias:
                label = alias
            elif kind == "d" and re.fullmatch(r"[A-Z]", before):
                label = "Column"
            else:
                numbered += 1
                label, rank = f"Part{numbered}", 4
            candidates.append((rank, c, k, label, new_field(label, sample, c, k, c, k)))

    candidates.sort(key=lambda cand: cand[:3])
    accepted: list[tuple[int, int, int, str, Field]] = []
    for cand in candidates:
        if any(a[3] == cand[3] for a in accepted):
            continue
        mine = ctx.observed(cand[4])
        redundant = False
        for other in accepted:
            theirs = ctx.observed(other[4])
            pairs = set(zip(mine, theirs))
            if len(pairs) == len(set(mine)) == len(set(theirs)):
                redundant = True  # one always comes with the other (Blue / FITC): a second label adds nothing
                break
        if not redundant:
            accepted.append(cand)
    accepted.sort(key=lambda cand: (cand[1], cand[2]))
    return [cand[4] for cand in accepted]


def remap(old: Context, new: Context, fields: list[Field]) -> tuple[list[Field], list[str]]:
    """Carries `fields` from one sample to another. Fields that have no such run in the new name are dropped.
    A pattern that would no longer fit the new name, or the one the field was made on, is widened to the
    tightest style that fits both, and stays widened."""
    notes: list[str] = []
    if len(old.sample.parts) != len(new.sample.parts):
        if fields:
            notes.append("This name has a different number of parts, so the labels were cleared.")
        return [], notes
    fields = [f for f in fields if resolve(f, old.sample) is not None]
    before = {item.field.name: item for item in analyze(old, fields)}
    kept = [f for f in fields if resolve(f, new.sample) is not None]
    if len(kept) < len(fields):
        notes.append(f"{len(fields) - len(kept)} label(s) did not fit this name and were removed.")
    for item in analyze(new, kept):
        earlier = before[item.field.name]
        if item.fits and re.fullmatch(item.pattern, earlier.core):
            if earlier.pattern != item.pattern:  # it still fits both, but is now read from this name's shape
                notes.append(f"{item.field.name} now reads {item.pattern}, which fits {item.text} and {earlier.text}.")
            continue
        pick = "word"
        for mode in AUTO_ORDER:
            pattern = item.patterns[mode]
            if _RANK[mode] >= _RANK[earlier.mode] and re.fullmatch(pattern, item.core) and re.fullmatch(pattern, earlier.core):
                pick = mode
                break
        item.field.auto, item.field.mode = False, pick
        notes.append(f"Widened {item.field.name} to “{MODE_LABEL[pick]}” so it fits both {earlier.text} and {item.text}.")
    return kept, notes


def widen(ctx: Context, index: int, fields: list[Field]) -> tuple[list[Field], list[str]] | None:
    """Fits `fields` to name `index` without making it the sample: for a name with more parts than the sample (a
    value in several words), whose own parts cannot carry the labels. None when the name is not one of those, or
    when the pattern reads it already. A field that does not fit its value there is widened to the tightest style
    that fits both, and stays widened."""
    target = ctx.lined_up(index)
    if target is None:
        return None
    fields = [f for f in fields if resolve(f, ctx.sample) is not None]
    items = analyze(ctx, fields)
    pattern = "".join(text for text, _ in build_pattern(ctx, items))
    if not pattern or re.search(pattern, target.text):
        return None
    notes = [f"{target.text} holds a value in several words, so {ctx.sample.text} stays the sample."]
    for item in items:
        found = resolve(item.field, target)
        value = target.text[found[0]:found[1]] if found else None
        if value is not None and item.prefix_lit:
            other = _PREFIXED.fullmatch(value)
            value = other.group(2) if other and other.group(1) == item.prefix_lit else None
        if value is None or re.fullmatch(item.pattern, value):
            continue
        pick = "list"
        for mode in AUTO_ORDER + ("words",):
            pattern = item.patterns[mode]
            if _RANK[mode] >= _RANK[item.mode] and re.fullmatch(pattern, value) and re.fullmatch(pattern, item.core):
                pick = mode
                break
        item.field.auto, item.field.mode = False, pick
        notes.append(f"Widened {item.field.name} to “{MODE_LABEL[pick]}” so it fits both {item.text} and {value}.")
    return fields, notes


# ---- the answer -----------------------------------------------------------------------------------------------


def _natural(value: str) -> list:
    return [int(p) if i % 2 else p for i, p in enumerate(re.split(r"(\d+)", value))]  # the odd ones are the digits


def _kind(values: list[str]) -> str:
    if not values:
        return ""
    if all(v.isdigit() for v in values):
        return "int"
    return "well" if all(_WELL.fullmatch(v) for v in values) else "text"


def _hint(name: str, kind: str, distinct: int) -> str | None:
    if name == "Well" and kind not in ("well", ""):
        return "These do not look like well names (A01 style)."
    if name in NUMERIC_NAMES and kind not in ("int", ""):
        return "Expected whole numbers here."
    if name == "Site" and distinct >= 50:
        return "That many distinct values usually means wells, not sites."
    if name == "Channel" and distinct > 12:
        return "That many channels? This may be a well or a site."
    return None


def detect(
    names: list[str],
    *,
    sample_index: int = 0,
    from_index: int | None = None,
    fields: list[dict] | None = None,
    add: dict | None = None,
    remove: str | None = None,
    rename: dict | None = None,
    edit: dict | None = None,
    suggest: bool = False,
    generalize: bool = True,
    anchor: bool = True,
) -> dict:
    """One step of the Detect screen. `fields` are those the screen holds (as this function returned them);
    at most one of `suggest`, `add` ({name, start, end}), `remove` (a name), `rename` ({from, to}) and `edit`
    ({name, mode, prefix}) is applied, and `from_index` says which name the fields were made on when the
    sample has just changed. (A name with more parts than that one, which the pattern does not read, does not
    become the sample: the fields are widened to fit it and the sample stays, see `widen`.) Returns the sample,
    the fields with how each pattern fares, the pattern, and what it gives for the folder. Raises ValueError
    with a message for the user when the request cannot be met.
    """
    if not names:
        raise ValueError("there are no image names to learn from")
    index = min(max(sample_index, 0), len(names) - 1)
    ctx = Context(names, index, generalize, anchor)
    if not ctx.sample.parts:
        raise ValueError(f"'{ctx.sample.text}' has no letters or digits to label")

    current = [Field.from_wire(raw) for raw in fields or []]
    notes: list[str] = []
    if from_index is not None and from_index != index and 0 <= from_index < len(names):
        before = Context(names, from_index, generalize, anchor)
        widened = widen(before, index, current)
        if widened is not None:
            ctx, index = before, from_index
            current, notes = widened
        else:
            current, notes = remap(before, ctx, current)
    else:
        current = [f for f in current if resolve(f, ctx.sample) is not None]

    if suggest:
        current = suggest_fields(ctx)
        if not current:
            notes.append("Nothing varies across these names, so there is nothing to suggest.")
    elif add:
        current = add_field(ctx, current, str(add.get("name", "")).strip(), int(add["start"]), int(add["end"]))
    elif remove is not None:
        current = [f for f in current if f.name != remove]
    elif rename:
        old, new = str(rename.get("from", "")), check_name(str(rename.get("to", "")).strip())
        if new != old and any(f.name == new for f in current):
            raise ValueError(f"there is already a field called {new}")
        for f in current:
            if f.name == old:
                f.name = new
    elif edit:
        for f in current:
            if f.name == edit.get("name"):
                if "mode" in edit:
                    if edit["mode"] != "auto" and edit["mode"] not in MODES:
                        raise ValueError(f"unknown pattern style '{edit['mode']}'")
                    f.auto = edit["mode"] == "auto"
                    f.mode = f.mode if f.auto else edit["mode"]
                if "prefix" in edit:
                    f.prefix = bool(edit["prefix"])

    items = analyze(ctx, current)
    pieces = build_pattern(ctx, items)
    pattern = "".join(text for text, _ in pieces)
    for item, got in misread(pattern, items, ctx.sample.text):
        notes.append(
            f"In this name the pattern reads {item.field.name} as {got if got is not None else 'nothing'}, not "
            f"{item.text[len(item.prefix_lit):]}: it matches at another place in the name. "
            + ("Tick “Anchor with the neighbouring part on each side” to keep it in place." if not ctx.anchor
               else "Label the parts around it, or choose a tighter style, to pin it down.")
        )

    groups: list[dict | None] = []
    if pattern:
        compiled = compile_pattern(pattern)
        groups = [extract_metadata(compiled, name) for name in names]
    matched = [i for i, g in enumerate(groups) if g is not None]
    unmatched = [i for i, g in enumerate(groups) if g is None]

    out_fields = []
    for item in items:
        values = sorted({g[item.field.name] for g in groups if g and g.get(item.field.name) is not None}, key=_natural)
        kind = _kind(values)
        out_fields.append({
            **item.field.to_wire(), "start": item.start, "end": item.end, "text": item.text, "mode_used": item.mode,
            "fit": item.fit, "eligible": item.eligible, "prefix_text": item.prefix_text, "covers": item.covers,
            "total": item.total, "pattern": item.pattern, "fits": item.fits, "distinct": len(values),
            "values": values[:PREVIEW_VALUES], "type": kind, "hint": _hint(item.field.name, kind, len(values)),
        })
    return {
        "sample": ctx.sample.text,
        "sample_index": index,
        "total": len(names),
        "tokens": tokens(ctx.sample),
        "fields": out_fields,
        "pattern": pattern,
        "pieces": [{"text": text, "field": field} for text, field in pieces],
        "matched": len(matched),
        "unmatched_count": len(unmatched),
        "unmatched": [{"index": i, "name": names[i]} for i in unmatched[:PREVIEW_ROWS]],
        "rows": [{"index": i, "name": names[i], "values": groups[i]} for i in matched[:PREVIEW_ROWS]],
        "notes": notes,
    }
