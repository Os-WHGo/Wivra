// Ray-Ban → LIVE on iPhone (Claude): hands decoded DAT frames (.raw) from the SDK's thread to the LIVE
// controller. A bounded stream keeps only the newest frames (older ones are dropped, never queued).
import CoreImage
import CoreMedia
import HaishinKit
import Foundation
import QuartzCore
import SwiftUI

/// Core Image version of a look (exposure → contrast around 0.5 → 5-point sharpen). Approximate twin of the
/// Android GPU filters: Core Image works in linear light. Immutable, so it can run on HaishinKit's screen actor.
final class WivraLookEffect: VideoEffect, @unchecked Sendable {
    let look: WivraRayBanLook
    init(_ look: WivraRayBanLook) { self.look = look }

    func execute(_ image: CIImage) -> CIImage {
        var out = image
        if look.exposureEv != 0 {
            out = out.applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: look.exposureEv])
        }
        if look.contrast != 1 {
            let c = CGFloat(look.contrast), bias = 0.5 * (1 - c)
            out = out.applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: c, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: c, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: c, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
                "inputBiasVector": CIVector(x: bias, y: bias, z: bias, w: 0)])
        }
        if look.sharpen > 0 {
            let k = CGFloat(look.sharpen)
            let weights: [CGFloat] = [0, -k, 0, -k, 1 + 4 * k, -k, 0, -k, 0]
            out = out.applyingFilter("CIConvolution3X3", parameters: [
                "inputWeights": CIVector(values: weights, count: 9), "inputBias": 0])
        }
        return out.cropped(to: image.extent)
    }
}

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
    @State private var look: WivraRayBanLook = .defaultLook

    private func t(_ key: String) -> String { NSLocalizedString(key, comment: "") }

    private var plan: WivraRayBanLivePlan { .forProfile(model.activeDatProfile, withAudio: model.captureSelectedAudio) }

    private func lookName(_ l: WivraRayBanLook) -> String {
        switch l {
        case .off: t("ios.rblive.look_off")
        case .clear: t("ios.rblive.look_clear")
        case .lowlight: t("ios.rblive.look_lowlight")
        case .vivid: t("ios.rblive.look_vivid")
        }
    }

    private var lookPicker: some View {
        VStack(alignment: .leading, spacing: 4) {
            Picker(t("ios.rblive.look_title"), selection: $look) {
                ForEach(WivraRayBanLook.allCases, id: \.self) { Text(lookName($0)).tag($0) }
            }
            Text(t("ios.rblive.look_note")).font(.caption).foregroundStyle(.secondary)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(t("ios.rblive.title"), systemImage: "dot.radiowaves.left.and.right").font(.headline)
            Text(t("ios.rblive.note")).font(.footnote).foregroundStyle(.secondary)
            if controller.phase == .idle {
                Button(t("ios.rblive.prepare")) {
                    Task {
                        await controller.prepareGlasses(audioRoute: model.captureSelectedAudio ? model.audioRoute : nil,
                                                        profile: model.activeDatProfile, relay: model.liveRelay)
                        await controller.setGlassesLook(look)
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
                lookPicker
                Button(t("ios.plive.start")) { confirm = true }
                    .disabled(destination.isEmpty)
                    .buttonStyle(.borderedProminent)
            }
            if controller.phase == .live || controller.phase == .connecting { lookPicker }
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
        .onChange(of: look) { _, chosen in Task { await controller.setGlassesLook(chosen) } }
        // The glasses preview ended (or switched to HEVC recording): LIVE ends, its private copy is kept.
        .onChange(of: model.glassesPreviewLive) { _, live in
            if !live && controller.phase != .idle { Task { await controller.stop() } }
        }
    }
}
