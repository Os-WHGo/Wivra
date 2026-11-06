// Wivra iPhone LIVE P0 · real native phone camera -> RTMP/RTMPS.
// Meta DAT is deliberately excluded: a registered device is not a verified LIVE source.
import AVFoundation
import HaishinKit
import Observation
import RTMPHaishinKit
import SwiftUI
import UIKit

/// W78 (Claude): every user text of this screen comes from Localizable.strings
/// (8 languages). Keys are ios.plive.*; the stream key is never a resource.
fileprivate func wivraLiveText(_ key: String) -> String {
    NSLocalizedString(key, comment: "")
}

@MainActor @Observable
final class WivraIPhoneLiveController {
    enum Phase: String {
        case idle, preparing, ready, connecting, live, stopping
    }

    private(set) var phase: Phase = .idle
    private(set) var status = wivraLiveText("ios.plive.status_idle")
    private(set) var verifiedVideoURL: URL?
    private(set) var unverifiedVideoURL: URL?
    private(set) var savedVideos: [URL] = []
    private(set) var audioUncertainVideos: Set<URL> = []
    private(set) var isReviewingSavedVideos = false

    private var mixer: MediaMixer?
    // LIVE scenes (Claude): attached only when the owner enabled them.
    var scenes: WivraLiveSceneModel?
    private var connection: RTMPConnection?
    private var stream: RTMPStream?
    private var recorder: StreamRecorder?
    private var privateVideoURL: URL?
    private var includesMicrophone = false
    private var generation = UUID()
    private var preview: MTHKView?
    private var storageMonitor: Task<Void, Never>?
    // W75 (Claude): watches the RTMP connection while on air and reconnects.
    private var connectionWatcher: Task<Void, Never>?
    private(set) var onAir = false
    private let minimumRecordingFreeBytes: Int64 = 256 * 1024 * 1024

    var canPrepare: Bool { phase == .idle }
    var canStart: Bool { phase == .ready }
    var isActive: Bool { phase != .idle }

