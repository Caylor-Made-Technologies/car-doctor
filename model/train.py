"""
Car Doctor - model trainer.

Reads data/symptoms.csv (label,text), trains a Naive Bayes text classifier,
checks how accurate it is, and writes app/model.json for the browser app.

Run it from the repo root:
    python model/train.py

The big idea (more in README.md):
  1. Turn each sentence into a list of "tokens" (cleaned-up words).
  2. Count how often each token shows up for each problem.
  3. For a new sentence, ask: "which problem makes these words most likely?"
"""

import csv
import json
import re
import sys
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import StratifiedKFold
from sklearn.naive_bayes import MultinomialNB

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "symptoms.csv"
# Never trained on. Written separately, in everyday "how a parent would say
# it" wording, to estimate real-world accuracy more honestly.
HOLDOUT_FILE = ROOT / "data" / "holdout.csv"
HOLDOUT2_FILE = ROOT / "data" / "holdout2.csv"
MODEL_FILE = ROOT / "app" / "model.json"

ALPHAS = [0.05, 0.1, 0.3, 0.5, 1.0]  # smoothing values to try
FOLDS = 5
MIN_TOP1 = 0.95  # deploy stops if cross-validated top-1 accuracy drops below this

# ---------------------------------------------------------------------------
# Text cleaning
# !!! KEEP IN SYNC: STOPWORDS, SYNONYM_GROUPS, stem() and tokenize() are
# copied into app/app.js. If you change anything here, change it there too.
# tests/check.py will fail if the two get out of sync.
# ---------------------------------------------------------------------------

# Filler words that don't help tell one problem from another.
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for",
    "with", "is", "it", "its", "it's", "this", "that", "my", "me", "i", "im",
    "we", "you", "your", "he", "she", "they", "them", "our", "was", "be",
    "been", "are", "am", "so", "just", "like", "kind", "sort", "really",
    "very", "some", "there", "has", "have", "had", "got", "get", "gets",
    "car", "truck", "vehicle", "pickup", "chevy", "silverado", "thing",
    "also", "then", "now", "pretty", "bit", "little", "kinda", "lot",
    "when", "from", "every", "time", "all", "up", "after", "while", "goes",
    "go", "going", "one", "does", "doesnt", "will",
    # Vague words that say nothing about the cause ("weird noise").
    "weird", "strange", "funny", "odd", "something", "wrong", "problem",
    "problems", "issue", "issues", "acting",
    # Filler that says nothing about the cause ("can you tell me what").
    "can", "cant", "could", "hear", "try", "trying", "tried", "make", "makes",
    "making", "seem", "seems", "theres", "lately", "today", "please", "help",
    "tell", "know", "think", "what", "why", "how", "do", "did", "would",
    "should", "want", "if",
}

