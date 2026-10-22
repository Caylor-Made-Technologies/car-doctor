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
}

# Flip the groups into one lookup table: variant -> canonical word.
SYNONYMS = {}
for canonical, variants in SYNONYM_GROUPS.items():
    for variant in variants:
        SYNONYMS[variant] = canonical


def stem(word):
    """Very light stemming: chop common endings so 'leaking' ~ 'leak'.

    Only used for words that are NOT in the synonym table.
    """
    if word.endswith("ing") and len(word) > 5:
        return word[:-3]
    if word.endswith("ed") and len(word) > 4:
        return word[:-2]
    if word.endswith("s") and len(word) > 3 and not word.endswith("ss"):
        return word[:-1]
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

def load_data():
    """Read the CSV into two lists: texts and labels."""
    texts, labels = [], []
    with open(DATA_FILE, newline="", encoding="utf-8") as f:
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


def export(model, vec, path, accuracy):
    """Save everything the browser needs to repeat the math."""
    vocab = {token: int(index) for token, index in vec.vocabulary_.items()}
    data = {
        "classes": model.classes_.tolist(),
        "accuracy": accuracy,  # cross-validated scores, for reference
        "class_log_prior": [round(float(v), 4) for v in model.class_log_prior_],
        "feature_log_prob": [[round(float(v), 4) for v in row]
                             for row in model.feature_log_prob_],
        "vocab": dict(sorted(vocab.items(), key=lambda kv: kv[1])),
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
    export(model, vec, MODEL_FILE, {"top1": round(top1, 3), "top3": round(top3, 3), "examples": len(texts)})
    size_kb = MODEL_FILE.stat().st_size / 1024
    print(f"Wrote {MODEL_FILE.relative_to(ROOT)} "
          f"({len(vec.vocabulary_)} features, {size_kb:.0f} KB)\n")

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