    func prepareCamera(microphone: Bool, frontCamera: Bool) async {
        guard phase == .idle else { return }
        phase = .preparing
        let current = UUID()
        generation = current
        status = wivraLiveText("ios.plive.status_requesting")
        let allowed = await AVCaptureDevice.requestAccess(for: .video)
        guard generation == current else { return }
        guard allowed else {
            status = wivraLiveText("ios.plive.camera_permission")
            phase = .idle
            return
        }
        if microphone {
            let allowedAudio = await AVCaptureDevice.requestAccess(for: .audio)
            guard generation == current else { return }
            guard allowedAudio else {
                status = wivraLiveText("ios.plive.mic_denied")
                phase = .idle
                return
            }
        }
        // Scenes mix the video's sound as a second audio track (Claude).
        let capture = MediaMixer(multiTrackAudioMixingEnabled: scenes?.enabled == true)
        do {
            if microphone {
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playAndRecord, mode: .default,
                                              options: [.defaultToSpeaker, .allowBluetooth])
                try audioSession.setActive(true)
            }
            // Reconciled from PR #159: choose exactly ONE physical camera
            // before configuring MediaMixer. No hot-switch or simultaneous PiP.
            let position: AVCaptureDevice.Position = frontCamera ? .front : .back
            guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                       for: .video, position: position) else {
                status = wivraLiveText("ios.plive.camera_unavailable")
                if microphone {
                    try? AVAudioSession.sharedInstance().setActive(false,
                        options: .notifyOthersOnDeactivation)
                }
                phase = .idle
                return
            }
            // Permission alone does not guarantee a usable microphone device.
            // A requested audio archive must not silently become video-only.
            var selectedAudioInput: AVCaptureDevice?
            if microphone {
                guard let input = AVCaptureDevice.default(for: .audio) else {
                    status = wivraLiveText("ios.plive.no_mic_input")
                    try? AVAudioSession.sharedInstance().setActive(false,
                        options: .notifyOthersOnDeactivation)
                    phase = .idle
                    return
                }
                selectedAudioInput = input
            }
            try await capture.attachVideo(camera)
            if let selectedAudioInput {
                try await capture.attachAudio(selectedAudioInput)
            }
            await capture.startRunning()
            guard generation == current else {
                await capture.stopRunning()
                return
            }
            includesMicrophone = microphone
            mixer = capture
            scenes?.liveHasMicrophone = microphone
            if let scenes, scenes.enabled { await scenes.attach(to: capture) }
            if let preview { await capture.addOutput(preview) }
            phase = .ready
            status = wivraLiveText("ios.plive.camera_ready")
        } catch {
            await capture.stopRunning()
            if microphone {
                try? AVAudioSession.sharedInstance().setActive(false,
                    options: .notifyOthersOnDeactivation)
            }
            phase = .idle
            status = wivraLiveText("ios.plive.prepare_failed")
        }
    }

    func startConfirmed(rawEndpoint: String, saveLocalCopy: Bool) async {
        guard phase == .ready, let mixer else { return }
        guard let endpoint = WivraIOSLiveEndpoint.parse(rawEndpoint) else {
            status = wivraLiveText("ios.plive.endpoint_invalid")
            return
        }
        // The caller MUST show a second, explicit public-emission confirmation.
        phase = .connecting
        let current = UUID()
        generation = current
        verifiedVideoURL = nil
        unverifiedVideoURL = nil
        status = wivraLiveText("ios.plive.preparing")
        let liveConnection = RTMPConnection()
        let liveStream = RTMPStream(connection: liveConnection)
        connection = liveConnection
        stream = liveStream
        await mixer.addOutput(liveStream)
        // STOP may run while this actor hop is suspended. Never allocate or
        // rearm a recorder for a session that was already dismissed.
        guard generation == current, phase == .connecting else { return }
        if saveLocalCopy {
            // Keep enough room for the MP4 index, filesystem journal and UI.
            // A completed local archive is never silently replaced by LIVE-only.
            guard hasRecordingReserve() else {
                status = wivraLiveText("ios.plive.storage_low")
                await stop()
                return
            }
            do {
                let folder = try localFolder()
                let file = folder.appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension("mp4")
                // Record the user's mic choice before any media bytes are
                // written, including when the app is later killed mid-LIVE.
                try WivraLiveRecordingReceipt.stage(
                    audioRequired: includesMicrophone, for: file, in: folder)
                let writer = StreamRecorder()
                await writer.setMovieFragmentInterval(10.0)
                await mixer.addOutput(writer)
                recorder = writer
                privateVideoURL = file
                let settings = includesMicrophone ? StreamRecorder.defaultSettings
                    : StreamRecorder.defaultSettings.filter { $0.key == .video }
                try await writer.startRecording(file, settings: settings)
                // If STOP arrived while the writer was starting, terminate it
                // here as well. It stays private and never reaches Photos.
                if generation != current || phase != .connecting {
                    _ = try? await writer.stopRecording()
                    await mixer.removeOutput(writer)
                    return
                }
            } catch {
                // A requested archive is a precondition to network LIVE, not
                // a best-effort checkbox that can silently fail.
                status = wivraLiveText("ios.plive.copy_failed")
                await stop()
                return
            }
        }
        do {
            guard generation == current, phase == .connecting else { return }
            try await liveConnection.connect(endpoint.serverURL)
            guard generation == current, phase == .connecting else { return }
            _ = try await liveStream.publish(endpoint.streamKey)
            guard generation == current, phase == .connecting else {
                _ = try? await liveStream.close()
                try? await liveConnection.close()
                return
            }
            phase = .live
            if saveLocalCopy {
                storageMonitor?.cancel()
                storageMonitor = Task { [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(nanoseconds: 10_000_000_000)
                        guard let self, !Task.isCancelled else { return }
                        guard self.phase == .live else { return }
                        guard self.hasRecordingReserve() else {
                            self.status = wivraLiveText("ios.plive.storage_critical")
                            await self.stop()
                            return
                        }
                    }
                }
            }
            status = saveLocalCopy
                ? wivraLiveText("ios.plive.on_air_copy")
                : wivraLiveText("ios.plive.on_air_no_copy")
            onAir = true
            watchConnection(endpoint, liveConnection, liveStream, current, saveLocalCopy)
        } catch {
            // Do not print errors: servers can echo stream keys in their response.
            status = wivraLiveText("ios.plive.connect_failed")
            await stop()
        }
    }

    func stop() async {
        guard phase != .idle && phase != .stopping else { return }
        phase = .stopping
        storageMonitor?.cancel()
        storageMonitor = nil
        connectionWatcher?.cancel()
        connectionWatcher = nil
        onAir = false
        generation = UUID() // Invalidate all pending permission/connect/publish awaits.
        status = wivraLiveText("ios.plive.closing")
        await scenes?.detach()
        let localStream = stream
        let localConnection = connection
        let localRecorder = recorder
        let localMixer = mixer
        let localFile = privateVideoURL
        stream = nil
        connection = nil
        recorder = nil
        mixer = nil
        privateVideoURL = nil

        if let localStream { _ = try? await localStream.close() }
        if let localConnection { try? await localConnection.close() }
        if let localRecorder {
            do {
                let result = try await localRecorder.stopRecording()
                if let localMixer { await localMixer.removeOutput(localRecorder) }
                // One verified AVAssetReader pass checks media and, when
                // microphone was requested, real nonempty audio samples.
                // A missing/empty audio track must remain private for recovery.
                let verifiedMedia: Bool
                if let folder = try? localFolder() {
                    verifiedMedia = await WivraCaptureMediaVerifier.verifyFile(
                        result, in: folder, requireAudio: includesMicrophone)
                } else {
                    verifiedMedia = false
                }
                if verifiedMedia {
                    verifiedVideoURL = result
                    unverifiedVideoURL = nil
                } else {
                    // Keep all non-empty files for recovery; never publish a
                    // corrupt/incomplete MP4 to Photos or to the Editor.
                    unverifiedVideoURL = result
                }
            } catch {
                // Writer may have produced partial recoverable bytes. Preserve
                // the original path and do not present it as playable.
                unverifiedVideoURL = localFile
                if let localMixer { await localMixer.removeOutput(localRecorder) }
            }
        }
        if let localStream, let localMixer { await localMixer.removeOutput(localStream) }
        if let localMixer { await localMixer.stopRunning() }
        if includesMicrophone {
            try? AVAudioSession.sharedInstance().setActive(false,
                options: .notifyOthersOnDeactivation)
        }
        includesMicrophone = false
        phase = .idle
        status = verifiedVideoURL != nil
            ? wivraLiveText("ios.plive.stopped_verified")
            : (unverifiedVideoURL != nil
                ? wivraLiveText("ios.plive.stopped_unverified")
                : wivraLiveText("ios.plive.stopped_no_copy"))
    }

    // Re-discover verified clips after app relaunch, without automatic Photos
    // publishing and without treating partial writers as finished recordings.
    func reviewSavedVideos() async {
        guard phase == .idle, !isReviewingSavedVideos else { return }
        isReviewingSavedVideos = true
        defer { isReviewingSavedVideos = false }
        guard let folder = try? localFolder(),
              let urls = try? FileManager.default.contentsOfDirectory(
                at: folder, includingPropertiesForKeys: [.isRegularFileKey,
                .isSymbolicLinkKey, .fileSizeKey], options: [.skipsHiddenFiles]) else {
            status = wivraLiveText("ios.plive.catalog_failed")
            return
        }
        var approved: [URL] = []
        var uncertainAudio: Set<URL> = []
        for file in urls where file.pathExtension.lowercased() == "mp4" {
            guard let values = try? file.resourceValues(forKeys: [.isRegularFileKey,
                .isSymbolicLinkKey, .fileSizeKey]),
                values.isRegularFile == true, values.isSymbolicLink == false,
                (values.fileSize ?? 0) > 0 else { continue }
            let expectation = WivraLiveRecordingReceipt.audioExpectation(
                for: file, in: folder)
            if await WivraCaptureMediaVerifier.verifyFile(
                file, in: folder, requireAudio: expectation == .required) {
                approved.append(file)
                if expectation == .unknown { uncertainAudio.insert(file) }
            }
        }
        savedVideos = approved.sorted { $0.lastPathComponent > $1.lastPathComponent }
        audioUncertainVideos = uncertainAudio
        status = String(format: wivraLiveText("ios.plive.review_result"), savedVideos.count, uncertainAudio.count)
    }

    /// A dropped connection used to leave "LIVE activo" on screen with nothing
    /// on air. Now: detect it, retry with growing pauses (the local MP4 keeps
    /// recording), and say clearly when it gave up. The endpoint stays in
    /// memory for this session only and is never shown or logged. — Claude
    private func watchConnection(_ endpoint: WivraIOSLiveEndpoint, _ connection: RTMPConnection,
                                 _ liveStream: RTMPStream, _ session: UUID, _ saveLocalCopy: Bool) {
        connectionWatcher?.cancel()
        connectionWatcher = Task { [weak self] in
            var policy = WivraLiveReconnectPolicy()
            for await event in await connection.status {
                guard let self, !Task.isCancelled, self.generation == session, self.phase == .live else { return }
                switch WivraLiveReconnectPolicy.classify(event.code) {
                case .ignore:
                    continue
                case .connected:
                    policy.connected()
                    self.onAir = true
                case .neverRetry:
                    self.onAir = false
                    self.status = wivraLiveText(saveLocalCopy ? "ios.plive.rejected_copy" : "ios.plive.rejected")
                    return
                case .retry:
                    // Stale events from earlier attempts are ignored once reconnected.
                    if await connection.connected { continue }
                    self.onAir = false
                    var back = false
                    while let delay = policy.nextDelaySeconds() {
                        self.status = String(format: wivraLiveText(saveLocalCopy ? "ios.plive.reconnect_copy" : "ios.plive.reconnect"),
                                             policy.attempt, WivraLiveReconnectPolicy.delaysSeconds.count, delay)
                        try? await Task.sleep(nanoseconds: UInt64(delay) * 1_000_000_000)
                        guard !Task.isCancelled, self.generation == session, self.phase == .live else { return }
                        do {
                            try await connection.connect(endpoint.serverURL)
                            _ = try await liveStream.publish(endpoint.streamKey)
                            policy.connected()
                            self.onAir = true
                            self.status = wivraLiveText(saveLocalCopy ? "ios.plive.reconnected_copy" : "ios.plive.reconnected")
                            back = true
                            break
                        } catch {
                            // Never print the error: servers can echo the key.
                            continue
                        }
                    }
                    if !back {
                        self.status = wivraLiveText(saveLocalCopy ? "ios.plive.gave_up_copy" : "ios.plive.gave_up")
                        return
                    }
                }
            }
        }
    }

    private func hasRecordingReserve() -> Bool {
        guard let root = try? localFolder(),
              let size = try? FileManager.default.attributesOfFileSystem(forPath: root.path),
              let free = size[.systemFreeSize] as? NSNumber else { return false }
        return free.int64Value >= minimumRecordingFreeBytes
    }

    private func localFolder() throws -> URL {
        let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraLive", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
}