# Different words people use for the same thing. The key is the "canonical"
# word; every variant in the list gets replaced by it. This lets the model
# learn "shake" once instead of separately for vibrate, wobble, shudder...
SYNONYM_GROUPS = {
    "shake": ["shake", "shakes", "shaking", "shaky", "vibrate", "vibrates",
              "vibrating", "vibration", "vibrations", "wobble", "wobbles",
              "wobbling", "shudder", "shudders", "shuddering", "shimmy",
              "shimmies", "jitter", "pulsate", "pulsates", "pulsing",
              "pulsating", "pulses", "pulse"],
    "noise": ["noise", "noises", "noisy", "sound", "sounds"],
    "squeal": ["squeal", "squeals", "squealing", "squeak", "squeaks",
               "squeaking", "squeaky", "screech", "screeches", "screeching",
               "chirp", "chirps", "chirping"],
    "click": ["click", "clicks", "clicking", "clicked"],
    "grind": ["grind", "grinds", "grinding"],
    "hum": ["hum", "hums", "humming", "drone", "droning", "roar", "roars",
            "roaring", "growl", "growls", "growling"],
    "whine": ["whine", "whines", "whining", "whir", "whirs", "whirring",
              "whirr"],
    "tick": ["tick", "ticks", "ticking", "tap", "taps", "tapping", "ticky"],
    "clunk": ["clunk", "clunks", "clunking", "thump", "thumps", "thumping",
              "thud", "thuds", "bang", "bangs", "banging", "clank", "clanks",
              "clanking", "clunky"],
    "brake": ["brake", "brakes", "braking", "braked"],
    "start": ["start", "starts", "starting", "started", "startup"],
    "crank": ["crank", "cranks", "cranking", "cranked"],
    "leak": ["leak", "leaks", "leaking", "leaked", "leaky", "puddle",
             "puddles", "drip", "drips", "dripping", "spot", "spots"],
    "smell": ["smell", "smells", "smelling", "odor", "odors", "stink",
              "stinks"],
    "stall": ["stall", "stalls", "stalling", "stalled", "die", "dies",
              "died", "dying"],
    "hot": ["hot", "overheat", "overheats", "overheating", "overheated",
            "heats", "temp", "temperature"],
    "highway": ["highway", "freeway", "interstate", "hwy"],
    "turn": ["turn", "turns", "turning", "turned"],
    "idle": ["idle", "idles", "idling", "idled"],
    "misfire": ["misfire", "misfires", "misfiring", "miss", "misses",
                "missing", "skipping", "skips"],
    "hesitate": ["hesitate", "hesitates", "hesitation", "hesitating", "bog",
                 "bogs", "bogging", "stumble", "stumbles", "stumbling"],
    # Words for newer problems (screens, turbos, 4WD, leaks inside, rust...).
    "screen": ["screen", "screens", "display", "displays", "touchscreen", "monitor"],
    "radio": ["radio", "radios", "stereo", "infotainment", "headunit"],
    "phone": ["phone", "phones", "bluetooth", "carplay"],
    "turbo": ["turbo", "turbos", "turbocharger", "turbocharged", "boost", "boosting", "boosted", "underboost", "overboost", "spool", "spools"],
    "whistle": ["whistle", "whistles", "whistling", "siren", "whoosh", "whooshing"],
    "4wd": ["4wd", "4x4", "awd", "4hi", "4lo", "ptu"],
    "speedometer": ["speedometer", "speedometers", "speedo", "tachometer", "tach", "odometer"],
    "coolant": ["coolant", "antifreeze"],
    "fob": ["fob", "fobs", "keyfob", "remote"],
    "wet": ["wet", "damp", "soaked", "soggy", "moist", "drenched"],
    "rain": ["rain", "rains", "raining", "rained", "rainy", "storm", "storms"],
    "rust": ["rust", "rusty", "rusted", "rusting", "rot", "rotted", "rotting"],
    "regen": ["regen", "regens", "regenerating", "regeneration"],
    "hybrid": ["hybrid", "hybrids", "ev", "evs", "phev", "prius"],
    "sag": ["sag", "sags", "sagging", "saggy"],
    "judder": ["judder", "judders", "juddering"],
}

# Flip the groups into one lookup table: variant -> canonical word.
SYNONYMS = {}
for canonical, variants in SYNONYM_GROUPS.items():
    for variant in variants:
        SYNONYMS[variant] = canonical


def stem(word):
    """Very light stemming: chop common endings so 'leaking' ~ 'leak'
    and 'rattling' ~ 'rattle'.

    Only used for words that are NOT in the synonym table.
    """
    if word.endswith("ing") and len(word) > 5:
        word = word[:-3]
    elif word.endswith("ed") and len(word) > 4:
        word = word[:-2]
    elif word.endswith("s") and len(word) > 3 and not word.endswith("ss"):
        word = word[:-1]
    # Drop a final "e" so "rattle"/"rattling" and "drive"/"driving" match.
    if word.endswith("e") and len(word) > 4:
        word = word[:-1]
    return word


def tokenize(text):
    """Turn a sentence into model features: words plus word pairs.

    "Grinding when I brake" -> ["grind", "when", "brake", "grind_when", "when_brake"]
    """
    words = re.findall(r"[a-z0-9]+", text.lower())
    cleaned = []
    for word in words:
        if word in STOPWORDS:
            continue
        if word in SYNONYMS:
            cleaned.append(SYNONYMS[word])
        else:
            cleaned.append(stem(word))
    # Bigrams: each pair of neighbours, joined with "_".
    bigrams = [cleaned[i] + "_" + cleaned[i + 1] for i in range(len(cleaned) - 1)]
    return cleaned + bigrams


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def load_data(path=DATA_FILE):
    """Read a CSV into two lists: texts and labels."""
    texts, labels = [], []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            texts.append(row["text"].strip())
            labels.append(row["label"].strip())
    return texts, labels


def make_vectorizer():
    # lowercase=False because tokenize() already lowercases.
    return CountVectorizer(analyzer=tokenize, lowercase=False)


