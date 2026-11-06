// Wivra iPhone LIVE scenes on HaishinKit 2.2.5 offscreen composition.
// Layers: the mixer's own camera (full), a black backdrop, a video from the
// iPhone (AssetScreenObject, picture only), an image, and a second camera
// object (track 0) used as a small inset. Switching a scene only changes
// positions and visibility; the RTMP stream is not restarted.
// Opt-in: without "Usar escenas" the LIVE pipeline stays exactly as before.
// The video's own sound is read with AVAssetReader and appended as audio
// track 1 of the MediaMixer (multi-track mixing, microphone = track 0, which
// paces the mix). No extra permission. Not verified on an iPhone. — Claude
import AVFoundation
import CoreTransferable
import HaishinKit
import Observation
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The objects live on HaishinKit's ScreenActor, like the library's own.
@ScreenActor
final class WivraLiveSceneLayers {
    // Same 16:9 as HaishinKit's default 854x480 output used by Wivra LIVE.
    nonisolated static let frame = CGSize(width: 1280, height: 720)
    private let backdrop = ImageScreenObject()
    private let video = AssetScreenObject()
    private let image = ImageScreenObject()
    private let cameraInset = VideoTrackScreenObject()

    init() {
        let black = CGContext(data: nil, width: 2, height: 2, bitsPerComponent: 8, bytesPerRow: 8,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        black?.setFillColor(CGColor(gray: 0, alpha: 1))
        black?.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
        backdrop.cgImage = black?.makeImage()
        cameraInset.track = 0
        cameraInset.videoGravity = .resizeAspectFill
        cameraInset.cornerRadius = 12
        for object in [backdrop, video, image, cameraInset] as [ScreenObject] {
            object.isVisible = false
            object.horizontalAlignment = .left
            object.verticalAlignment = .top
        }
    }

    /// Order = z-order above the mixer's own full-frame camera.
    func install(on screen: Screen) {
        screen.size = Self.frame
        for object in [backdrop, video, image, cameraInset] as [ScreenObject] {
            try? screen.addChild(object)
        }
    }

    func remove(from screen: Screen) {
        video.cancelReading()
        for object in [backdrop, video, image, cameraInset] as [ScreenObject] {
            screen.removeChild(object)
        }
    }

    func apply(_ layers: [WivraLiveSceneSlot: WivraLiveScenePolicy.Layer], cameraAsInset: Bool) {
        let w = Self.frame.width, h = Self.frame.height
        func place(_ object: ScreenObject, _ slot: WivraLiveSceneSlot) {
            guard let spec = layers[slot], spec.visible else { object.isVisible = false; return }
            object.size = CGSize(width: spec.rect.w * w, height: spec.rect.h * h)
            object.layoutMargin = .init(top: spec.rect.y * h, left: spec.rect.x * w, bottom: 0, right: 0)
            object.isVisible = true
        }
        place(backdrop, .backdrop)
        place(video, .video)
        place(image, .image)
        // The mixer's own camera covers "full"/"top-half"; only a PiP needs the inset.
        if cameraAsInset { place(cameraInset, .camera) } else { cameraInset.isVisible = false }
    }

    /// Decoded here so no CGImage crosses actors.
    func setImage(_ data: Data?) {
        image.cgImage = data.flatMap { UIImage(data: $0)?.cgImage }
    }

    func startVideo(_ url: URL) throws { try video.startReading(AVURLAsset(url: url)) }
    func stopVideo() { video.cancelReading() }
    var isVideoReading: Bool { video.isReading }
}

/// A sample buffer handed to the MediaMixer actor; it is created by the
/// feeder and never touched again after being appended.
struct WivraSampleBox: @unchecked Sendable { let buffer: CMSampleBuffer }

extension MediaMixer {
    func wivraAppendAudio(_ box: WivraSampleBox, track: UInt8) {
        append(box.buffer, track: track)
    }
}

/// Reads the video's audio as 16-bit PCM and appends it to the mixer at the
/// real-time pace (about 0.3 s ahead), as track 1.
enum WivraVideoAudioFeeder {
    static func run(url: URL, mixer: MediaMixer) async {
        let asset = AVURLAsset(url: url)
        guard let track = try? await asset.loadTracks(withMediaType: .audio).first,
              let reader = try? AVAssetReader(asset: asset) else { return }
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ])
        output.alwaysCopiesSampleData = true
        guard reader.canAdd(output) else { return }
        reader.add(output)
        guard reader.startReading() else { return }
        defer { reader.cancelReading() }
        let start = CFAbsoluteTimeGetCurrent()
        var fedSeconds = 0.0
        while !Task.isCancelled, let buffer = output.copyNextSampleBuffer() {
            let frames = Double(CMSampleBufferGetNumSamples(buffer))
            let rate = buffer.formatDescription
                .flatMap { CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee.mSampleRate } ?? 44_100
            await mixer.wivraAppendAudio(WivraSampleBox(buffer: buffer), track: 1)
            fedSeconds += rate > 0 ? frames / rate : 0
            let ahead = fedSeconds - (CFAbsoluteTimeGetCurrent() - start)
            if ahead > 0.3 {
                try? await Task.sleep(nanoseconds: UInt64((ahead - 0.3) * 1_000_000_000))
            }
        }
    }
}

