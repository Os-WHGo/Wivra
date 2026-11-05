// Wivra iPhone: two-camera screen. Opened from the iPhone camera tab only when
// that camera has released AVFoundation. Not verified on a physical iPhone. — Claude
import AVFoundation
import SwiftUI
import UIKit

@MainActor
final class WivraLayerHostView: UIView {
    var hosted: CALayer? {
        didSet {
            oldValue?.removeFromSuperlayer()
            if let hosted { layer.addSublayer(hosted) }
            setNeedsLayout()
        }
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        hosted?.frame = bounds
    }
}

struct WivraLayerHost: UIViewRepresentable {
    let hosted: CALayer?
    func makeUIView(context: Context) -> WivraLayerHostView {
        let view = WivraLayerHostView()
        view.backgroundColor = .black
        view.hosted = hosted
        return view
    }
    func updateUIView(_ view: WivraLayerHostView, context: Context) {
        if view.hosted !== hosted { view.hosted = hosted }
    }
}

struct WivraMultiCamScreen: View {
    @State private var capture = WivraMultiCamCapture()
    @Environment(\.dismiss) private var dismiss

    private func insetAlignment(_ corner: WivraMultiCamCorner) -> Alignment {
        switch corner {
        case .bottomRight: .bottomTrailing
        case .bottomLeft: .bottomLeading
        case .topLeft: .topLeading
        case .topRight: .topTrailing
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    GeometryReader { geo in
                        ZStack(alignment: insetAlignment(capture.corner)) {
                            WivraLayerHost(hosted: capture.primaryLayer)
                            if capture.isDual {
                                WivraLayerHost(hosted: capture.secondaryLayer)
                                    .frame(width: geo.size.width * 0.3, height: geo.size.height * 0.3)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                    .padding(10)
                                    .accessibilityLabel(NSLocalizedString("ios.multicam.inset_label", comment: ""))
                            }
                        }
                    }
                    .frame(height: 420)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .accessibilityLabel(NSLocalizedString("ios.multicam.preview_label", comment: ""))

                    Text(capture.status).font(.callout).accessibilityAddTraits(.updatesFrequently)
                    Text(capture.includesAudio ? NSLocalizedString("ios.multicam.sound_mic", comment: "") : NSLocalizedString("ios.multicam.sound_none", comment: ""))
                        .font(.footnote).foregroundStyle(.secondary)

                    HStack {
                        Button(capture.isRecording ? NSLocalizedString("ios.multicam.stop", comment: "") : NSLocalizedString("ios.multicam.record", comment: "")) { capture.toggleRecording() }
                            .buttonStyle(.borderedProminent)
                            .disabled(!capture.isRunning || capture.isFinishing)
                        Button(NSLocalizedString("ios.multicam.swap", comment: "")) { capture.swapCameras() }
                            .disabled(capture.isRecording || capture.isFinishing)
                        Button(NSLocalizedString("ios.multicam.move_inset", comment: "")) { capture.moveInset() }
                            .disabled(!capture.isDual || capture.isRecording || capture.isFinishing)
                    }
                    Text(NSLocalizedString("ios.multicam.explainer", comment: ""))
                        .font(.footnote).foregroundStyle(.secondary)
                    if !capture.inventory.isEmpty {
                        Text(NSLocalizedString("ios.multicam.inventory_title", comment: "")).font(.headline).accessibilityAddTraits(.isHeader)
                        ForEach(capture.inventory, id: \.self) { Text($0).font(.footnote) }
                    }
                }
                .padding()
            }
            .navigationTitle(NSLocalizedString("ios.multicam.title", comment: ""))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("ios.multicam.close", comment: "")) { capture.stop(); dismiss() }
                        .disabled(capture.isRecording || capture.isFinishing)
                }
            }
        }
        .interactiveDismissDisabled(capture.isRecording || capture.isFinishing)
        .onAppear { capture.refreshInventory(); capture.start() }
        .onDisappear { capture.stop() }
        // Camera loss, fallback to one camera and saved takes are spoken by VoiceOver.
        .onChange(of: capture.status) { _, text in
            UIAccessibility.post(notification: .announcement, argument: text)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
            capture.stop()
        }
        // String names avoid SDK renames; reason key is AVCaptureSessionInterruptionReasonKey.
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("AVCaptureSessionWasInterruptedNotification"))) { note in
            guard (note.object as AnyObject?) === capture.session else { return }
            capture.interrupted(reasonRaw: (note.userInfo?["AVCaptureSessionInterruptionReasonKey"] as? NSNumber)?.intValue)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("AVCaptureSessionInterruptionEndedNotification"))) { note in
            guard (note.object as AnyObject?) === capture.session else { return }
            capture.interruptionEnded()
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("AVCaptureSessionRuntimeErrorNotification"))) { note in
            guard (note.object as AnyObject?) === capture.session else { return }
            capture.cameraLost(reason: "error de la cámara")
        }
    }
}