def top_k_correct(probabilities, classes, true_labels, k):
    """How many rows had the right answer somewhere in the top k guesses."""
    top_k = np.argsort(probabilities, axis=1)[:, ::-1][:, :k]
    hits = 0
    for row, true_label in zip(top_k, true_labels):
        if true_label in classes[row]:
            hits += 1
    return hits


def cross_validate(texts, labels, alpha):
    """5-fold cross-validation: train on 4/5 of the data, test on the other
    1/5, rotate five times. This tells us how well the model does on
    sentences it has never seen."""
    texts = np.array(texts, dtype=object)
    labels = np.array(labels)
    folds = StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=42)
    top1 = top3 = 0
    for train_idx, test_idx in folds.split(texts, labels):
        vec = make_vectorizer()
        x_train = vec.fit_transform(texts[train_idx])
        x_test = vec.transform(texts[test_idx])
        model = MultinomialNB(alpha=alpha).fit(x_train, labels[train_idx])
        probs = model.predict_proba(x_test)
        top1 += top_k_correct(probs, model.classes_, labels[test_idx], 1)
        top3 += top_k_correct(probs, model.classes_, labels[test_idx], 3)
    return top1 / len(labels), top3 / len(labels)


def content_words(text):
    """Words in a sentence that the tokenizer keeps (drops "the", "my"...)."""
    return [w for w in text.split() if any("_" not in t for t in tokenize(w))]


def known_words(text, vocab):
    """How many single words the model recognizes. Same count as app.js."""
    return sum(1 for t in tokenize(text) if "_" not in t and t in vocab)


# Real descriptions are messier than training sentences cut short: on
# data/holdout.csv, guesses scored under about 0.9 were right less often than
# cross-validation says. So the curve is never allowed above this ceiling.
# It can only lower what the app shows, never raise it.
REAL_WORLD_CEILING = [[0, 0.1], [0.5, 0.2], [0.8, 0.35], [0.9, 0.55], [0.95, 0.8], [0.97, 0.9], [0.99, 0.97], [1, 0.97]]


def ceiling(score):
    for (x0, y0), (x1, y1) in zip(REAL_WORLD_CEILING, REAL_WORLD_CEILING[1:]):
        if score <= x1:
            return y0 + (score - x0) / (x1 - x0) * (y1 - y0)
    return REAL_WORLD_CEILING[-1][1]


# Calibration groups by how many words the model knows in the description.
def word_group(known):
    return "two" if known <= 2 else "few" if known <= 4 else "many"


def calibrate(texts, labels, alpha):
    """How often a top guess with a given score is really right.

    Naive Bayes scores run high, so the app doesn't show them raw. Every
    sentence is scored by a model that never saw it (5-fold), both whole and
    cut down to its first 2, 3, 4 and 6 words (people often type little).
    For 1-2, 3-4 and 5+ known words separately, a rising curve (isotonic
    regression) maps score -> share right. The app
    shows that share, and tests/check.py checks it against data/holdout.csv.
    """
    from sklearn.isotonic import IsotonicRegression
    texts = np.array(texts, dtype=object)
    labels = np.array(labels)
    points = {"two": ([], []), "few": ([], []), "many": ([], [])}
    for train_idx, test_idx in StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=7).split(texts, labels):
        vec = make_vectorizer()
        model = MultinomialNB(alpha=alpha).fit(vec.fit_transform(texts[train_idx]), labels[train_idx])
        for cut in (None, 2, 3, 4, 6):
            batch = [t if cut is None else " ".join(content_words(t)[:cut]) for t in texts[test_idx]]
            probs = model.predict_proba(vec.transform(batch))
            for text, row, truth in zip(batch, probs, labels[test_idx]):
                known = known_words(text, vec.vocabulary_)
                if not known:
                    continue
                best = row.argmax()
                xs, ys = points[word_group(known)]
                xs.append(row[best])
                ys.append(float(model.classes_[best] == truth))
    knots = [0, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.97, 0.99, 0.995, 0.999, 1]
    table = {}
    for name, (xs, ys) in points.items():
        fit = IsotonicRegression(y_min=0, y_max=1, out_of_bounds="clip").fit(xs, ys)
        table[name] = [[k, round(min(float(fit.predict([k])[0]), ceiling(k)), 3)] for k in knots]
        print(f"Calibration ({name}, {len(xs)} scored sentences): "
              + ", ".join(f"{k:g}->{v:.0%}" for k, v in table[name]))
    return table