/// A movie picked from Photos, copied to a private temporary file.
struct WivraPickedMovie: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("WivraLiveScenes", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let copy = dir.appendingPathComponent(UUID().uuidString + "." + (received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension))
            try FileManager.default.copyItem(at: received.file, to: copy)
            return WivraPickedMovie(url: copy)
        }
    }
}

@MainActor
@Observable
final class WivraLiveSceneModel {
    var enabled = false
    /// Owner's choice: the video's sound goes into the LIVE mix or not.
    var videoSoundToLive = true
    /// The LIVE has a microphone track; without it there is no audio to mix into.
    var liveHasMicrophone = false
    private(set) var current = "camera"
    private(set) var note = ""
    private(set) var videoURL: URL?
    private(set) var videoSize: WivraLiveScenePolicy.CGSizeLike?
    private(set) var imageSize: WivraLiveScenePolicy.CGSizeLike?
    private(set) var attached = false
    var corner: WivraMultiCamCorner = .bottomRight
    private var mixer: MediaMixer?
    private var layers: WivraLiveSceneLayers?
    private var watcher: Task<Void, Never>?
    private var audioFeeder: Task<Void, Never>?

    var available: [String] {
        WivraLiveScenePolicy.available(videoLoaded: videoURL != nil, imageLoaded: imageSize != nil)
    }

    /// Called by the LIVE controller once its MediaMixer runs (only if enabled).
    func attach(to mixer: MediaMixer) async {
        guard enabled, !attached else { return }
        self.mixer = mixer
        await mixer.setVideoMixerSettings(VideoMixerSettings(mode: .offscreen))
        let created = await Task { @ScreenActor in WivraLiveSceneLayers() }.value
        await Task { @ScreenActor in created.install(on: await mixer.screen) }.value
        layers = created
        attached = true
        if let data = storedImageData { await Task { @ScreenActor in created.setImage(data) }.value }
        await apply()
    }

    func detach() async {
        watcher?.cancel()
        watcher = nil
        audioFeeder?.cancel()
        audioFeeder = nil
        if let layers, let mixer {
            await Task { @ScreenActor in layers.remove(from: await mixer.screen) }.value
        }
        layers = nil
        mixer = nil
        attached = false
        current = "camera"
    }

    func select(_ id: String) async {
        guard id != current else { return }
        guard available.contains(id), attached else {
            note = attached ? NSLocalizedString("ios.live.needs_source", comment: "") : NSLocalizedString("ios.live.enable_first", comment: "")
            return
        }
        let before = WivraLiveScenePolicy.preset(current)
        let after = WivraLiveScenePolicy.preset(id)
        current = id
        if after?.show[.video] != nil, before?.show[.video] == nil { await playVideo() }
        if after?.show[.video] == nil, before?.show[.video] != nil, let layers {
            await Task { @ScreenActor in layers.stopVideo() }.value
            audioFeeder?.cancel()
            audioFeeder = nil
        }
        await apply()
    }

    private func apply() async {
        guard let layers,
              let result = WivraLiveScenePolicy.layout(current, frameW: WivraLiveSceneLayers.frame.width,
                                                       frameH: WivraLiveSceneLayers.frame.height,
                                                       video: videoSize, image: imageSize, corner: corner)
        else { return }
        let spec = result.layers
        let inset = WivraLiveScenePolicy.preset(current)?.show[.camera] == .pip
        await Task { @ScreenActor in layers.apply(spec, cameraAsInset: inset) }.value
        // The pause scene silences the LIVE microphone; other scenes restore it.
        if let mixer {
            // Track 0 = microphone only, so the pause never silences a video track.
            var audio = await mixer.audioMixerSettings
            var mic = audio.tracks[0] ?? AudioMixerTrackSettings()
            if mic.isMuted != result.micMuted {
                mic.isMuted = result.micMuted
                audio.tracks[0] = mic
                await mixer.setAudioMixerSettings(audio)
            }
        }
        note = result.micMuted ? NSLocalizedString("ios.live.pause_note", comment: "") : ""
    }

