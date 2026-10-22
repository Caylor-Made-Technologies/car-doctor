"""
Car Doctor - consistency checks.

Run from the repo root after training:
    python model/train.py
    python tests/check.py

Checks that the data files agree with each other and that the browser
code (app/app.js) tokenizes and predicts exactly like Python does.
Exits with code 1 if anything fails, which stops the deploy.
"""

import csv
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "model"))
from train import tokenize  # noqa: E402  (the Python version of the tokenizer)

APP = ROOT / "app"
SAMPLES = [
    "clicks fast when i turn the key and wont start",
    "humming noise that gets louder with speed",
    "steering wheel shakes only when braking",
    "Squealing from the belt on cold mornings, it's loud!",
    "misfire code P0300 and rough running at idle",
    "AC blows warm and the compressor isn't kicking on",
]

failures = []


def check(ok, message):
    print(("PASS  " if ok else "FAIL  ") + message)
    if not ok:
        failures.append(message)


def python_predict(model, text, boosts=None):
    """Same math as predict() in app.js, using model.json."""
    boosts = boosts or {}
    counts = {}
    for token in tokenize(text):
        if token in model["vocab"]:
            idx = model["vocab"][token]
            counts[idx] = counts.get(idx, 0) + 1
    scores = []
    for c, label in enumerate(model["classes"]):
        s = model["class_log_prior"][c]
        s += sum(n * model["feature_log_prob"][c][i] for i, n in counts.items())
        scores.append(s + boosts.get(label, 0))
    top = max(scores)
    exps = [math.exp(s - top) for s in scores]
    total = sum(exps)
    ranked = sorted(zip(model["classes"], [e / total for e in exps]), key=lambda p: -p[1])
    return [label for label, _ in ranked]


def run_js(samples):
    """Load the top of app.js in Node and run tokenize + predict."""
    source = (APP / "app.js").read_text(encoding="utf-8")
    marker = "// ===== STORAGE ====="
    if marker not in source:
        return None, "STORAGE marker missing from app.js"
    core = source.split(marker)[0]
    script = f"""
const fs = require("fs");
const core = {json.dumps(core)};
// app.js is strict mode, so wrap it in a function and hand back what we need.
const load = new Function(core + "\\nreturn {{ tokenize, predict, setModel: (m) => {{ MODEL = m; }} }};");
const lib = load();
lib.setModel(JSON.parse(fs.readFileSync({json.dumps(str(APP / "model.json"))}, "utf8")));
const samples = {json.dumps(samples)};
const out = samples.map((s) => ({{
  tokens: lib.tokenize(s),
  top3: lib.predict(s).ranked.slice(0, 3).map((r) => r.label),
}}));
console.log(JSON.stringify(out));
"""
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        return None, result.stderr.strip()
    return json.loads(result.stdout), None


def main():
    causes = json.loads((APP / "causes.json").read_text(encoding="utf-8"))
    codes = json.loads((APP / "codes.json").read_text(encoding="utf-8"))
    model = json.loads((APP / "model.json").read_text(encoding="utf-8"))
    with open(ROOT / "data" / "symptoms.csv", newline="", encoding="utf-8") as f:
        labels = {row["label"].strip() for row in csv.DictReader(f)}

    # 1. Labels and causes match both ways.
    missing_cause = sorted(labels - set(causes))
    unused_cause = sorted(set(causes) - labels)
    check(not missing_cause, f"every CSV label has a cause {missing_cause or ''}")
    check(not unused_cause, f"every cause has training data {unused_cause or ''}")

    # 2. Cause entries have the right fields.
    bad = [k for k, c in causes.items()
           if c.get("severity") not in {"low", "medium", "high", "critical"}
           or c.get("diy") not in {"Easy", "Medium", "Hard", "Shop"}
           or not c.get("name") or not c.get("summary") or not 3 <= len(c.get("checks", [])) <= 4]
    check(not bad, f"causes.json entries are complete {bad or ''}")

    # 3. Codes point at real causes.
    bad_codes = sorted(code for code, info in codes.items() if info.get("related") not in causes)
    check(not bad_codes, f"every code's related cause exists {bad_codes or ''}")
    check(len(codes) >= 60, f"codes.json has 60+ codes ({len(codes)})")

    # 4. Model matches the data.
    check(sorted(model["classes"]) == sorted(labels), "model.json classes match the CSV labels")

    # 5. JavaScript matches Python.
    if not shutil.which("node"):
        check(False, "node is installed (needed to test app.js)")
    else:
        js, error = run_js(SAMPLES)
        check(js is not None, f"app.js runs in Node {error or ''}")
        for sample, result in zip(SAMPLES, js or []):
            py_tokens = tokenize(sample)
            check(result["tokens"] == py_tokens, f"tokens match: {sample!r}")
            py_top3 = python_predict(model, sample)[:3]
            check(result["top3"] == py_top3,
                  f"top-3 match: {sample!r} -> {', '.join(py_top3)}")

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        sys.exit(1)
    print("All checks passed")


if __name__ == "__main__":
    main()