def export(model, vec, path, accuracy, calibration):
    """Save everything the browser needs to repeat the math.

    Most words never appear in a given problem's examples, and smoothing
    gives all of those the same score. So each problem stores one
    "unseen" score plus the scores of the words it has actually seen.
    Same math as the full table, at a fraction of the file size.
    """
    vocab = {token: int(index) for token, index in vec.vocabulary_.items()}
    seen_rows, unseen = [], []
    for counts, row in zip(model.feature_count_, model.feature_log_prob_):
        seen = np.flatnonzero(counts)
        missing = np.flatnonzero(counts == 0)
        unseen.append(round(float(row[missing[0]]), 4) if len(missing) else 0.0)
        seen_rows.append({str(int(i)): round(float(row[i]), 4) for i in seen})
    data = {
        "classes": model.classes_.tolist(),
        "accuracy": accuracy,  # cross-validated scores, for reference
        "class_log_prior": [round(float(v), 4) for v in model.class_log_prior_],
        "unseen_log_prob": unseen,
        "feature_log_prob": seen_rows,  # {word index: score}, words this problem has seen
        "vocab": dict(sorted(vocab.items(), key=lambda kv: kv[1])),
        "calibration": calibration,  # score -> share really right (see calibrate)
    }
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


def main():
    texts, labels = load_data()
    print(f"Loaded {len(texts)} examples, {len(set(labels))} problems\n")

    print("alpha   top-1   top-3   (5-fold cross-validation)")
    best_alpha, best_score = None, (-1, -1)
    for alpha in ALPHAS:
        top1, top3 = cross_validate(texts, labels, alpha)
        print(f"{alpha:<6}  {top1:6.1%}  {top3:6.1%}")
        if (top1, top3) > best_score:
            best_alpha, best_score = alpha, (top1, top3)

    top1, top3 = best_score
    print(f"\nBest alpha: {best_alpha}  (top-1 {top1:.1%}, top-3 {top3:.1%})")

    # Final model uses ALL the data.
    vec = make_vectorizer()
    x_all = vec.fit_transform(texts)
    model = MultinomialNB(alpha=best_alpha).fit(x_all, labels)
    calibration = calibrate(texts, labels, best_alpha)
    export(model, vec, MODEL_FILE, {"top1": round(top1, 3), "top3": round(top3, 3), "examples": len(texts)}, calibration)
    size_kb = MODEL_FILE.stat().st_size / 1024
    print(f"Wrote {MODEL_FILE.relative_to(ROOT)} "
          f"({len(vec.vocabulary_)} features, {size_kb:.0f} KB)\n")

    # Held-out check: sentences the model has never seen in any form.
    # holdout2.csv was written 2026-10-22 after holdout.csv had been used to
    # tune things, so it is the cleaner test of the two.
    for name, path in [("Held-out everyday sentences", HOLDOUT_FILE), ("Fresh held-out set (holdout2)", HOLDOUT2_FILE)]:
        if not path.exists():
            continue
        h_texts, h_labels = load_data(path)
        probs = model.predict_proba(vec.transform(h_texts))
        h1 = top_k_correct(probs, model.classes_, h_labels, 1) / len(h_labels)
        h3 = top_k_correct(probs, model.classes_, h_labels, 3) / len(h_labels)
        print(f"{name} ({len(h_labels)}): top-1 {h1:.1%}, top-3 {h3:.1%}")
    print()

    samples = [
        "clicks when i turn the key and nothing happens",
        "grinding metal noise every time i stop",
        "steering wheel shakes at 70 on the freeway",
        "temp gauge in the red and steam from the hood",
        "ticking from the passenger side when its cold then goes away",
        "clunk from under the truck when i shift into drive",
    ]
    print("Sample predictions:")
    for text in samples:
        probs = model.predict_proba(vec.transform([text]))[0]
        best = np.argsort(probs)[::-1][:3]
        guesses = ", ".join(f"{model.classes_[i]} {probs[i]:.0%}" for i in best)
        print(f"  {text!r}\n    -> {guesses}")

    # Accuracy gate: GitHub Actions stops here (and keeps the old app live)
    # if new training data made the model worse than the target.
    if top1 < MIN_TOP1:
        print(f"\nFAIL: top-1 accuracy {top1:.1%} is below the {MIN_TOP1:.0%} target. "
              "Run this locally to see which problems get mixed up, then add clearer "
              "examples for them to data/symptoms.csv.")
        sys.exit(1)
    print(f"\nAccuracy target met: {top1:.1%} top-1 (target {MIN_TOP1:.0%}).")


if __name__ == "__main__":
    main()
