"""The engine (engine.py): learning a metadata pattern from a labeled sample file name, through `detect()`.

What the page adds around it (glue.py) is tested in test_glue.py.
"""
import re
import uuid

import pytest

from engine import detect


def _plate_names():
    """2 plates x 24 wells x 3 sites x 3 channels, plus three odd names that do not follow the layout."""
    names = [
        f"plate{p}_{row}{col:02d}_s{site}_w{w}_{dye}.tif"
        for p in (1, 2) for row in "ABCD" for col in range(1, 7) for site in (1, 2, 3)
        for w, dye in (("1", "DAPI"), ("2", "GFP"), ("3", "Cy5"))
    ]
    return names + ["plate1_B3_s2_w1_DAPI.tif", "plate1_C7_s10_w1_DAPI.tif", "plate1_ctrl_s1_w2_GFP.tif"]


def _fitc_names():
    """The style of 'A - 08(fld 4 wv Blue - FITC).tif': spaces, dashes, brackets, a dye named after the colour."""
    chans = (("Blue", "FITC"), ("Green", "dsRed"), ("Red", "Cy5"))
    return [
        f"{row} - {col:02d}(fld {fld} wv {colour} - {dye}).tif"
        for row in "ABC" for col in range(1, 13) for fld in range(1, 5) for colour, dye in chans
    ]


PLATES = _plate_names()
CLEAN = PLATES[:-3]  # without the odd names: every name follows the layout
B03 =PLATES.index("plate1_B03_s2_w1_DAPI.tif")


def _fields(result):
    return {f["name"]: f for f in result["fields"]}


def _label(names, sample, *labels, **options):
    """Labels each (text, name) on the sample by the first place the text occurs in it, one request at a time
    like the screen does. `text` may span several parts ("B03_s2")."""
    index = names.index(sample) if isinstance(sample, str) else sample
    text, fields, result = names[index], [], None
    for target, name in labels:
        start = text.index(target)
        result = detect(names, sample_index=index, fields=fields, add={"name": name, "start": start, "end": start + len(target)}, **options)
        fields = result["fields"]
    return result


def _values(result, name):
    return [row["values"][name] for row in result["rows"]]


def _plate(**options):
    """The plate's sample labeled part by part, as a user would: Plate, Well, Site, Channel."""
    return _label(PLATES, B03, ("plate1", "Plate"), ("B03", "Well"), ("s2", "Site"), ("DAPI", "Channel"), **options)


# ---- a whole folder ------------------------------------------------------------------------------------------


def test_nothing_is_labeled_until_the_user_labels_it():
    result = detect(PLATES, sample_index=B03)

    assert result["fields"] == [] and result["pattern"] == "" and result["notes"] == []
    assert result["sample"] == "plate1_B03_s2_w1_DAPI.tif" and result["tokens"]  # what the screen needs to start


def test_a_plate_labeled_part_by_part_gets_the_pattern_that_reads_it():
    result = _plate()

    assert result["pattern"] == r"(?P<Plate>plate\d+)_(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)_w\d+_(?P<Channel>[A-Za-z0-9]+)"
    assert result["matched"] == 432 and result["unmatched_count"] == 3
    assert {u["name"] for u in result["unmatched"]} == {
        "plate1_B3_s2_w1_DAPI.tif", "plate1_C7_s10_w1_DAPI.tif", "plate1_ctrl_s1_w2_GFP.tif",
    }


def test_the_dye_names_style_with_spaces_dashes_and_brackets_is_read():
    names = _fitc_names()
    text = names[0]  # A - 01(fld 1 wv Blue - FITC).tif
    fld = text.index("fld 1") + 4
    labeled = _label(names, 0, ("A", "Row"), ("01", "Column"), ("Blue", "Channel"))
    result = detect(names, fields=labeled["fields"], add={"name": "Field", "start": fld, "end": fld + 1})

    assert result["matched"] == len(names)
    assert _fields(result)["Channel"]["values"] == ["Blue", "Green", "Red"]
    assert result["rows"][0]["values"] == {"Row": "A", "Column": "01", "Field": "1", "Channel": "Blue"}


