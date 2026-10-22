# Car Doctor

A phone app that helps figure out what's wrong with a car or truck. Type what you hear, feel or smell (or a trouble code like `P0300`) and it gives its top 3 guesses with what to check.

- **Works offline.** Install it on your home screen and it runs with no signal.
- **No AI service, no costs.** The diagnosis model is a small machine-learning model trained in Python from `data/symptoms.csv`, saved as JSON, and run right in the browser.
- **Private.** Your vehicle, repair log and training examples stay on your phone (localStorage). Nothing is sent anywhere: no accounts, cookies, analytics or trackers. "Delete all my data" in My Vehicle wipes it.

## What's in the app

| Tab | What it does |
|---|---|
| **Chat** | Describe the problem or tap a quick reply ("Grinding noise", "Check engine light", "Won't start"). It re-scores the whole conversation each time and shows the most likely cause with a severity badge (**Safe to drive / Get checked soon / Stop driving**), match %, DIY level, and the next thing to check. Two other possibilities sit underneath. Critical problems get a "Don't drive" banner. |
| **Codes** | One search box. Type `p0300` and it becomes `P0300`. Shows the meaning, likely causes and how hard it is to fix for 74 common OBD-II codes; unknown codes are decoded by their structure. "Diagnose with this code" sends it to the chat. |
| **My Vehicle** | Year, make, model, engine and mileage (shown on a card at the top of every screen), "Teach the model", privacy and terms, and a "Delete all my data" button. |
| **Log** | Repair log with date, mileage and notes, newest first. "That was it" in the chat adds an entry automatically. |

### Look and feel
- Dark "instrument cluster" theme with an amber accent; light mode toggle (top right), remembered on the phone.
- One font (Inter, stored in the app so it works offline; license in `app/fonts/Inter-OFL.txt`).
- Built for one hand: bottom tab bar, 44px+ tap targets, 16px+ inputs so iPhone doesn't zoom, iPhone safe areas respected.
- Smooth but subtle: tabs slide and fade, messages animate in after a "thinking" indicator, buttons press in, cards lift, skeleton loaders while the model loads. All motion turns off when the phone's **Reduce Motion** setting is on.
- Accessibility: screen reader labels, keyboard focus rings and arrow-key tabs, skip link, AA color contrast. Automated accessibility scan (axe) is clean on every tab in both themes.

## How the model works (plain English)

The model is **Naive Bayes**, one of the oldest and simplest text classifiers. It's the same idea early spam filters used.

1. **Clean the words.** "Grinding when I brake!" becomes `grind`, `brake`. Filler words like "the", "my" and "truck" are dropped. Words that mean the same thing are merged: *vibrate*, *wobble* and *shudder* all become `shake`. This synonym step matters a lot with a small dataset: it took accuracy from about 35% to 65% in testing. Endings are trimmed lightly (`leaking` → `leak`).
2. **Add word pairs.** Next to single words, it also uses pairs like `grind_brake`, because order carries meaning ("shake brake" is different from "shake highway").
3. **Count.** For each problem, count how often each word shows up in its example sentences. "Grind" shows up a lot for worn brake pads, rarely for the A/C.
4. **Score.** For a new sentence, each problem gets a score: *how common is this problem* × *how likely is each word, if it were this problem*. The problem whose examples best "explain" your words wins.
5. **Smooth.** A word never seen with a problem would give it a score of zero, so a small number (`alpha`) is added to every count. Training tries several values and keeps the best.
6. **Percentages.** Scores are turned into percentages that add up to 100% (softmax).

It's called "naive" because it pretends each word is independent of the others. That's not true, but it works surprisingly well and the math is tiny: the browser does it in a few milliseconds.

**Trouble codes** get extra weight: a known code adds +3 to its related problem's log-score (roughly 20× more likely).

### How accurate is it?

`model/train.py` uses **5-fold cross-validation**: it hides 1/5 of the examples, trains on the rest, tests on the hidden part, and repeats 5 times. So these numbers are on sentences the model didn't see.

Current results (689 examples, 25 problems):

| alpha | top-1 | top-3 |
|---|---|---|
| 0.05 | 86.9% | 97.0% |
| 0.1 | 87.5% | 97.2% |
| 0.3 | 88.7% | 97.5% |
| **0.5 (picked)** | **88.8%** | **97.5%** |
| 1.0 | 88.0% | 97.7% |