    private func playVideo() async {
        guard let url = videoURL, let layers else { return }
        let started = await Task { @ScreenActor in (try? layers.startVideo(url)) != nil }.value
        guard started else {
            videoURL = nil
            await fallback(NSLocalizedString("ios.live.video_failed", comment: ""))
            return
        }
        audioFeeder?.cancel()
        audioFeeder = nil
        if let mixer, videoSoundToLive, liveHasMicrophone {
            audioFeeder = Task.detached(priority: .userInitiated) {
                await WivraVideoAudioFeeder.run(url: url, mixer: mixer)
            }
        } else if videoSoundToLive && !liveHasMicrophone {
            // Previous behaviour, stated explicitly: picture only.
            note = NSLocalizedString("ios.live.no_mic", comment: "")
        }
        watcher?.cancel()
        watcher = Task { @MainActor [weak self] in
            // AssetScreenObject stops reading at the end of the movie.
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            while !Task.isCancelled {
                let reading = await Task { @ScreenActor in layers.isVideoReading }.value
                if !reading {
                    await self?.fallback(NSLocalizedString("ios.live.video_ended", comment: ""))
                    return
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
    }

    private func fallback(_ message: String) async {
        guard let to = WivraLiveScenePolicy.fallback(current: current, lost: .video) else { return }
        audioFeeder?.cancel()
        audioFeeder = nil
        current = to
        note = message
        await apply()
    }

    func load(movie: WivraPickedMovie) async {
        let asset = AVURLAsset(url: movie.url)
        guard let track = try? await asset.loadTracks(withMediaType: .video).first,
              let natural = try? await track.load(.naturalSize),
              let transform = try? await track.load(.preferredTransform) else {
            note = NSLocalizedString("ios.live.no_video_track", comment: "")
            return
        }
        let oriented = natural.applying(transform)
        videoURL = movie.url
        videoSize = .init(w: abs(oriented.width), h: abs(oriented.height))
        note = NSLocalizedString("ios.live.video_ready", comment: "")
        await apply()
    }

    func load(imageData: Data) async {
        guard let cg = UIImage(data: imageData)?.cgImage else {
            note = NSLocalizedString("ios.live.image_failed", comment: "")
            return
        }
        imageSize = .init(w: Double(cg.width), h: Double(cg.height))
        storedImageData = imageData
        if let layers { await Task { @ScreenActor in layers.setImage(imageData) }.value }
        note = NSLocalizedString("ios.live.image_ready", comment: "")
        await apply()
    }

    // Kept so a new LIVE session (new layers) shows the chosen image again.
    private var storedImageData: Data?

    /// Stops only the video's sound; the picture keeps playing.
    func stopVideoSound() async {
        audioFeeder?.cancel()
        audioFeeder = nil
    }

    func moveInset() async {
        corner = corner.next
        await apply()
    }
}

/// Scene buttons + source pickers for the LIVE screen.
struct WivraLiveScenePanel: View {
    @Bindable var scenes: WivraLiveSceneModel
    let isLive: Bool
    let canToggle: Bool
    @State private var movieItem: PhotosPickerItem?
    @State private var imageItem: PhotosPickerItem?

    var body: some View {
        Section(NSLocalizedString("ios.live.section", comment: "")) {
            Toggle(NSLocalizedString("ios.live.use_scenes", comment: ""), isOn: $scenes.enabled)
                .disabled(!canToggle)
            if scenes.enabled {
                Toggle(NSLocalizedString("ios.live.video_sound", comment: ""), isOn: $scenes.videoSoundToLive)
                    .onChange(of: scenes.videoSoundToLive) { _, on in
                        if !on { Task { await scenes.stopVideoSound() } }
                    }
            }
            if scenes.enabled {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(WivraLiveScenePolicy.presets, id: \.id) { p in
                            Button((scenes.current == p.id ? "● " : "") + wivraSceneTitle(p.id)) {
                                Task { await scenes.select(p.id) }
                            }
                            // VoiceOver: name, state and selection, not just a dot.
                            .accessibilityLabel(wivraSceneTitle(p.id))
                            .accessibilityValue(scenes.current == p.id ? NSLocalizedString("ios.live.state_on_air", comment: "")
                                : scenes.available.contains(p.id) ? NSLocalizedString("ios.live.state_available", comment: "")
                                : NSLocalizedString("ios.live.state_needs_source", comment: ""))
                            .accessibilityAddTraits(scenes.current == p.id ? .isSelected : [])
                            .buttonStyle(.bordered)
                            .disabled(!scenes.available.contains(p.id) || !scenes.attached)
                        }
                    }
                }
                if !isLive {
                    PhotosPicker(NSLocalizedString("ios.live.pick_video", comment: ""), selection: $movieItem, matching: .videos)
                    PhotosPicker(NSLocalizedString("ios.live.pick_image", comment: ""), selection: $imageItem, matching: .images)
                    Button(NSLocalizedString("ios.live.move_inset", comment: "")) { Task { await scenes.moveInset() } }
                } else {
                    Text(NSLocalizedString("ios.live.only_switch", comment: "")).font(.footnote)
                }
                // W91: ready-made standby screens (also while live: «Volvemos enseguida»).
                Menu(NSLocalizedString("ios.live.standby", comment: "")) {
                    ForEach(["ios.live.standby_starting", "ios.live.standby_brb", "ios.live.standby_thanks"], id: \.self) { key in
                        Button(NSLocalizedString(key, comment: "")) {
                            Task {
                                if let data = wivraStandbyCard(NSLocalizedString(key, comment: "")) {
                                    await scenes.load(imageData: data)
                                    await scenes.select("image")
                                }
                            }
                        }
                    }
                }
                .disabled(!scenes.attached)
                Text(NSLocalizedString("ios.live.sound_footnote", comment: "")).font(.footnote).foregroundStyle(.secondary)
                if !scenes.note.isEmpty { Text(scenes.note).font(.footnote).accessibilityAddTraits(.updatesFrequently) }
            }
        }
        // Fallbacks (video ended, no microphone...) are spoken by VoiceOver.
        .onChange(of: scenes.note) { _, note in
            if !note.isEmpty { UIAccessibility.post(notification: .announcement, argument: note) }
        }
        .onChange(of: movieItem) { _, item in
            guard let item else { return }
            Task {
                if let movie = try? await item.loadTransferable(type: WivraPickedMovie.self) {
                    await scenes.load(movie: movie)
                }
            }
        }
        .onChange(of: imageItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await scenes.load(imageData: data)
                }
            }
        }
    }
}