# ---- labeling by hand -----------------------------------------------------------------------------------------


def test_the_two_names_from_the_brief_get_a_pattern_that_reads_both():
    names = ["A - 08(fld 4 wv Blue - FITC).tif", "A - 08(fld 4 wv Green - dsRed).tif"]
    sample = names[0]
    result = _label(names, sample, ("A", "Row"), ("08", "Col"), ("4", "Field"), ("Blue - FITC", "Channel"))

    assert result["pattern"] == (
        r"(?P<Row>[A-Z]) - (?P<Col>\d{2})\(fld (?P<Field>\d+) wv (?P<Channel>[A-Za-z]+ - [A-Za-z]+)\)"
    )
    assert result["matched"] == 2
    assert [row["values"]["Channel"] for row in result["rows"]] == ["Blue - FITC", "Green - dsRed"]


def test_a_part_of_a_part_keeps_its_surroundings_as_context():
    start = CLEAN[B03].index("B03")

    only_letter = detect(CLEAN, sample_index=B03, add={"name": "Row", "start": start, "end": start + 1})
    assert only_letter["pattern"] == r"plate\d+_(?P<Row>[A-Z])\d+_s\d+"  # the digits that follow are kept as context
    assert _fields(only_letter)["Row"]["text"] == "B"

    only_digits = detect(CLEAN, sample_index=B03, add={"name": "Col", "start": start + 1, "end": start + 3})
    assert only_digits["pattern"] == r"plate\d+_[A-Z]+(?P<Col>\d{2})_s\d+"

    both = detect(
        CLEAN, sample_index=B03, fields=only_letter["fields"],
        add={"name": "Col", "start": start + 1, "end": start + 3},
    )
    assert both["pattern"] == r"plate\d+_(?P<Row>[A-Z])(?P<Col>\d{2})_s\d+"
    assert _values(both, "Row")[0] == "A" and _values(both, "Col")[0] == "01"


def test_a_part_that_some_names_build_differently_is_matched_loosely_around_a_field():
    start = PLATES[B03].index("B03")  # "ctrl" has no digits, so this part is not built the same in every name

    only_letter = detect(PLATES, sample_index=B03, add={"name": "Row", "start": start, "end": start + 1})

    assert only_letter["pattern"] == r"plate\d+_(?P<Row>[A-Z])[^_\-.\s]+_s\d+"


def test_a_selection_can_span_separators_and_is_taken_exactly():
    text = PLATES[B03]
    start = text.index("B03")
    # from the "3" of "03" to the "s" of "s2": exactly those characters, the "0" before and the "2" after left out
    result = detect(PLATES, sample_index=B03, add={"name": "WellSite", "start": start + 2, "end": text.index("s2") + 1})

    field = _fields(result)["WellSite"]
    assert field["text"] == "3_s" and field["pattern"] == r"\d+_[a-z]"  # a lone digit may grow; a lone letter varies
    assert "3_s" in field["values"] and not any(v.startswith("0") for v in field["values"])  # never the "0" before


def test_separators_at_the_ends_of_a_selection_are_left_out():
    text = PLATES[B03]
    start = text.index("_B03_")

    result = detect(PLATES, sample_index=B03, add={"name": "Well", "start": start, "end": start + 5})

    assert _fields(result)["Well"]["text"] == "B03"


def _letter_o_names():
    """Wells written with the letter O where a zero is meant (BO3): the row letter and the O are one run."""
    return ["plate1_BO3_f01_Blue.tif", "plate1_CO4_f02_Blue.tif", "plate1_DO5_f01_Red.tif", "plate2_BO3_f02_Red.tif"]


