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
    "Rattling noise while driving over bumps, something weird",
    "My fan only works on high and the windows fog up",
    "Turbo whistles and there's no boost on my EcoBoost",
    "4x4 light flashing and the transfer case won't shift",
    "Wet carpet after it rains, sunroof drains?",
    "Feels like rumble strips at 45 on light gas",
    "my prius says check hybrid system",
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
        row, unseen = model["feature_log_prob"][c], model["unseen_log_prob"][c]
        s += sum(n * row.get(str(i), unseen) for i, n in counts.items())
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
           or not c.get("name") or not c.get("summary") or not 3 <= len(c.get("checks", [])) <= 4
           or not c.get("plain") or not c.get("drive") or not c.get("todo")]
    check(not bad, f"causes.json entries are complete {bad or ''}")

    # 2b. Every cause has a step-by-step guide.
    guides = json.loads((APP / "guides.json").read_text(encoding="utf-8"))
    bad_guides = [k for k in causes
                  if k not in guides or len(guides[k].get("tools", [])) < 2 or len(guides[k].get("find", [])) < 3
                  or len(guides[k].get("fix", [])) < 3 or not guides[k].get("spots")
                  or any(not (s.get("name") and s.get("where") and s.get("look")) for s in guides[k]["spots"])]
    check(not bad_guides and set(guides) == set(causes), f"guides.json has a complete guide per cause {bad_guides or ''}")

    # 2c. Service specs are well formed.
    specs = json.loads((APP / "specs.json").read_text(encoding="utf-8"))
    cats = {"oil", "ignition", "cooling", "fuel", "drivetrain", "wheels", "notes"}
    rows = [x for f in specs["engines"] for x in f["specs"]] + [x for v in specs["vehicles"] for x in v["specs"]] \
        + [x for g in specs["groups"].values() for x in g]
    bad_specs = [x for x in rows if len(x) != 3 or x[0] not in cats or not x[1] or not x[2]]
    check(not bad_specs and len(specs["engines"]) >= 40, f"specs.json rows are complete ({len(specs['engines'])} engine families) {bad_specs or ''}")

    # 3. Codes point at real causes.
    bad_codes = sorted(code for code, info in codes.items() if info.get("related") not in causes)
    check(not bad_codes, f"every code's related cause exists {bad_codes or ''}")
    check(len(codes) >= 60, f"codes.json has 60+ codes ({len(codes)})")

    # 3b. Glossary entries are usable.
    glossary = json.loads((APP / "glossary.json").read_text(encoding="utf-8"))
    bad_terms = [g.get("term") for g in glossary
                 if not g.get("term") or not g.get("text") or not (g.get("match") or g.get("regex"))]
    check(not bad_terms, f"glossary.json entries are complete {bad_terms or ''}")

    # 3c. Vehicle problems point at real causes and groups.
    vehicles = json.loads((APP / "vehicles.json").read_text(encoding="utf-8"))
    bad_v = [f"{m['make']} {m['model']}" for m in vehicles["models"]
             if any(g not in vehicles["groups"] for g in m["groups"]) or m["from"] > m["to"]]
    kinds = vehicles["kinds"]
    bad_k = [k for k, info in kinds.items()
             if not info.get("s") or not info.get("w") or (info["c"] is not None and info["c"] not in causes)]
    bad_c = []
    for group in vehicles["groups"].values():
        for i in group:
            # Hand-written problems carry their own text; dataset ones point at a shared kind.
            text_ok = (i.get("s") and i.get("w")) or i.get("k") in kinds
            cause = i["c"] if "c" in i else kinds.get(i.get("k"), {}).get("c")
            if not text_ok or (cause is not None and cause not in causes):
                bad_c.append(i["t"])
    check(not bad_v and not bad_k and not bad_c, f"vehicles.json is consistent {bad_v + bad_k + bad_c or ''}")

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

        # 6. Quick questions: few of them, and they help.
        result = subprocess.run(["node", str(ROOT / "tests" / "questions.js")], capture_output=True, text=True)
        check(result.returncode == 0, f"tests/questions.js runs {result.stderr.strip()[:300]}")
        if result.returncode == 0:
            q = json.loads(result.stdout)
            full, vague = q["full"], q["vague"]
            print(f"      quick questions: full sentences {full['before']}% -> {full['after']}% "
                  f"(avg {full['avgQuestions']} asked); vague {vague['before']}% -> {vague['after']}% "
                  f"(avg {vague['avgQuestions']} asked)")
            check(max(full["maxQuestions"], vague["maxQuestions"]) <= q["maxAllowed"],
                  f"never more than {q['maxAllowed']} quick questions")
            check(full["after"] >= full["before"] and vague["after"] >= vague["before"],
                  "quick questions never lower held-out accuracy")
            check(full["after"] >= 95, f"held-out top-1 after questions is 95%+ ({full['after']}%)")
            check(not q["deadAnswers"], f"every answer adds words the model knows {q['deadAnswers'] or ''}")

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        sys.exit(1)
    print("All checks passed")


if __name__ == "__main__":
    main()
