"""glue.py: what the page calls in Pyodide, between the page and the engine."""
import json
import re
from pathlib import Path

import pytest

import glue
from engine import detect

NAMES = [f"{row}{col:02d}_s{s}_w{w}.tif" for row in "AB" for col in (1, 2, 3) for s in (1, 2) for w in (1, 2)]


@pytest.fixture(autouse=True)
def _names():
    glue.set_names(json.dumps(NAMES))
    yield
    glue.set_names("[]")


def _run(**request):
    return json.loads(glue.run(json.dumps(request)))


def test_set_names_keeps_the_names_and_says_how_many():
    assert glue.set_names(json.dumps(["a_1.tif", "a_2.tif"])) == 2
    assert _run(suggest=True)["answer"]["total"] == 2


@pytest.mark.parametrize("bad", ['"a.tif"', "[1, 2]", '{"a": 1}'])
def test_set_names_refuses_what_is_not_a_list_of_text(bad):
    with pytest.raises(ValueError, match="list of text"):
        glue.set_names(bad)


def test_run_gives_the_answer_detect_gives():
    reply = _run(suggest=True)

    assert reply["ok"] is True
    assert reply["answer"] == detect(NAMES, suggest=True)
    assert [f["name"] for f in reply["answer"]["fields"]] == ["Well", "Site", "Channel"]


def test_run_suggests_then_edits_with_the_fields_sent_back():
    first = _run(suggest=True)["answer"]

    renamed = _run(fields=first["fields"], rename={"from": "Channel", "to": "Wave"})["answer"]

    assert [f["name"] for f in renamed["fields"]] == ["Well", "Site", "Wave"]
    assert renamed["matched"] == len(NAMES)


def test_run_adds_a_label_from_a_selection():
    answer = _run(sample_index=0, add={"name": "Well", "start": 0, "end": 3})["answer"]

    assert answer["sample"] == "A01_s1_w1.tif" and answer["fields"][0]["text"] == "A01"
    assert answer["matched"] == len(NAMES)


def test_run_takes_the_options_and_null_for_what_is_not_asked():
    where = {"name": "Site", "start": 4, "end": 6}
    anchored = _run(add=where, remove=None, rename=None, edit=None, from_index=None)["answer"]
    bare = _run(add=where, anchor=False)["answer"]

    assert anchored["pattern"] != bare["pattern"] and bare["pattern"] == r"s(?P<Site>\d+)"


def test_a_problem_the_user_can_fix_comes_back_as_its_message():
    reply = _run(add={"name": "9x", "start": 0, "end": 3})

    assert reply["ok"] is False and "unexpected" not in reply
    assert "not a usable field name" in reply["error"]


def test_no_names_comes_back_as_its_message():
    glue.set_names("[]")

    reply = _run(suggest=True)

    assert reply == {"ok": False, "error": "there are no image names to learn from"}


def test_a_request_that_is_not_json_is_reported_not_raised():
    reply = json.loads(glue.run("{not json"))

    assert reply["ok"] is False


def test_a_bug_is_reported_as_unexpected(monkeypatch):
    def broken(*args, **kwargs):
        raise AssertionError("field Well does not sit in the sample")

    monkeypatch.setattr(glue, "detect", broken)

    reply = _run(suggest=True)

    assert reply["ok"] is False and reply["unexpected"] is True
    assert reply["error"] == "AssertionError: field Well does not sit in the sample"


def test_a_key_or_type_error_is_a_bug_not_a_message_for_the_user(monkeypatch):
    def broken(*args, **kwargs):
        raise KeyError("Well")

    monkeypatch.setattr(glue, "detect", broken)

    reply = _run(suggest=True)

    assert reply == {"ok": False, "unexpected": True, "error": "KeyError: 'Well'"}


def test_a_malformed_request_from_the_page_is_a_bug():
    reply = _run(add={"name": "Well"})  # no start or end: the page sent something it never should

    assert reply["ok"] is False and reply["unexpected"] is True


# ---- the answer, as the page expects it ----


CONTRACT = Path(__file__).resolve().parents[2] / "src" / "python" / "contract.ts"


def _keys(interface: str) -> set[str]:
    """The keys of a TypeScript interface in contract.ts, read as text."""
    body = re.search(rf"^export interface {interface} \{{\n(.*?)^\}}", CONTRACT.read_text(), re.M | re.S)
    assert body, f"contract.ts has no interface {interface}"
    return set(re.findall(r"^  (\w+)\??:", body.group(1), re.M))


def test_the_answer_has_the_keys_contract_ts_gives_it():
    """Nothing else checks this side of the contract: a key added or renamed on one side only would show on the
    page as an empty value, not as an error (doc/ARCHITECTURE.md section 10.1)."""
    answer = _run(suggest=True)["answer"]

    assert set(answer) == _keys("DetectAnswer")
    assert answer["fields"] and answer["tokens"]
    for field in answer["fields"]:
        assert set(field) == _keys("DetectField")
    for token in answer["tokens"]:
        assert set(token) == _keys("DetectToken")