def test_one_character_of_a_run_can_be_labeled():
    names = _letter_o_names()
    b = names[0].index("BO3")

    row = detect(names, add={"name": "Row", "start": b, "end": b + 1})  # the B only, not the BO it sits in
    both = detect(names, fields=row["fields"], add={"name": "Column", "start": b + 2, "end": b + 3})

    assert both["pattern"] == r"plate\d+_(?P<Row>[A-Z])O(?P<Column>\d+)_f\d+"  # the O left between them is fixed text
    assert _fields(both)["Row"]["values"] == ["B", "C", "D"] and _fields(both)["Column"]["values"] == ["3", "4", "5"]
    assert both["matched"] == len(names)


def test_two_fields_can_share_one_run_of_digits():
    names = [f"{row:03d}{col:03d}-1-001001001.tif" for row in (1, 2, 12) for col in (1, 5, 24)]  # row, then column

    row = detect(names, add={"name": "Row", "start": 0, "end": 3})
    both = detect(names, fields=row["fields"], add={"name": "Column", "start": 3, "end": 6})

    assert both["pattern"] == r"(?P<Row>\d{3})(?P<Column>\d{3})-\d+"
    assert _fields(both)["Row"]["values"] == ["001", "002", "012"] and _fields(both)["Column"]["values"] == ["001", "005", "024"]
    assert both["matched"] == len(names) and both["notes"] == []

    moved = detect(names, sample_index=4, from_index=both["sample_index"], fields=both["fields"])  # another sample
    assert {f["name"]: f["text"] for f in moved["fields"]} == {"Row": "002", "Column": "005"}


def test_a_field_sent_without_c0_and_c1_takes_whole_runs():
    names = _letter_o_names()
    b = names[0].index("BO3")
    field = dict(_fields(detect(names, add={"name": "Row", "start": b, "end": b + 1}))["Row"])
    del field["c0"], field["c1"]  # as a page from before 2026-10-10 would send it

    assert _fields(detect(names, fields=[field]))["Row"]["text"] == "BO"


def test_labeling_again_replaces_what_overlaps_and_what_has_the_same_name():
    first = _label(PLATES, B03, ("B03", "Well"), ("s2", "Site"))
    start = PLATES[B03].index("B03")

    again = detect(PLATES, sample_index=B03, fields=first["fields"], add={"name": "Well2", "start": start, "end": start + 3})
    assert [f["name"] for f in again["fields"]] == ["Well2", "Site"]  # the Well on the same text is gone

    moved = detect(PLATES, sample_index=B03, fields=first["fields"], add={"name": "Site", "start": start, "end": start + 3})
    assert [f["name"] for f in moved["fields"]] == ["Site"]  # the old Site, and the Well it overlaps, are replaced


def test_site_and_time_leave_their_letters_out_of_the_value_until_asked_not_to():
    result = _label(PLATES, B03, ("s2", "Site"))
    assert _fields(result)["Site"]["prefix_text"] == "s"
    assert r"s(?P<Site>\d+)" in result["pattern"]  # the "s" is fixed text, the number is the value
    assert _values(result, "Site")[0] == "1"

    off = detect(PLATES, sample_index=B03, fields=result["fields"], edit={"name": "Site", "prefix": False})
    assert _values(off, "Site")[0] == "s1"


def test_a_separator_alone_cannot_be_labeled():
    underscore = PLATES[B03].index("_")
    with pytest.raises(ValueError, match="select part of the name"):
        detect(PLATES, sample_index=B03, add={"name": "X", "start": underscore, "end": underscore + 1})


@pytest.mark.parametrize("bad", ["", "9lives", "has space", "a-b"])
def test_field_names_must_be_usable_group_names(bad):
    with pytest.raises(ValueError):
        detect(PLATES, sample_index=B03, add={"name": bad, "start": 0, "end": 3})


# ---- pattern styles -------------------------------------------------------------------------------------------


def test_the_pattern_style_is_the_tightest_one_that_fits_the_folder():
    result = _label(PLATES, B03, ("B03", "Well"), ("DAPI", "Channel"))
    well, channel = _fields(result)["Well"], _fields(result)["Channel"]

    assert well["mode_used"] == "shape" and well["covers"]["shape"] == 432 and well["total"] == 435
    assert channel["mode_used"] == "word"  # DAPI / GFP / Cy5 differ in length, case and digits
    assert channel["covers"]["shape"] < channel["covers"]["word"] == 435


