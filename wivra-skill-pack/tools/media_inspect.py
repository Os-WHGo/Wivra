#!/usr/bin/env python3
"""Read-only local media diagnostics for Wivra. No uploads, modifications or transcription.

Inspired by Jake Schincariol's MIT-licensed master-skills/edit media probing
workflow, but independently implemented for Wivra. ffprobe is optional.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

TIMEOUT_SECONDS = 20
MAX_REPORT_BYTES = 2_000_000


def fraction(value):
    """Float representation of an ffprobe ratio, or None when not meaningful."""
    try:
        if isinstance(value, (int, float)):
            v = float(value)
        elif "/" in str(value):
            numerator, denominator = str(value).split("/", 1)
            v = float(numerator) / float(denominator)
        else:
            v = float(value)
        if not (0 <= v < float("inf")):
            return None
        return round(v, 4)
    except (ValueError, TypeError, ZeroDivisionError, OverflowError):
        return None


def number(value):
    try:
        v = float(value)
        return round(v, 4) if 0 <= v < float("inf") else None
    except (ValueError, TypeError, OverflowError):
        return None


def media_summary(report, filename):
    if not isinstance(report, dict) or not isinstance(report.get("streams"), list):
        raise ValueError("ffprobe returned invalid stream metadata")
    videos, audios, others = [], [], []
    notes = []
    for stream in report["streams"]:
        if not isinstance(stream, dict):
            continue
        kind = stream.get("codec_type")
        common = {
            "index": stream.get("index"),
            "codec": stream.get("codec_name") or "unknown",
        }
        if kind == "video":
            original = fraction(stream.get("r_frame_rate"))
            average = fraction(stream.get("avg_frame_rate"))
            rotation = (stream.get("tags") or {}).get("rotate")
            for extra in stream.get("side_data_list") or []:
                if isinstance(extra, dict) and "rotation" in extra:
                    rotation = extra["rotation"]
                    break
            videos.append({
                **common,
                "width": stream.get("width"),
                "height": stream.get("height"),
                "nominal_fps": original,
                "average_fps": average,
                "rotation_degrees": number(abs(float(rotation))) if str(rotation).lstrip("-").replace(".","",1).isdigit() else None,
                "pixel_format": stream.get("pix_fmt"),
                "color_transfer": stream.get("color_transfer"),
                "color_primaries": stream.get("color_primaries"),
            })
            if original and average and abs(original-average)>0.05:
                notes.append("Nominal and average FPS differ; inspect frame timestamps for possible VFR.")
        elif kind == "audio":
            audios.append({
                **common,
                "sample_rate": int(stream["sample_rate"]) if str(stream.get("sample_rate", "")).isdigit() else None,
                "channels": stream.get("channels"),
                "channel_layout": stream.get("channel_layout"),
                "duration_seconds": number(stream.get("duration")),
            })
        else:
            others.append(common)

    if not videos:
        notes.append("No video stream; this may be an intentional audio-only recording.")
    if not audios:
        notes.append("No embedded audio stream; check for a separate Wivra CAF/audio sidecar before assuming silence.")
    if any(s["codec"] in ("hevc", "h265") for s in videos):
        notes.append("HEVC compatibility may vary across mobile and browser decoders.")
    return {
        "schema": "wivra-media-inspect-1",
        "file": Path(filename).name,
        "container": (report.get("format") or {}).get("format_name", "unknown"),
        "duration_seconds": number((report.get("format") or {}).get("duration")),
        "video": videos,
        "audio": audios,
        "other_streams": others,
        "notes": notes,
        "limits": [
            "Container metadata does not prove a clip plays to completion.",
            "No DAT camera hardware, microphone routing or LIVE upload has been tested.",
            "This command never reads or validates the Wivra capture manifest."
        ],
    }


def inspect(path, executable="ffprobe"):
    source = Path(path)
    if not source.is_file():
        raise ValueError("Input must be an existing local media file")
    if not shutil.which(executable):
        raise RuntimeError("ffprobe is not installed; install or configure it separately")
    command = [
        executable, "-v", "error", "-show_format", "-show_streams",
        "-of", "json", "--", str(source.resolve())
    ]
    try:
        process = subprocess.run(
            command, text=True, capture_output=True, timeout=TIMEOUT_SECONDS,
            check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("ffprobe timed out") from exc
    except OSError as exc:
        raise RuntimeError("ffprobe could not start") from exc
    if process.returncode != 0:
        raise RuntimeError("ffprobe could not inspect this file")
    if len(process.stdout.encode("utf-8")) > MAX_REPORT_BYTES:
        raise RuntimeError("ffprobe report exceeds the supported size")
    try:
        report = json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("ffprobe returned invalid JSON") from exc
    return media_summary(report, source.name)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only diagnostics for a Wivra local media file")
    parser.add_argument("file", nargs="?", help="Existing MOV, MP4, CAF, WAV or other media file")
    parser.add_argument("--json", action="store_true", help="Machine-readable result")
    parser.add_argument("--doctor", action="store_true", help="Check optional local tools")
    args = parser.parse_args(argv)
    if args.doctor:
        result = {"ffprobe_available":bool(shutil.which("ffprobe")),
                  "ffmpeg_available":bool(shutil.which("ffmpeg")),
                  "network_required":False,"originals_modified":False}
        print(json.dumps(result, indent=2))
        return 0
    if not args.file:
        parser.error("a media file or --doctor is required")
    try:
        result = inspect(args.file)
    except (RuntimeError, ValueError) as exc:
        print(f"Wivra media inspection failed: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"Wivra media diagnostics: {result['file']}")
        print(f"Container: {result['container']} · Duration: {result['duration_seconds']}s")
        for stream in result["video"]:
            print(f"Video #{stream['index']}: {stream['codec']} "
                  f"{stream['width']}x{stream['height']} @ {stream['average_fps']} avg FPS")
        for stream in result["audio"]:
            print(f"Audio #{stream['index']}: {stream['codec']}, "
                  f"{stream['channels']} channels @ {stream['sample_rate']} Hz")
        for note in result["notes"]:
            print(f"Note: {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
