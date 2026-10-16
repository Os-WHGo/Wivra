#!/usr/bin/env python3
"""Static preflight checklist for Wivra mobile, not a device test or emulator.

This script reads source files locally, never modifies a project or phones,
never connects to accounts, and never claims that Meta DAT hardware works.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

LANGUAGES = ("es", "en", "fr", "de", "it", "ja")
CHECKS = (
    ("ios_meta_receiver", "streaming/ios/B0/Sources/MetaB0Model.swift",
     ("MWDATCamera", "framesReceived")),
    ("ios_phone_camera", "streaming/ios/B0/Sources/WivraIPhoneCamera.swift",
     ("AVCaptureSession", "requestAccess")),
    ("ios_camera_permission", "streaming/ios/B0/Info.plist",
     ("NSCameraUsageDescription", "NSMicrophoneUsageDescription")),
    ("ios_network_observer", "streaming/ios/B0/Sources/WivraPhoneNetworkStatus.swift",
     ("NWPathMonitor", ".wifi", ".cellular")),
    ("android_meta_receiver",
     "streaming/android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt",
     ("addCamera(", "Permission.CAMERA")),
    ("android_network_permission", "streaming/android/app/src/main/AndroidManifest.xml",
     ("android.permission.ACCESS_NETWORK_STATE",)),
    ("android_network_observer",
     "streaming/android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt",
     ("ConnectivityManager", "registerDefaultNetworkCallback", "unregisterNetworkCallback")),
    ("ios_pending_recovery",
     "streaming/ios/B0/Sources/WivraPendingRecordingStore.swift",
     ("pending", "recover")),
    ("android_checkpoint",
     "streaming/android/app/src/main/java/com/oswhgo/wivra/WivraSegmentedHevcRecorder.kt",
     ("class WivraSegmentedHevcRecorder",)),
)


def source_checks(root):
    results = []
    for name, relative, markers in CHECKS:
        target = root / relative
        if not target.is_file():
            results.append({"id":name,"status":"missing","path":relative})
            continue
        try:
            data = target.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            results.append({"id":name,"status":"unreadable","path":relative})
            continue
        missing = [token for token in markers if token not in data]
        results.append({"id":name,"status":"present" if not missing else "incomplete",
                        "path":relative,"missing_markers":missing})
    for language in LANGUAGES:
        ios = f"streaming/ios/B0/Resources/{language}.lproj/Localizable.strings"
        droid_dir = "values" if language=="es" else f"values-{language}"
        android = f"streaming/android/app/src/main/res/{droid_dir}/strings.xml"
        for name, relative, marker in [
            (f"ios_localization_{language}",ios,'"ios.network.wifi"'),
            (f"android_localization_{language}",android,'name="mobile_network_wifi"')
        ]:
            target = root / relative
            if not target.is_file():
                status = "missing"
            else:
                try:
                    status = "present" if marker in target.read_text(encoding="utf-8") else "incomplete"
                except (OSError, UnicodeError):
                    status = "unreadable"
            results.append({"id":name,"status":status,"path":relative})
    return results


def report(root):
    checks = source_checks(root)
    passed = sum(c["status"]=="present" for c in checks)
    return {
        "schema":"wivra-mobile-static-qa-1",
        "scope":"read-only-source-inspection",
        "static_checks":{"passed":passed,"total":len(checks),"results":checks},
        "physical_tests":[
            {"id":"ios_dat_real_glasses","status":"not_run",
             "action":"Confirm actual DAT frames, FPS and thermal response on physical iPhone."},
            {"id":"android_dat_real_glasses","status":"not_run",
             "action":"Confirm actual DAT frames, FPS and thermal response on physical Android."},
            {"id":"wifi_vs_cellular","status":"not_run",
             "action":"Compare OS route indicator on Wi-Fi, cellular and offline on real phones."},
            {"id":"long_recording_recovery","status":"not_run",
             "action":"Review a real long recording, interruptions, original media and Save/Later/Delete."},
            {"id":"mobile_live_publish","status":"not_run",
             "action":"Confirm publisher only after explicit user consent, platform access and real upload validation."},
        ],
        "warnings":[
            "String presence is not a native build, integration test or security review.",
            "A green static result does NOT mean iPhone/Android cameras, Wi-Fi or LIVE work.",
            "No files or device settings were modified."
        ]
    }


def main(argv=None):
    parser=argparse.ArgumentParser(description="Read-only Wivra mobile source QA checklist")
    parser.add_argument("--repo", default=".", help="Local root of an existing Wivra checkout")
    parser.add_argument("--json", action="store_true")
    args=parser.parse_args(argv)
    root=Path(args.repo).expanduser().resolve()
    if not (root / "AGENTS.md").is_file() or not (root / "streaming").is_dir():
        print("Not a Wivra repository root",file=sys.stderr)
        return 2
    data=report(root)
    if args.json:
        print(json.dumps(data,indent=2,ensure_ascii=False))
    else:
        tally=data["static_checks"]
        print(f"Wivra source-only preflight: {tally['passed']}/{tally['total']} markers present")
        for check in tally["results"]:
            print(f"  [{check['status']}] {check['id']}")
        print("Physical device checks: NOT RUN. Neither DAT nor LIVE is verified by this command.")
    return 0 if data["static_checks"]["passed"]==data["static_checks"]["total"] else 1


if __name__ == "__main__":
    sys.exit(main())