def test_choosing_a_style_by_hand_sticks_and_auto_takes_it_back():
    result = _label(PLATES, B03, ("B03", "Well"))
    flexible = detect(PLATES, sample_index=B03, fields=result["fields"], edit={"name": "Well", "mode": "flex"})

    assert _fields(flexible)["Well"]["pattern"] == r"[A-Z]+\d+" and flexible["matched"] == 434
    listed = detect(PLATES, sample_index=B03, fields=flexible["fields"], edit={"name": "Well", "mode": "list"})
    assert _fields(listed)["Well"]["pattern"].startswith("(?:") and listed["matched"] == 435

    auto = detect(PLATES, sample_index=B03, fields=listed["fields"], edit={"name": "Well", "mode": "auto"})
    assert _fields(auto)["Well"]["mode_used"] == "shape"


def test_a_composite_label_gets_a_pattern_that_reads_its_spaces_and_dashes():
    names = _fitc_names()
    result = _label(names, 0, ("Blue - FITC", "Channel"))
    channel = _fields(result)["Channel"]

    # FITC, dsRed and Cy5 are all "the last word of the part", though Cy5 has a digit: only "any word" reads all three
    assert channel["mode_used"] == "word" and channel["pattern"] == "[A-Za-z0-9]+ - [A-Za-z0-9]+"
    assert result["matched"] == len(names)
    assert channel["values"] == ["Blue - FITC", "Green - dsRed", "Red - Cy5"]


def test_when_no_style_fits_enough_names_auto_keeps_the_tightest_of_those_that_fit_the_most():
    # Sites written s1 or f1: with the "s" left out of the value, half the names have no Site value at all, so every
    # style fits the same half. The tie goes to the tightest style, not to "any word".
    names = [f"{r}{c:02d}_{letter}{s}-w{w}.tif" for r in "AB" for c in (1, 2) for letter in "sf" for s in (1, 2) for w in (1, 2, 3)]

    site = _fields(_label(names, 0, ("s1", "Site")))["Site"]

    assert site["fit"] == "shape" and site["pattern"] == r"\d+"
    assert site["covers"]["shape"] == site["covers"]["word"] == len(names) // 2


# ---- moving to another sample ---------------------------------------------------------------------------------


def test_switching_to_an_odd_name_widens_the_pattern_to_fit_both_and_keeps_it():
    labeled = _plate()
    assert labeled["unmatched_count"] == 3

    b3 = PLATES.index("plate1_B3_s2_w1_DAPI.tif")
    at_b3 = detect(PLATES, sample_index=b3, from_index=B03, fields=labeled["fields"])
    assert at_b3["sample"] == "plate1_B3_s2_w1_DAPI.tif"
    assert _fields(at_b3)["Well"]["fits"] and at_b3["matched"] == 434  # the shape "B3" gives also reads B03 and C7
    assert at_b3["notes"] == [r"Well now reads [A-Z]\d+, which fits B3 and B03."]  # the change is reported

    ctrl = PLATES.index("plate1_ctrl_s1_w2_GFP.tif")
    at_ctrl = detect(PLATES, sample_index=ctrl, from_index=b3, fields=at_b3["fields"])
    assert _fields(at_ctrl)["Well"]["mode_used"] == "word" and at_ctrl["matched"] == len(PLATES)

    back = detect(PLATES, sample_index=B03, from_index=ctrl, fields=at_ctrl["fields"])
    assert _fields(back)["Well"]["mode_used"] == "word"  # it stays widened
    assert back["matched"] == len(PLATES)
    assert any("Widened Well" in note for note in back["notes"])