extension WivraIPhoneLiveController: MTHKViewRepresentable.PreviewSource {
    nonisolated func connect(to view: MTHKView) {
        Task { @MainActor in
            preview = view
            if let mixer { await mixer.addOutput(view) }
        }
    }
}

struct WivraIPhoneLiveScreen: View {
    /// W93: the network line shown on the LIVE screen and in the start confirmation.
    private var liveNetworkLine: String {
        switch network.route {
        case .offline: return wivraLiveText("ios.plive.net_offline")
        case .cellular: return wivraLiveText("ios.plive.net_cellular")
        case .wifi where !(network.isExpensive || network.isConstrained): return wivraLiveText("ios.plive.net_wifi")
        default: return network.isExpensive || network.isConstrained ? wivraLiveText("ios.plive.net_metered") : wivraLiveText("ios.plive.net_other")
        }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var controller = WivraIPhoneLiveController()
    @State private var scenes = WivraLiveSceneModel()
    @State private var destination = ""
    @State private var includeMicrophone = false
    @State private var frontCamera = false
    @State private var archiveVideo = true
    @State private var confirmPublication = false
    // W93: which network carries the stream; mobile data or a limited plan is said before starting.
    @State private var network = WivraPhoneNetworkStatus()
    @State private var savingPhotos = false
    @State private var photosReview: [URL: WivraPhotosSaveJournal.ReviewStatus] = [:]
    @State private var pendingPhotosRetry: URL?
    @State private var photoMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                // W83 (Claude): the preview leads the screen, as in the owner's mockup,
                // with a clear EN VIVO badge only while actually on air.
                Section {
                    ZStack(alignment: .topLeading) {
                        if controller.phase == .ready || controller.phase == .connecting ||
                           controller.phase == .live {
                            MTHKViewRepresentable(previewSource: controller)
                                .frame(height: 280)
                                .accessibilityIdentifier("wivra_ios_live_preview")
                            Text(wivraLiveText(controller.onAir ? "ios.plive.on_air_badge" : "ios.plive.preview_badge"))
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(controller.onAir ? Color.red : Color.black.opacity(0.55), in: Capsule())
                                .padding(10)
                                .accessibilityAddTraits(.updatesFrequently)
                        } else {
                            VStack(spacing: 10) {
                                Image(systemName: "video.fill").font(.system(size: 34))
                                    .foregroundStyle(WivraTheme.accentSoft)
                                Text(wivraLiveText("ios.plive.preview_placeholder"))
                                    .font(.footnote).multilineTextAlignment(.center)
                                    .foregroundStyle(WivraTheme.muted)
                            }
                            .frame(maxWidth: .infinity, minHeight: 200)
                            .background(WivraTheme.card)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    Text(controller.status).accessibilityIdentifier("wivra_ios_live_status")
                }
                Section(wivraLiveText("ios.plive.section_camera")) {
                    Text(wivraLiveText("ios.plive.camera_note"))
                    Toggle(wivraLiveText("ios.plive.front_camera"), isOn: $frontCamera)
                        .disabled(controller.phase != .idle)
                        .accessibilityIdentifier("wivra_ios_live_front_camera")
                    Toggle(wivraLiveText("ios.plive.microphone"), isOn: $includeMicrophone)
                        .disabled(controller.phase != .idle)
                    Toggle(wivraLiveText("ios.plive.save_copy"), isOn: $archiveVideo)
                        .disabled(controller.phase == .connecting || controller.phase == .live || controller.phase == .stopping)
                    Button(wivraLiveText("ios.plive.prepare")) {
                        Task { await controller.prepareCamera(microphone: includeMicrophone,
                                                              frontCamera: frontCamera) }
                    }.disabled(!controller.canPrepare)
                    .buttonStyle(WivraPrimaryButtonStyle())
                    .listRowBackground(Color.clear)
                }
                WivraLiveScenePanel(scenes: scenes,
                                    isLive: controller.phase == .connecting || controller.phase == .live,
                                    canToggle: controller.phase == .idle)
                Section(wivraLiveText("ios.plive.section_destination")) {
                    SecureField(wivraLiveText("ios.plive.endpoint_placeholder"), text: $destination)
                        .textContentType(.password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(controller.phase == .connecting || controller.phase == .live || controller.phase == .stopping)
                    Text(wivraLiveText("ios.plive.key_note"))
                        .font(.caption)
                    Text(liveNetworkLine).font(.caption).foregroundStyle(network.route == .cellular || network.isExpensive || network.route == .offline ? .orange : .secondary)
                    Button(wivraLiveText("ios.plive.confirm_button")) { confirmPublication = true }
                        .disabled(!controller.canStart || WivraIOSLiveEndpoint.parse(destination) == nil || network.route == .offline)
                        .buttonStyle(WivraPrimaryButtonStyle())
                        .listRowBackground(Color.clear)
                    Button(wivraLiveText("ios.plive.stop_button")) {
                        Task { await controller.stop() }
                    }.disabled(controller.phase == .idle || controller.phase == .stopping)
                    .buttonStyle(.bordered).tint(.red)
                    .frame(maxWidth: .infinity)
                }
                Section(wivraLiveText("ios.plive.section_status")) {
                    Button(wivraLiveText("ios.plive.review_button")) {
                        Task { await controller.reviewSavedVideos() }
                    }.disabled(controller.isActive || controller.isReviewingSavedVideos)
                    if controller.isReviewingSavedVideos {
                        ProgressView(wivraLiveText("ios.plive.checking"))
                    }
                    ForEach(controller.savedVideos, id: \.self) { file in
                        ShareLink(item: file) {
                            Label(wivraLiveText("ios.plive.share_recovered"), systemImage: "film.stack")
                        }
                        if controller.audioUncertainVideos.contains(file) {
                            Text(wivraLiveText("ios.plive.audio_uncertain"))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            photosControls(for: file)
                        }
                    }
                    if let file = controller.verifiedVideoURL {
                        ShareLink(item: file) {
                            Label(wivraLiveText("ios.plive.share_verified"), systemImage: "square.and.arrow.up")
                        }
                        photosControls(for: file)
                    }
                    if controller.unverifiedVideoURL != nil {
                        Text(wivraLiveText("ios.plive.unverified_note"))
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle(wivraLiveText("ios.plive.title"))
            .onAppear { controller.scenes = scenes; network.start() }
            // W87 (Claude): VoiceOver hears connection, reconnection and copy changes.
            .onChange(of: controller.status) { _, text in
                UIAccessibility.post(notification: .announcement, argument: text)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(wivraLiveText("ios.plive.close")) { Task { await controller.stop(); dismiss() } }
                }
            }
            .interactiveDismissDisabled(controller.isActive)
            .confirmationDialog(
                wivraLiveText("ios.plive.confirm_title"),
                isPresented: $confirmPublication,
                titleVisibility: .visible
            ) {
                Button(wivraLiveText("ios.plive.start")) {
                    let userApprovedEndpoint = destination
                    destination = ""
                    Task {
                        await controller.startConfirmed(rawEndpoint: userApprovedEndpoint,
                                                        saveLocalCopy: archiveVideo)
                    }
                }
                Button(wivraLiveText("ios.plive.cancel"), role: .cancel) {}
            } message: {
                Text((archiveVideo
                    ? wivraLiveText("ios.plive.confirm_with_copy")
                    : wivraLiveText("ios.plive.confirm_without_copy")) + "\n\n" + liveNetworkLine)
            }
            .confirmationDialog(
                wivraLiveText("ios.plive.photos_retry_title"),
                isPresented: Binding(
                    get: { pendingPhotosRetry != nil },
                    set: { if !$0 { pendingPhotosRetry = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button(wivraLiveText("ios.plive.photos_not_present"), role: .destructive) {
                    if let file = pendingPhotosRetry {
                        resolvePhotos(for: file, present: false)
                    }
                    pendingPhotosRetry = nil
                }
                Button(wivraLiveText("ios.plive.cancel"), role: .cancel) { pendingPhotosRetry = nil }
            } message: {
                Text(wivraLiveText("ios.plive.photos_retry_message"))
            }
            .alert(wivraLiveText("ios.plive.photos_alert"), isPresented: Binding(
                get: { photoMessage != nil },
                set: { if !$0 { photoMessage = nil } }
            )) {
                Button(wivraLiveText("ios.plive.ok")) { photoMessage = nil }
            } message: { Text(photoMessage ?? "") }
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didEnterBackgroundNotification
            )) { _ in
                // First iPhone LIVE is foreground only. No secret background broadcast.
                Task { await controller.stop() }
            }
            .onDisappear { Task { await controller.stop() } }
        }
    }

    @MainActor
    private func refreshPhotosReview(for file: URL) async {
        do {
            photosReview[file] = try await WivraPhotosSaveJournal.shared.reviewStatus(for: file)
        } catch {
            // A corrupted journal must block retries rather than duplicate
            // a possibly committed Photos asset.
            photosReview.removeValue(forKey: file)
            photoMessage = wivraLiveText("ios.plive.photos_journal_failed")
        }
    }

    @MainActor
    private func savePhotos(_ file: URL) {
        guard !savingPhotos, photosReview[file] == .noRecord else { return }
        savingPhotos = true
        Task { @MainActor in
            defer { savingPhotos = false }
            do {
                try await WivraPhotosLibrary.saveVideo(file)
                photoMessage = wivraLiveText("ios.plive.photos_saved")
            } catch {
                photoMessage = wivraLiveText("ios.plive.photos_unconfirmed")
            }
            await refreshPhotosReview(for: file)
        }
    }

    @MainActor
    private func resolvePhotos(for file: URL, present: Bool) {
        guard !savingPhotos, photosReview[file] == .needsManualReview else { return }
        savingPhotos = true
        Task { @MainActor in
            defer { savingPhotos = false }
            do {
                if present {
                    try await WivraPhotosSaveJournal.shared.confirmManuallyPresent(for: file)
                    photoMessage = wivraLiveText("ios.plive.photos_manual_confirmed")
                } else {
                    try await WivraPhotosSaveJournal.shared.authorizeRetryAfterManualAbsence(for: file)
                    photoMessage = wivraLiveText("ios.plive.photos_retry_allowed")
                }
            } catch {
                photoMessage = wivraLiveText("ios.plive.photos_resolve_failed")
            }
            await refreshPhotosReview(for: file)
        }
    }

    @MainActor @ViewBuilder
    private func photosControls(for file: URL) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let state = photosReview[file] {
                switch state {
                case .noRecord:
                    Button(wivraLiveText("ios.plive.photos_save")) { savePhotos(file) }
                        .disabled(savingPhotos)
                case .confirmed:
                    Text(wivraLiveText("ios.plive.photos_confirmed"))
                        .font(.caption).foregroundStyle(.secondary)
                case .needsManualReview:
                    Text(wivraLiveText("ios.plive.photos_needs_review"))
                        .font(.caption).foregroundStyle(.orange)
                    Button(wivraLiveText("ios.plive.photos_present")) {
                        resolvePhotos(for: file, present: true)
                    }.disabled(savingPhotos)
                    Button(wivraLiveText("ios.plive.photos_not_present"), role: .destructive) {
                        pendingPhotosRetry = file
                    }.disabled(savingPhotos)
                }
            } else {
                Text(wivraLiveText("ios.plive.photos_checking"))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .task(id: file) { await refreshPhotosReview(for: file) }
    }
}
