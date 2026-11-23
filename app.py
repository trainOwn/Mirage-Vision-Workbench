"""Flask app: upload an image, get the raw Mirage JSON, render everything client-side.

Mirrors the joemaddalone/mirage-demo architecture: the server is a thin JSON
API (POST /api/describe), and app.js does all canvas drawing, hover/click
highlighting, and list rendering from the raw response.
"""

import os
import tempfile
import time

import psutil
from flask import Flask, jsonify, render_template, request
import cactus

app = Flask(__name__)

_model = None
_process = psutil.Process()


def get_model():
    global _model
    if _model is None:
        _model = cactus.Mirage()
    return _model


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/describe", methods=["POST"])
def describe():
    image = request.files.get("image")
    if image is None:
        return jsonify({"error": "no image uploaded"}), 400

    suffix = (
        "." + image.filename.rsplit(".", 1)[-1]
        if "." in (image.filename or "")
        else ".jpg"
    )
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        image.save(path)
        psutil.cpu_percent(interval=None)  # reset the sampling window
        t0 = time.perf_counter()
        result = get_model().describe(path)
        server_ms = (time.perf_counter() - t0) * 1000
        cpu_percent = psutil.cpu_percent(interval=None)
    finally:
        os.close(fd)
        os.unlink(path)

    mem = psutil.virtual_memory()
    return jsonify({
        "result": result,
        "filename": image.filename,
        "serverMs": server_ms,
        "cpuPercent": cpu_percent,
        "memUsedMb": round((mem.total - mem.available) / 1e6, 1),
        "memTotalMb": round(mem.total / 1e6, 1),
        "processRssMb": round(_process.memory_info().rss / 1e6, 1),
        "npu": "not used — Mirage's cactus engine has no NPU backend, CPU only",
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