def test_fields_follow_a_part_to_a_sample_of_another_length():
    labeled = _label(PLATES, B03, ("s2", "Site"))
    ten = PLATES.index("plate1_C7_s10_w1_DAPI.tif")

    moved = detect(PLATES, sample_index=ten, from_index=B03, fields=labeled["fields"])

    assert _fields(moved)["Site"]["text"] == "s10" and moved["sample"].endswith("DAPI.tif")


def test_a_name_with_a_different_layout_clears_the_labels_and_says_so():
    names = PLATES + ["plate1_extra_B03_s2_w1_DAPI.tif"]
    labeled = _label(names, B03, ("B03", "Well"))

    moved = detect(names, sample_index=len(names) - 1, from_index=B03, fields=labeled["fields"])

    assert moved["fields"] == [] and moved["pattern"] == ""
    assert "different number of parts" in moved["notes"][0]


# ---- the pattern options --------------------------------------------------------------------------------------


def test_a_lone_field_is_anchored_to_its_neighbours_unless_asked_not_to():
    names = ["A - 08(fld 4 wv Blue - FITC).tif", "A - 08(fld 4 wv Green - dsRed).tif"]
    text = names[0]
    where = {"name": "Channel", "start": text.index("Blue"), "end": text.index("Blue") + 4}

    anchored = detect(names, add=where)
    bare = detect(names, add=where, anchor=False)

    assert anchored["pattern"] == r"wv (?P<Channel>[A-Za-z]+) - [A-Za-z]+\)"
    assert [row["values"]["Channel"] for row in anchored["rows"]] == ["Blue", "Green"]
    assert bare["pattern"] == "(?P<Channel>[A-Za-z]+)"
    assert [row["values"]["Channel"] for row in bare["rows"]] == ["A", "A"]  # nothing pins it to the right place


def test_a_neighbouring_part_that_is_built_differently_is_matched_loosely():
    names = _fitc_names()
    result = _label(names, 0, ("Blue", "Channel"))

    assert result["pattern"].endswith(r"(?P<Channel>[A-Za-z]+) - [^_\-.\s]+")  # FITC) / dsRed) / Cy5) differ
    assert result["matched"] == len(names)


def test_text_left_over_after_a_field_stays_exact_when_it_is_only_brackets():
    names = _fitc_names()  # the dye part (FITC) / (dsRed) / (Cy5) is built differently, but only the ")" is left of it
    result = _label(names, 0, ("Blue - FITC", "Channel"))

    assert result["pattern"].endswith(r"(?P<Channel>[A-Za-z0-9]+ - [A-Za-z0-9]+)\)")
    assert result["matched"] == len(names)


def test_numbers_in_fixed_text_stay_exact_when_generalizing_is_off():
    loose = _label(PLATES, B03, ("B03", "Well"), ("DAPI", "Channel"))
    exact = _label(PLATES, B03, ("B03", "Well"), ("DAPI", "Channel"), generalize=False)

    assert r"_w\d+_" in loose["pattern"]
    assert "_w1_" in exact["pattern"] and exact["matched"] < loose["matched"]


# ---- the answer -----------------------------------------------------------------------------------------------


def test_the_answer_describes_the_sample_each_field_and_what_the_folder_gives():
    result = _plate()

    assert result["sample"] == "plate1_B03_s2_w1_DAPI.tif" and result["sample_index"] == B03
    assert result["total"] == len(PLATES)
    assert [t["text"] for t in result["tokens"] if not t["sep"]][:4] == ["plate", "1", "B", "03"]
    assert "".join(t["text"] for t in result["tokens"]) == result["sample"]  # the tokens tile the name

    well = _fields(result)["Well"]
    assert (well["start"], well["end"], well["text"]) == (7, 10, "B03")
    assert well["distinct"] == 24 and well["type"] == "well" and well["values"][:2] == ["A01", "A02"]
    assert _fields(result)["Site"]["type"] == "int" and _fields(result)["Site"]["values"] == ["1", "2", "3"]
    assert list(result["styles"]) == ["shape", "flex", "word", "words", "list"]  # tightest first: the page lists them so
    assert result["styles"]["words"] == "several words" and set(well["covers"]) == set(result["styles"])

    assert "".join(p["text"] for p in result["pieces"]) == result["pattern"]
    assert [p["field"] for p in result["pieces"] if p["field"]] == ["Plate", "Well", "Site", "Channel"]
    assert len(result["rows"]) == 8 and result["rows"][0]["values"]["Well"] == "A01"


