// W96 (Claude): the Director's script over the iPhone camera preview, like the Android camera.
// A SwiftUI overlay: AVFoundation records only the camera, so the text never appears in the video.
// The script arrives from the editor through host.openNative('capture', script); nothing starts by itself.
import Observation
import SwiftUI

@Observable
@MainActor
final class WivraTeleprompterStore {
    static let shared = WivraTeleprompterStore()
    var script: String?

    /// Same limit as Android (2200 characters); control characters removed except line breaks.
    nonisolated static func sanitized(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let kept = raw.unicodeScalars.filter { $0 == "\n" || !CharacterSet.controlCharacters.contains($0) }
        let text = String(String.UnicodeScalarView(kept)).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 2200 else { return nil }
        return text
    }
}

struct WivraTeleprompterOverlay: View {
    let store: WivraTeleprompterStore
    @State private var playing = false
    @State private var offset: CGFloat = 0
    @State private var textHeight: CGFloat = 0
    @State private var speed: CGFloat = 28          // points per second
    private let windowHeight: CGFloat = 130

    var body: some View {
        if let script = store.script {
            VStack(spacing: 6) {
                GeometryReader { box in
                    Text(script)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .frame(width: box.size.width)
                        .fixedSize(horizontal: false, vertical: true)
                        .background(GeometryReader { t in Color.clear.onAppear { textHeight = t.size.height } })
                        .offset(y: -offset)
                }
                .frame(height: windowHeight)
                .clipped()
                .accessibilityLabel(NSLocalizedString("ios.tprompt.script", comment: ""))
                .accessibilityValue(script)
                HStack(spacing: 10) {
                    Button(NSLocalizedString(playing ? "ios.tprompt.pause" : "ios.tprompt.play", comment: "")) { playing.toggle() }
                    Button(NSLocalizedString("ios.tprompt.slower", comment: "")) { speed = max(10, speed - 8) }
                    Button(NSLocalizedString("ios.tprompt.faster", comment: "")) { speed = min(90, speed + 8) }
                    Button(NSLocalizedString("ios.tprompt.restart", comment: "")) { offset = 0 }
                    Button(NSLocalizedString("ios.tprompt.close", comment: "")) { playing = false; store.script = nil }
                }
                .font(.footnote.bold())
                .buttonStyle(.bordered)
                .tint(.white)
                Text(NSLocalizedString("ios.tprompt.not_recorded", comment: "")).font(.caption2).foregroundStyle(.white.opacity(0.8))
            }
            .padding(8)
            .background(.black.opacity(0.55))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(6)
            .task(id: playing) {
                while playing && !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(40))
                    let end = max(0, textHeight - windowHeight)
                    offset = min(end, offset + speed * 0.04)
                    if offset >= end { playing = false }
                }
            }
        }
    }
}
