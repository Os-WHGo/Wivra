// Ray-Ban → LIVE on iPhone (Claude): hands decoded DAT frames (.raw) from the SDK's thread to the LIVE
// controller. A bounded stream keeps only the newest frames (older ones are dropped, never queued).
import CoreMedia
import Foundation
import QuartzCore
import SwiftUI

struct WivraGlassesFrame: @unchecked Sendable {
    let buffer: CMSampleBuffer
    let arrival: Double
}

final class WivraGlassesFrameRelay: @unchecked Sendable {
    private let lock = NSLock()
    private var sink: AsyncStream<WivraGlassesFrame>.Continuation?
    private(set) var offered = 0
    private(set) var dropped = 0

    func attach(_ continuation: AsyncStream<WivraGlassesFrame>.Continuation?) {
        lock.lock(); sink = continuation; lock.unlock()
    }

    var isAttached: Bool { lock.lock(); defer { lock.unlock() }; return sink != nil }

    func push(_ buffer: CMSampleBuffer) {
        lock.lock()
        let target = sink
        lock.unlock()
        guard let target else { return }
        let result = target.yield(WivraGlassesFrame(buffer: buffer, arrival: CACurrentMediaTime()))
        lock.lock()
        offered += 1
        if case .dropped = result { dropped += 1 }
        lock.unlock()
    }

    /// Copy of the frame with a host-clock presentation time, so it mixes with the iPhone microphone.
    static func retimed(_ buffer: CMSampleBuffer, hostSeconds: Double) -> CMSampleBuffer? {
        var timing = CMSampleTimingInfo(duration: CMSampleBufferGetDuration(buffer),
                                        presentationTimeStamp: CMTime(seconds: hostSeconds, preferredTimescale: 1_000_000_000),
                                        decodeTimeStamp: .invalid)
        var out: CMSampleBuffer?
        let status = CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: buffer,
                                                           sampleTimingEntryCount: 1, sampleTimingArray: &timing,
                                                           sampleBufferOut: &out)
        return status == noErr ? out : nil
    }
}


/// The Ray-Ban tab's LIVE block: the active glasses preview → the existing iPhone LIVE engine (HaishinKit),
/// with the microphone chosen above (or none). The address is typed in a SecureField, cleared before
/// connecting and never stored, logged or shown. Private copies are reviewed in the iPhone LIVE screen. — Claude
struct WivraGlassesLiveSection: View {
    let model: MetaB0Model
    @State private var controller = WivraIPhoneLiveController()
    @State private var destination = ""
    @State private var keepCopy = true
    @State private var confirm = false

    private func t(_ key: String) -> String { NSLocalizedString(key, comment: "") }

    private var plan: WivraRayBanLivePlan { .forProfile(model.activeDatProfile, withAudio: model.captureSelectedAudio) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(t("ios.rblive.title"), systemImage: "dot.radiowaves.left.and.right").font(.headline)
            Text(t("ios.rblive.note")).font(.footnote).foregroundStyle(.secondary)
            if controller.phase == .idle {
                Button(t("ios.rblive.prepare")) {
                    Task {
                        await controller.prepareGlasses(audioRoute: model.captureSelectedAudio ? model.audioRoute : nil,
                                                        profile: model.activeDatProfile, relay: model.liveRelay)
                    }
                }
                .disabled(!model.glassesPreviewLive)
                .accessibilityIdentifier("wivra_rblive_prepare")
            }
            if controller.phase == .ready {
                SecureField(t("ios.rblive.address"), text: $destination)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Toggle(t("ios.rblive.copy"), isOn: $keepCopy)
                Button(t("ios.plive.start")) { confirm = true }
                    .disabled(destination.isEmpty)
                    .buttonStyle(.borderedProminent)
            }
            if controller.phase != .idle {
                Button(t("ios.rblive.stop"), role: .destructive) { Task { await controller.stop() } }
            }
            Text(controller.status).font(.footnote).accessibilityIdentifier("wivra_rblive_status")
            if controller.verifiedVideoURL != nil { Text(t("ios.rblive.copy_where")).font(.footnote).foregroundStyle(.secondary) }
        }
        .alert(t("ios.rblive.confirm_title"), isPresented: $confirm) {
            Button(t("ios.plive.start")) {
                let address = destination
                destination = ""
                Task { await controller.startConfirmed(rawEndpoint: address, saveLocalCopy: keepCopy) }
            }
            Button(t("ios.plive.cancel"), role: .cancel) {}
        } message: {
            Text(String(format: t("ios.rblive.confirm"), plan.width, plan.height, plan.fps,
                        model.captureSelectedAudio ? (model.audioRoute.ports.first { $0.id == model.audioRoute.selectedUID }?.name ?? "—") : t("ios.rblive.no_audio")))
        }
        // The glasses preview ended (or switched to HEVC recording): LIVE ends, its private copy is kept.
        .onChange(of: model.glassesPreviewLive) { _, live in
            if !live && controller.phase != .idle { Task { await controller.stop() } }
        }
    }
}
