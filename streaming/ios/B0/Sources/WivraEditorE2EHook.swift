// W86 (Claude): CI-only check of automatic subtitles inside the REAL editor WKWebView of the
// iOS Simulator. Compiled only in Debug builds and active only when the CI launches the app
// with WIVRA_E2E=1 after copying driver.js + input.json into the app's own Documents/wv-e2e.
// It runs the shared driver (tools/whisper-wasm/e2e-driver.js), waits for its result and
// writes it to Documents/wv-e2e/output.json. Release builds contain none of this.
#if DEBUG
import Foundation
import WebKit

@MainActor
enum WivraEditorE2EHook {
    static func startIfRequested(_ webView: WKWebView) {
        guard ProcessInfo.processInfo.environment["WIVRA_E2E"] == "1",
              let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let dir = docs.appendingPathComponent("wv-e2e", isDirectory: true)
        guard let driver = try? String(contentsOf: dir.appendingPathComponent("driver.js"), encoding: .utf8),
              let input = try? String(contentsOf: dir.appendingPathComponent("input.json"), encoding: .utf8) else {
            print("WIVRA-E2E: no driver/input in \(dir.path)")
            return
        }
        let output = dir.appendingPathComponent("output.json")
        try? FileManager.default.removeItem(at: output)
        Task { @MainActor [weak webView] in
            try? await Task.sleep(for: .seconds(8))
            guard let webView else { return }
            _ = await run(webView, "window.__wvE2EIn = " + input + "; 'set'")
            _ = await run(webView, driver + "\n;'started'")
            print("WIVRA-E2E: started")
            for _ in 0..<900 {
                try? await Task.sleep(for: .seconds(2))
                guard let value = await run(webView, "String(window.__wvE2EOut)"), value != "running" else { continue }
                try? value.write(to: output, atomically: true, encoding: .utf8)
                print("WIVRA-E2E: done")
                return
            }
        }
    }

    private static func run(_ webView: WKWebView, _ script: String) async -> String? {
        await withCheckedContinuation { (done: CheckedContinuation<String?, Never>) in
            webView.evaluateJavaScript(script) { value, _ in done.resume(returning: value as? String) }
        }
    }
}
#endif
