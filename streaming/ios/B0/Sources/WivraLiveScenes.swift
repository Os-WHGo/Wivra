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
            note = attached ? "Esa escena necesita un video o una imagen." : "Activa «Usar escenas» antes de preparar la cámara."
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
        note = result.micMuted ? "Pausa: imagen en pantalla, micrófono en silencio." : ""
    }

    private func playVideo() async {
        guard let url = videoURL, let layers else { return }
        let started = await Task { @ScreenActor in (try? layers.startVideo(url)) != nil }.value
        guard started else {
            videoURL = nil
            await fallback("El video no se pudo reproducir: de vuelta a la cámara.")
            return
        }
        audioFeeder?.cancel()
        if let mixer {
            audioFeeder = Task.detached(priority: .userInitiated) {
                await WivraVideoAudioFeeder.run(url: url, mixer: mixer)
            }
        }
        watcher?.cancel()
        watcher = Task { @MainActor [weak self] in
            // AssetScreenObject stops reading at the end of the movie.
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            while !Task.isCancelled {
                let reading = await Task { @ScreenActor in layers.isVideoReading }.value
                if !reading {
                    await self?.fallback("El video terminó: de vuelta a la cámara.")
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
            note = "Ese archivo no tiene video."
            return
        }
        let oriented = natural.applying(transform)
        videoURL = movie.url
        videoSize = .init(w: abs(oriented.width), h: abs(oriented.height))
        note = "Video listo."
        await apply()
    }

    func load(imageData: Data) async {
        guard let cg = UIImage(data: imageData)?.cgImage else {
            note = "No se pudo abrir esa imagen."
            return
        }
        imageSize = .init(w: Double(cg.width), h: Double(cg.height))
        storedImageData = imageData
        if let layers { await Task { @ScreenActor in layers.setImage(imageData) }.value }
        note = "Imagen lista."
        await apply()
    }

    // Kept so a new LIVE session (new layers) shows the chosen image again.
    private var storedImageData: Data?

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
        Section("Escenas") {
            Toggle("Usar escenas (cámara + video o imagen)", isOn: $scenes.enabled)
                .disabled(!canToggle)
            if scenes.enabled {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(WivraLiveScenePolicy.presets, id: \.id) { p in
                            Button((scenes.current == p.id ? "● " : "") + p.label) {
                                Task { await scenes.select(p.id) }
                            }
                            .buttonStyle(.bordered)
                            .disabled(!scenes.available.contains(p.id) || !scenes.attached)
                        }
                    }
                }
                if !isLive {
                    PhotosPicker("Elegir video", selection: $movieItem, matching: .videos)
                    PhotosPicker("Elegir imagen (logo, QR, pausa)", selection: $imageItem, matching: .images)
                    Button("Mover recuadro de esquina") { Task { await scenes.moveInset() } }
                } else {
                    Text("Durante el LIVE solo se cambian escenas.").font(.footnote)
                }
                Text("El sonido del video va al LIVE si el micrófono del LIVE está activado. El video vuelve a empezar cada vez que entras en una escena con video.").font(.footnote).foregroundStyle(.secondary)
                if !scenes.note.isEmpty { Text(scenes.note).font(.footnote) }
            }
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