def test_what_the_screen_sends_back_is_accepted_unchanged():
    first = _plate()
    second = detect(PLATES, sample_index=B03, fields=first["fields"])  # with every extra key the answer carries

    assert second["pattern"] == first["pattern"] and second["fields"] == first["fields"]


def test_a_hint_says_when_a_label_does_not_look_like_its_values():
    result = _label(PLATES, B03, ("plate1", "Well"))  # a plate is not a well

    assert _fields(result)["Well"]["hint"] == "These do not look like well names (A01 style)."


def test_nothing_to_learn_from_is_an_error():
    with pytest.raises(ValueError, match="no image names"):
        detect([])


def test_a_malformed_field_is_an_error():
    with pytest.raises(ValueError, match="malformed field"):
        detect(PLATES, fields=[{"name": "Well"}])


def test_detect_reads_only_the_names_so_a_huge_folder_is_fast():
    names = [f"p{p}_{row}{col:02d}_s{s}_w1.tif" for p in range(1, 6) for row in "ABCDEFGH" for col in range(1, 13) for s in range(1, 26)]
    assert len(names) == 12000

    result = _label(names, 0, ("A01", "Well"), ("s1", "Site"))

    assert _fields(result)["Well"]["distinct"] == 96 and result["matched"] == len(names)


def test_a_value_that_holds_a_superscript_digit_is_listed_like_any_other():
    names = ["x10²_a.tif", "x2²_b.tif", "x2³_c.tif"]  # "²" is a digit to str.isdigit, but not a number to int()

    result = detect(names, add={"name": "Size", "start": 0, "end": 4})

    assert result["matched"] == 2 and _fields(result)["Size"]["values"] == ["x2²", "x10²"]  # 2 before 10


# ---- values that hold a separator -----------------------------------------------------------------------------


def _dye_names():
    """A channel or a filter that is two words in some names ("Far Red", "Texas Red"): those names have one part
    more than the others."""
    return sorted([
        "B - 2( wv Blue - FITC).tif", "B - 3( wv Green - DAPI).tif", "B - 4( wv Red - TRITC).tif",
        "A - 1( wv Blue - FITC).tif", "A - 2( wv Green - DAPI).tif", "C - 5( wv Red - Cy3).tif",
        "D - 6( wv Far Red - Cy5).tif", "B - 2( wv Blue - DAPI).tif", "B - 2( wv Green - FITC).tif",
        "B - 2( wv Red - TRITC).tif", "C - 7( wv Blue - Hoechst).tif", "C - 8( wv Green - GFP).tif",
        "D - 1( wv Red - RFP).tif", "D - 2( wv Far Red - Cy5).tif", "E - 3( wv Blue - DAPI).tif",
        "E - 4( wv Green - FITC).tif", "F - 5( wv Red - Texas Red).tif", "F - 6( wv Far Red - Cy5).tif",
        "G - 7( wv Blue - Hoechst).tif", "H - 8( wv Green - FITC).tif", "A - 10( wv Blue - DAPI).tif",
        "B - 11( wv Green - GFP).tif", "C - 12( wv Red - RFP).tif", "D - 13( wv Far Red - Cy5).tif",
    ])


WORDS = "[A-Za-z0-9]+(?: [A-Za-z0-9]+)*"  # a word, then more words where some names have them


def _dyes_labeled(names):
    return _label(names, "B - 2( wv Blue - FITC).tif", ("B", "Row"), ("2", "Column"), ("Blue", "Channel"), ("FITC", "Filter"))


