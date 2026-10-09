"""What the web page calls instead of HC-Flow's POST /images/detect-metadata (routers/images_router.py there).

The page runs this in Pyodide, in a Web Worker. The names are handed over once (`set_names`) and kept here, so
each step of the Detect screen sends only its small request (`run`). Everything crosses as JSON text: no Python
object is left for the JavaScript side to release.
"""
from __future__ import annotations

import json

from app.imaging.metadata_detect import detect

_names: list[str] = []


def set_names(names_json: str) -> int:
    """Replaces the names Detect learns from. Returns how many there are."""
    global _names
    names = json.loads(names_json)
    if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
        raise ValueError("the names must be a list of text")
    _names = names
    return len(_names)


def run(request_json: str) -> str:
    """One step of the Detect screen: the request the endpoint took, minus the folder. Returns
    {"ok": true, "answer": ...}, or {"ok": false, "error": ...} for a problem the user can fix (what the
    endpoint answered with a 400): `detect()` raises ValueError for those, with a message for the user. Any other
    failure is a bug, a KeyError or TypeError included: it comes back with "unexpected", so the page says so
    instead of showing a bare key or waiting for an answer that never comes.
    """
    try:
        request = json.loads(request_json)
        answer = detect(
            _names,
            sample_index=request.get("sample_index", 0),
            from_index=request.get("from_index"),
            fields=request.get("fields") or [],
            add=request.get("add"),
            remove=request.get("remove"),
            rename=request.get("rename"),
            edit=request.get("edit"),
            suggest=bool(request.get("suggest", False)),
            generalize=bool(request.get("generalize", True)),
            anchor=bool(request.get("anchor", True)),
        )
        return json.dumps({"ok": True, "answer": answer})
    except ValueError as exc:  # json.JSONDecodeError is one too
        return json.dumps({"ok": False, "error": str(exc)})
    except Exception as exc:  # noqa: BLE001 - nothing may escape: the page is waiting for this answer
        return json.dumps({"ok": False, "unexpected": True, "error": f"{type(exc).__name__}: {exc}"})
