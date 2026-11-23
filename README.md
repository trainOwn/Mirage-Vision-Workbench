<div align="center">

# 🌵 Mirage Vision Workbench

**A local CPU benchmark + a Flask UI for [Cactus Compute's Mirage](https://huggingface.co/Cactus-Compute/mirage) vision model**

<p>
  <img alt="python" src="https://img.shields.io/badge/python-3.9%2B-3776AB?logo=python&logoColor=white">
  <img alt="flask" src="https://img.shields.io/badge/flask-3.x-000000?logo=flask&logoColor=white">
  <img alt="uv" src="https://img.shields.io/badge/package%20manager-uv-DE5FE9?logo=uv&logoColor=white">
  <img alt="model" src="https://img.shields.io/badge/model-Mirage%20(51.3M%20params)-22c55e">
</p>

Mirage describes an image and hands back a single structured JSON blob — scene,
objects, regions, OCR text, spatial relations, events, and the model's own
reasoning. This repo benchmarks it on CPU and ships two different UIs for
poking at the output.

</div>

<br>

<table>
<tr>
<td width="50%" valign="top">

### 🖥️ Real inference app
`app.py` + `templates/` + `static/`

A dev-terminal-styled workbench: drag/drop an image, hit **Describe**, and
every field the model returns lands on a canvas overlay — objects, masks,
OCR boxes, relation lines, event badges — with a confidence slider, a
click-to-spotlight inspector, and a raw-JSON terminal panel.

</td>
<td width="50%" valign="top">

### ⏱️ CPU benchmark
`bench.py`

Times model load (weight fetch) once, then `describe()` over N repeated
calls, reporting mean / median / min / max latency and images/sec — no
GUI required.

</td>
</tr>
</table>

---

## Quickstart

All three pieces use [`uv`](https://github.com/astral-sh/uv) for fast,
reproducible installs — no manual venv setup needed.

```bash
uv run app.py
# → http://127.0.0.1:5000
```

```bash
# CPU benchmark — bundled sample image, or point it at your own
uv run bench.py
uv run bench.py test_images/img3.jpg --iterations 20
```

<details>
<summary><strong>What <code>bench.py</code> prints</strong></summary>

```json
{
  "image": "test_images/img3.jpg",
  "load_time_s": 0.8007,
  "iterations": 10,
  "times_s": [1.98, 1.96, 1.99, "..."],
  "mean_s": 1.98,
  "median_s": 1.99,
  "min_s": 1.96,
  "max_s": 2.08,
  "images_per_sec": 0.505
}
```

</details>

---

## Measured CPU performance

Captured on a stock x86 dev machine, full `describe()` call (all 7
sections), no GPU:

| image | mean latency | images / sec |
|---|---|---|
| garden portrait | 2.02 s | 0.50 |
| puppy / fence | 1.86 s | 0.54 |
| rural road (27 objects) | 1.98 s | 0.50 |
| city skyline | 1.93 s | 0.52 |
| jewelry macro | 1.70 s | 0.59 |

Model load (first construction, includes a one-time weight download) adds
roughly **0.8 – 2.5 s** on top, once per process. The model's own marketing
figure (~107 ms) is measured on a phone NPU/CPU — this table is the honest
number for a generic desktop CPU path.

---

## What Mirage actually returns

One call, one JSON object, seven keys:

<details open>
<summary><strong>Example response (trimmed)</strong></summary>

```json
{
  "scene": { "setting": "roadside", "lighting": "daylight", "weather": "clear" },
  "objects": [
    { "id": 1, "name": "tree", "bbox": [73, 42, 133, 116], "score": 0.42,
      "mask": [98, 50, 82, 63, "..."], "position": "background",
      "description": { "color": "green" } }
  ],
  "regions": [
    { "id": 8, "name": "building", "position": "background", "description": { "color": "white" } }
  ],
  "text": [
    { "string": "STOP", "bbox": [310, 180, 410, 220], "score": 0.80 }
  ],
  "relations": [
    { "subject": 5, "predicate": "on", "object": 3 }
  ],
  "events": [
    { "actor": 5, "action": "driving" }
  ],
  "reasoning": "lang: en | red truck, white car, yellow curb | trucks drive on roads | cannot know destination"
}
```

</details>

**The one thing that trips people up**: `bbox` and `mask` coordinates are
**not pixels** — they're normalized independently per axis to a `0–1000`
scale (`x * 1000 / image_width`, `y * 1000 / image_height`). The app draws
straight from that space (a canvas scaled by `/1000 * width|height`) so
nothing needs manual rescaling.

---

## Project layout

```text
.
├── app.py                   # Flask JSON API — POST /api/describe
├── bench.py                 # CPU latency benchmark (CLI)
├── make_sample.py           # generates the synthetic sample.png
├── templates/index.html     # 3-column workbench shell
├── static/
│   ├── css/style.css        # dark dev-terminal theme
│   └── js/app.js            # canvas drawing, hover/click/spotlight, inspector
└── test_images/             # sample jpgs used for benchmarking & demos
```

---

## Credits

- Model: [Cactus-Compute/mirage](https://huggingface.co/Cactus-Compute/mirage) · [blog post](https://cactuscompute.com/blog/mirage) · Apache 2.0
- Python package: [`cactus-compute`](https://pypi.org/project/cactus-compute/) (`pip install -U cactus-compute`)

<div align="center">
<sub>Built for local experimentation — nothing here leaves your machine.</sub>
</div>