def test_a_value_that_is_two_words_in_some_names_is_read_from_them_too():
    names = _dye_names()
    result = _dyes_labeled(names)

    # Far Red is in 4 names of 24: the channel reads several words. Texas Red is in one: the odd name is left out.
    assert result["pattern"] == rf"(?P<Row>[A-Z]) - (?P<Column>\d+)\( wv (?P<Channel>{WORDS}) - (?P<Filter>[A-Za-z0-9]+)\)"
    assert result["matched"] == 23 and [u["name"] for u in result["unmatched"]] == ["F - 5( wv Red - Texas Red).tif"]

    channel = _fields(result)["Channel"]
    assert channel["mode_used"] == "words" and channel["total"] == 24  # the longer names are compared too
    assert channel["covers"]["word"] == 20 and channel["covers"]["words"] == 24  # only "several words" reads Far Red
    assert channel["values"] == ["Blue", "Far Red", "Green", "Red"]
    dye = _fields(result)["Filter"]
    assert dye["mode_used"] == "word" and dye["covers"]["word"] == 23 and dye["covers"]["words"] == 24


def test_an_unmatched_name_with_one_part_more_widens_the_pattern_and_the_sample_stays():
    names = _dye_names()
    result = _dyes_labeled(names)
    odd = names.index("F - 5( wv Red - Texas Red).tif")

    widened = detect(names, sample_index=odd, from_index=result["sample_index"], fields=result["fields"])

    assert widened["sample"] == "B - 2( wv Blue - FITC).tif"  # its own parts carry the labels; the longer name's cannot
    assert widened["notes"] == [
        "F - 5( wv Red - Texas Red).tif holds a value in several words, so B - 2( wv Blue - FITC).tif stays the sample.",
        "Widened Filter to “several words” so it fits both FITC and Texas Red.",
    ]
    assert widened["pattern"] == rf"(?P<Row>[A-Z]) - (?P<Column>\d+)\( wv (?P<Channel>{WORDS}) - (?P<Filter>{WORDS})\)"
    assert widened["matched"] == 24 and widened["unmatched"] == []

    compiled = re.compile(widened["pattern"])
    assert compiled.search("D - 13( wv Far Red - Cy5).tif").groupdict() == {"Row": "D", "Column": "13", "Channel": "Far Red", "Filter": "Cy5"}
    assert compiled.search("F - 5( wv Red - Texas Red).tif").groupdict() == {"Row": "F", "Column": "5", "Channel": "Red", "Filter": "Texas Red"}

    again = detect(names, sample_index=result["sample_index"], fields=widened["fields"])  # it stays widened
    assert _fields(again)["Filter"]["mode_used"] == "words" and again["matched"] == 24


def test_a_longer_name_the_pattern_reads_already_becomes_the_sample_as_before():
    names = _dye_names()
    result = _dyes_labeled(names)
    far = names.index("D - 6( wv Far Red - Cy5).tif")

    moved = detect(names, sample_index=far, from_index=result["sample_index"], fields=result["fields"])

    assert moved["sample"] == "D - 6( wv Far Red - Cy5).tif" and moved["fields"] == []
    assert "different number of parts" in moved["notes"][0]


def test_a_channel_labeled_where_it_is_one_word_reads_the_two_word_values_too():
    names = _dye_names()
    result = _label(names, "B - 2( wv Blue - FITC).tif", ("Blue", "Channel"))

    assert _fields(result)["Channel"]["values"] == ["Blue", "Far Red", "Green", "Red"]
    assert result["matched"] == len(names)
    assert result["pattern"].endswith(r" - [^_\-.\s]+(?: [^_\-.\s]+)*")  # the filter is not labeled: read loosely, two words or one


def test_the_seen_values_style_lists_the_two_word_values_too():
    names = _dye_names()
    labeled = _label(names, "B - 2( wv Blue - FITC).tif", ("Blue", "Channel"))
    listed = detect(names, sample_index=labeled["sample_index"], fields=labeled["fields"], edit={"name": "Channel", "mode": "list"})

    assert _fields(listed)["Channel"]["pattern"] == "(?:Far Red|Green|Blue|Red)"
    assert listed["matched"] == len(names)