- **Top-1** = its first guess was right. **Top-3** = the right answer was in its 3 guesses.
- Targets: 60%+ top-1 and 80%+ top-3.
- Real-world accuracy will be lower, since all examples so far were written by one person. Adding your own real cases (see below) is the best way to improve it.

## Project layout

```
data/symptoms.csv              training data: label,text (one sentence per row)
model/train.py                 trains the model and writes app/model.json
model/make_icons.py            draws the app icons (Pillow)
tests/check.py                 consistency checks (Python vs browser, data files)
app/                           the app (this folder is what gets published)
  index.html, style.css, app.js
  theme.js                     applies light/dark before the page draws
  fonts/                       Inter font + its open font license
  causes.json                  info for each problem
  codes.json                   OBD-II code database
  model.json                   made by train.py, never edit by hand
  sw.js                        offline support (service worker)
  manifest.webmanifest, icons/
.github/workflows/deploy.yml   on push to main: train, test, publish app/
```

## Put it online (GitHub Pages)

One-time setup:

1. On GitHub, open this repo → **Settings** → **Pages**.
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**.
3. Go to the **Actions** tab. If the last "Train, test and deploy" run failed (it ran before Pages was on), open it and tap **Re-run all jobs**.
4. When it's green, the app is at **https://caylor-made-technologies.github.io/car-doctor/**

Every push to `main` after that retrains the model, runs the checks, and updates the site. If the checks fail, the old version stays live.

### Install on your phone

- **iPhone (Safari):** open the link → Share button → **Add to Home Screen** → Add.
- **Android (Chrome):** open the link → ⋮ menu → **Add to Home screen** (or **Install app**).

Open it once while online; after that it works offline.

## Make it smarter

### Add training examples
1. In the app, diagnose a problem and tap **✔ That was it** or **✖ Something else** → pick the right cause.
2. Go to **My Vehicle → Teach the model → Copy as CSV**.
3. On GitHub, open `data/symptoms.csv` → ✏️ edit → paste at the end → **Commit changes**.
4. GitHub Actions retrains and redeploys in a couple of minutes.

You can also just type new lines yourself: `label,how a person would describe it`. No commas inside the sentence. Casual wording is best ("clunks when i go over railroad tracks").

### Add a new problem
1. Pick a label like `bad_fuel_injector` (lowercase, underscores).
2. Add an entry to `app/causes.json` with `name`, `severity` (low/medium/high/critical), `diy` (Easy/Medium/Hard/Shop), `summary` and 3–4 `checks`.
3. Add **at least 10** varied sentences for it to `data/symptoms.csv`.
4. Push. `tests/check.py` fails the deploy if the label and cause don't match.

### Add a trouble code
Add to `app/codes.json`:
```json
"P0442": { "title": "EVAP system small leak detected", "causes": ["Loose gas cap", "..."], "related": "vacuum_leak" }
```
`related` must be a key from `causes.json`.

### If you change the word cleaning
`STOPWORDS`, `SYNONYM_GROUPS`, `stem()` and `tokenize()` exist in both `model/train.py` and `app/app.js`. Change both the same way. `tests/check.py` checks they give identical tokens and predictions.

After changing anything in `app/`, bump `VERSION` in `app/sw.js` so phones pick up the new files.

## Run it on your computer

```bash
pip install -r requirements.txt
python model/train.py        # prints accuracy, writes app/model.json
python tests/check.py        # needs Node.js installed
python -m http.server 8000 -d app
```
Open http://localhost:8000.

## Privacy and terms

The app's privacy and terms text lives in the My Vehicle tab. It's a plain-English template: have a Texas attorney review it before promoting the app widely.

## Safety

Car Doctor gives **guidance only**. It is not a professional diagnosis, and it can be wrong. Brakes, steering, overheating, fuel leaks and exhaust in the cab can be dangerous: if something feels unsafe, don't drive it, and have a qualified mechanic check it. Always use jack stands, chock the wheels, and let the engine cool before working on it. Specs in the app are typical values; check your vehicle's service manual.

## Future ideas

- **Sound recording:** attach a short recording to repair log entries; later, train a sound classifier on those clips (squeal vs. grind vs. tick).
- **Bluetooth OBD-II adapter:** read codes and live data (fuel trims, coolant temp, voltage) straight into the app with Web Bluetooth.
- **Vehicle-specific known issues:** boost causes that are common for the saved make/model/engine (e.g. GM 6.0L knock sensors, exhaust manifold bolts).