/// W91: a standby card drawn by Wivra (Wivra colours, centred message, small footer), shown with the image
/// scene, whose microphone is muted. Nothing is downloaded. — Claude
@MainActor
func wivraStandbyCard(_ message: String) -> Data? {
    let size = CGSize(width: 720, height: 1280)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
        let colors = [UIColor(red: 11 / 255, green: 10 / 255, blue: 18 / 255, alpha: 1).cgColor,
                      UIColor(red: 59 / 255, green: 20 / 255, blue: 80 / 255, alpha: 1).cgColor,
                      UIColor(red: 226 / 255, green: 56 / 255, blue: 207 / 255, alpha: 1).cgColor] as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.65, 1]) {
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
        }
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        let big: [NSAttributedString.Key: Any] = [.font: UIFont.boldSystemFont(ofSize: 76), .foregroundColor: UIColor.white, .paragraphStyle: paragraph]
        let text = message as NSString
        let box = text.boundingRect(with: CGSize(width: size.width - 120, height: size.height), options: .usesLineFragmentOrigin, attributes: big, context: nil)
        text.draw(with: CGRect(x: 60, y: (size.height - box.height) / 2, width: size.width - 120, height: ceil(box.height)),
                  options: .usesLineFragmentOrigin, attributes: big, context: nil)
        let small: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 34), .foregroundColor: UIColor.white.withAlphaComponent(0.8), .paragraphStyle: paragraph]
        (NSLocalizedString("ios.live.standby_footer", comment: "") as NSString)
            .draw(in: CGRect(x: 0, y: size.height - 130, width: size.width, height: 50), withAttributes: small)
    }
    return image.pngData()
}

/// Localized scene names (ids are shared with core/live-scenes.mjs). — Claude
func wivraSceneTitle(_ id: String) -> String {
    switch id {
    case "camera-video": return NSLocalizedString("ios.live.scene_camera_video", comment: "")
    case "video-camera": return NSLocalizedString("ios.live.scene_video_camera", comment: "")
    case "split": return NSLocalizedString("ios.live.scene_split", comment: "")
    case "video": return NSLocalizedString("ios.live.scene_video", comment: "")
    case "camera-image": return NSLocalizedString("ios.live.scene_camera_image", comment: "")
    case "image": return NSLocalizedString("ios.live.scene_image", comment: "")
    default: return NSLocalizedString("ios.live.scene_camera", comment: "")
    }
}
