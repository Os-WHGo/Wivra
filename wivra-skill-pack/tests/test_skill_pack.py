"""Wivra's offline skill-pack tests. No external API, camera or ffprobe required."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "tools"))
import media_inspect
import mobile_qa


def synthetic_probe():
    return {
        "format":{"duration":"14.3","format_name":"mov,mp4,m4a,3gp,3g2,mj2"},
        "streams":[
            {"index":0,"codec_type":"video","codec_name":"hevc",
             "width":504,"height":896,"r_frame_rate":"24/1",
             "avg_frame_rate":"24000/1001","tags":{"rotate":"-90"},
             "pix_fmt":"yuv420p10le","color_transfer":"arib-std-b67"},
            {"index":1,"codec_type":"audio","codec_name":"aac",
             "sample_rate":"48000","channels":2,"channel_layout":"stereo",
             "duration":"14.0"},
        ]
    }


class MediaInspectTests(unittest.TestCase):
    def test_fraction_invalid_and_negative(self):
        self.assertEqual(media_inspect.fraction("30000/1001"),29.97)
        self.assertIsNone(media_inspect.fraction("1/0"))
        self.assertIsNone(media_inspect.fraction("N/A"))
        self.assertIsNone(media_inspect.fraction("-2/1"))

    def test_hevc_audio_rotation_and_inferred_vfr_warning(self):
        result = media_inspect.media_summary(synthetic_probe(),"/private/POV.mov")
        self.assertEqual(result["file"],"POV.mov")
        self.assertEqual(result["duration_seconds"],14.3)
        self.assertEqual(result["video"][0]["rotation_degrees"],90)
        self.assertEqual(result["video"][0]["width"],504)
        self.assertEqual(result["audio"][0]["sample_rate"],48000)
        self.assertTrue(any("timestamps" in x for x in result["notes"]))
        self.assertTrue(any("HEVC" in x for x in result["notes"]))
        self.assertNotIn("/private/",json.dumps(result))

    def test_audio_only_sidecar_is_not_falsely_treated_as_failure(self):
        report={"format":{"format_name":"caf"},"streams":[{
            "index":0,"codec_type":"audio","codec_name":"pcm_f32le",
            "sample_rate":"48000","channels":1}]}
        result=media_inspect.media_summary(report,"mic.caf")
        self.assertEqual(result["video"],[])
        self.assertEqual(len(result["audio"]),1)
        self.assertTrue(any("intentional audio-only" in x for x in result["notes"]))

    def test_video_only_prompts_sidecar_check(self):
        report={"streams":[{"index":0,"codec_type":"video","codec_name":"hevc"}]}
        result=media_inspect.media_summary(report,"clip.mov")
        self.assertEqual(result["audio"],[])
        self.assertTrue(any("CAF/audio sidecar" in x for x in result["notes"]))

    def test_rejects_bad_ffprobe_structure(self):
        with self.assertRaisesRegex(ValueError,"invalid stream metadata"):
            media_inspect.media_summary({"streams":None},"test.mov")

    def test_missing_ffprobe_does_not_install(self):
        with tempfile.NamedTemporaryFile() as stream:
            with patch.object(media_inspect.shutil,"which",return_value=None):
                with self.assertRaisesRegex(RuntimeError,"not installed"):
                    media_inspect.inspect(stream.name)

    def test_local_inspection_is_read_only_no_shell_and_no_network(self):
        with tempfile.NamedTemporaryFile(suffix=".mov") as stream:
            fake=SimpleNamespace(returncode=0,stdout=json.dumps(synthetic_probe()),stderr="")
            with patch.object(media_inspect.shutil,"which",return_value="/usr/bin/ffprobe"),\
                 patch.object(media_inspect.subprocess,"run",return_value=fake) as called:
                result=media_inspect.inspect(stream.name)
            self.assertEqual(result["file"],Path(stream.name).name)
            args,kwargs=called.call_args
            self.assertEqual(args[0][0],"ffprobe")
            self.assertEqual(args[0][-2],"-i")
            self.assertEqual(args[0][-1],str(Path(stream.name).resolve()))
            self.assertFalse(kwargs.get("shell",False))
            self.assertFalse(kwargs.get("check",False))
            self.assertEqual(kwargs["timeout"],20)

    def test_rejects_failed_ffprobe_without_leaking_stderr(self):
        with tempfile.NamedTemporaryFile() as stream:
            fake=SimpleNamespace(returncode=1,stdout="",stderr="PRIVATE_API_KEY=abc")
            with patch.object(media_inspect.shutil,"which",return_value="/usr/bin/ffprobe"),\
                 patch.object(media_inspect.subprocess,"run",return_value=fake):
                with self.assertRaisesRegex(RuntimeError,"could not inspect") as error:
                    media_inspect.inspect(stream.name)
            self.assertNotIn("PRIVATE_API_KEY",str(error.exception))

    def test_rejects_oversized_probe_json(self):
        with tempfile.NamedTemporaryFile() as stream:
            fake=SimpleNamespace(returncode=0,stdout=" "*2_000_001,stderr="")
            with patch.object(media_inspect.shutil,"which",return_value="/usr/bin/ffprobe"),\
                 patch.object(media_inspect.subprocess,"run",return_value=fake):
                with self.assertRaisesRegex(RuntimeError,"exceeds"):
                    media_inspect.inspect(stream.name)


class MobileQATests(unittest.TestCase):
    def test_empty_repo_markers_are_not_a_pass(self):
        with tempfile.TemporaryDirectory() as d:
            result=mobile_qa.report(Path(d))
        self.assertEqual(result["static_checks"]["passed"],0)
        self.assertGreater(result["static_checks"]["total"],10)
        self.assertEqual({x["status"] for x in result["physical_tests"]},{"not_run"})

    def test_source_check_is_static_and_sensitive_content_is_not_returned(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            markers_by_path = {}
            for _,relative,markers in mobile_qa.CHECKS:
                markers_by_path.setdefault(relative, set()).update(markers)
            for relative, markers in markers_by_path.items():
                target=root/relative
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text("\n".join(sorted(markers))+"\nsecret=NEVER_RETURN",encoding="utf-8")
            result=mobile_qa.report(root)
        for x in result["static_checks"]["results"]:
            if x["id"] in {y[0] for y in mobile_qa.CHECKS}:
                self.assertEqual(x["status"],"present")
        self.assertNotIn("NEVER_RETURN",json.dumps(result))
        self.assertEqual(result["scope"],"read-only-source-inspection")

    def test_project_scoped_skill_descriptors_present(self):
        repo=HERE.parent
        for path in (".claude/skills/wivra-media-inspect/SKILL.md",
                     ".claude/skills/wivra-mobile-qa/SKILL.md"):
            text=(repo/path).read_text("utf-8")
            self.assertTrue(text.startswith("---\nname: wivra-"))
            self.assertIn("description:",text)
            self.assertIn("ChatGPT",text)
            self.assertIn("Claude",text)


if __name__=="__main__":
    unittest.main()