def test_a_name_that_could_be_lined_up_two_ways_is_left_out_rather_than_guessed_at():
    names = PLATES + ["plate1_extra_B03_s2_w1_DAPI.tif"]  # is it plate1_extra, or extra_B03? No way to tell
    result = _label(names, B03, ("B03", "Well"))

    assert _fields(result)["Well"]["total"] == len(PLATES)  # compared across the names laid out like the sample only
    assert [u["name"] for u in result["unmatched"]][-1] == "plate1_extra_B03_s2_w1_DAPI.tif"


def test_names_that_all_have_the_same_parts_get_the_patterns_they_always_got():
    result = _label(PLATES, B03, ("B03", "Well"), ("DAPI", "Channel"))
    channel = _fields(result)["Channel"]

    assert channel["mode_used"] == "word"  # "several words" is not tried where no name needs it
    assert channel["covers"]["words"] == channel["covers"]["word"]  # there it is the same pattern as "any word"


def test_several_words_can_be_chosen_by_hand():
    names = _dye_names()
    labeled = _label(names, "B - 2( wv Blue - FITC).tif", ("Blue", "Channel"))
    flexible = detect(names, sample_index=labeled["sample_index"], fields=labeled["fields"], edit={"name": "Channel", "mode": "flex"})
    assert flexible["matched"] == 20 and _fields(flexible)["Channel"]["pattern"] == "[A-Za-z]+"

    words = detect(names, sample_index=flexible["sample_index"], fields=flexible["fields"], edit={"name": "Channel", "mode": "words"})
    assert _fields(words)["Channel"]["pattern"] == WORDS and words["matched"] == 24


# ---- reading the sample where it was labeled ------------------------------------------------------------------


def _repeating_names():
    """Every part is a letter and a digit, and the letters vary: the text before a label looks like the label."""
    return ["s1_s2_s3.tif", "s3_x2_w2.tif", "x2_s1_w1.tif"]


def test_an_anchored_pattern_reads_the_sample_where_it_was_labeled():
    names = _repeating_names()

    result = detect(names, add={"name": "F", "start": 7, "end": 8})  # the 3 of s3

    assert result["pattern"].startswith("^")  # tied to the start of the name: otherwise it reads s1_s2, F = 2
    assert re.search(result["pattern"], "s1_s2_s3.tif")["F"] == "3"
    assert result["rows"][0]["values"] == {"F": "3"} and result["notes"] == []


def test_a_pattern_that_reads_well_where_it_was_labeled_is_not_tied_to_the_start():
    result = _label(PLATES, B03, ("B03", "Well"), ("DAPI", "Channel"))

    assert not result["pattern"].startswith("^") and result["notes"] == []


def test_without_anchoring_a_pattern_that_reads_the_sample_elsewhere_says_so():
    names = _repeating_names()

    result = detect(names, add={"name": "F", "start": 7, "end": 8}, anchor=False)

    assert result["pattern"] == r"[a-z]+(?P<F>\d+)"  # not tied to the start: anchoring is what the user turned off
    assert result["notes"] == [
        "In this name the pattern reads F as 1, not 3: it matches at another place in the name. "
        "Tick “Anchor with the neighbouring part on each side” to keep it in place."
    ]


def test_an_anchored_pattern_whose_value_would_run_on_is_tied_to_the_end_of_the_name_too():
    names = ["(fld.tif", "(ab.cd.tif", "(wv.tif"]  # "ab.cd" is one value: "several words" would read on into ".tif"

    labeled = detect(names, add={"name": "Well", "start": 1, "end": 4})
    result = detect(names, fields=labeled["fields"], edit={"name": "Well", "mode": "words"})

    assert result["pattern"].startswith("^") and result["pattern"].endswith("$")
    assert re.search(result["pattern"], "(fld.tif")["Well"] == "fld" and result["notes"] == []
    assert sorted(_values(result, "Well")) == ["ab.cd", "fld", "wv"]  # and it reads every name
