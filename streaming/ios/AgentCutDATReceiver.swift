// AgentCut: minimal Meta DAT 1.0 receiver skeleton for a future iOS native bridge.
// ORIGINAL experiment based on public SDK API signatures, not copied Meta source.
// IMPORTANT: NOT COMPILED OR TESTED WITH XCODE, DAT OR PHYSICAL GLASSES.
// No RTMP publishing, audio, Photos access, recording, background handling,
// callback-to-TypeScript bridge or credential storage is included.
// Requires iOS 17.2+, Xcode 26.4+, Swift 6.3+, Meta DAT 1.0+.
// — ChatGPT

import AVFoundation
import MWDATCore
import MWDATCamera

/// Implement with a frame recorder AND a streaming encoder. The frame buffers
/// here are compressed HEVC, NOT decoded H.264 packets that can just be sent
/// to conventional RTMP endpoints.
protocol DATFrameSink: Sendable {
  func acceptHEVCSample(_ sample: CMSampleBuffer)
}

/// SDK lifecycle only. A real integration needs an on-screen Start Session,
/// then an explained permission redirect, then a separate Start Preview.
@MainActor
final class AgentCutDATReceiver {
  private let wearables: any WearablesInterface
  private let sink: any DATFrameSink

  private var session: DeviceSession?
  private var camera: MWDATCamera.Camera?
  private let streamTokens = ListenerTokenBag()

  private(set) var lastError: String?
  private(set) var framesReceived: Int = 0

  init(wearables: any WearablesInterface = Wearables.shared,
       sink: any DATFrameSink) {
    self.wearables = wearables
    self.sink = sink
  }

  /// First the user explicitly connects and starts the device session.
  func connectAndStartSession() async throws {
    guard session == nil else { return }
    let selector = AutoDeviceSelector(wearables: wearables)
    let newSession = try wearables.createSession(deviceSelector: selector)
    session = newSession
    try newSession.start()
    // Do not attach Camera before the DeviceSession is started.
    for await state in newSession.stateStream() {
      if state == .started { return }
      // In production add an explicit deadline, disconnect detection and UI error.
    }
    lastError = "Device session ended before it started"
  }

  /// This may switch to Meta AI app. UI should explain and request consent first.
  func requestCameraPermissionAfterUserConsent() async throws -> Bool {
    if try await wearables.checkPermissionStatus(.camera) == .granted {
      return true
    }
    return try await wearables.requestPermission(.camera) == .granted
  }

  /// Permission + session must already be valid. Preview is NOT a live broadcast.
  func startCameraPreview() async throws {
    guard let current = session, current.state == .started else {
      lastError = "Start a device session first"
      return
    }
    guard camera == nil else { return }
    guard try await wearables.checkPermissionStatus(.camera) == .granted else {
      lastError = "Camera permission missing"
      return
    }

    // Start with bandwidth-friendly 504x896 / 24 fps. This is a REQUEST,
    // not guaranteed output; Meta can dynamically lower quality.
    let config = StreamConfiguration(
      videoCodec: .hvc1,
      resolution: .medium,
      frameRate: 24
    )

    guard let newCamera = try current.addCamera(config: config) else {
      lastError = "Meta SDK did not provide Camera capability"
      return
    }
    camera = newCamera
    let consumer = sink

    // Keep listener tokens alive. Do NOT block these callbacks with
    // video rendering, JSON serialization, network I/O or AI inference.
    newCamera.stream.videoFramePublisher.listen { frame in
      consumer.acceptHEVCSample(frame.sampleBuffer)
    }.store(in: streamTokens)

    newCamera.stream.errorPublisher.listen { [weak self] error in
      let message = error.localizedDescription
      Task { @MainActor [weak self] in self?.lastError = message }
    }.store(in: streamTokens)

    newCamera.stream.start()
  }

  /// Stops the SDK camera, not a remote LIVE output. Native UI should stop
  /// destination publishing and finalize local recordings first.
  func stopCameraPreview() {
    streamTokens.clear()
    camera?.stop()
    camera = nil
  }

  func disconnect() {
    stopCameraPreview()
    session?.stop()
    session = nil
  }
}

/*
 Wiring still required for an AgentCut prototype:

 DAT sampleBuffer (HEVC) ─┬─► AVAssetWriter passthrough .mov recording,
                         │    with timestamps/keyframe flags, finalized
                         │    before reporting "saved". See Meta's
                         │    samples/CameraAccess VideoRecorder.
                         └─► VideoToolbox decode HEVC to CVPixelBuffer
                              ► hardware H.264 encoder (or HaishinKit's
                                real-time media pipeline) ► RTMPS publisher.
                                RTMP destination authorizations are separate.

 Audio: official CameraAccess uses Bluetooth HFP microphone through
 AVAudioSession for recording; PCM audioFramePublisher is EXPERIMENTAL
 and NOT allowed for production release. For LIVE, AAC audio synchronization
 from HFP or phone mic is a separate experiment and must be tested.

 This code intentionally does NOT embed Meta SDK binaries, borrowed code
 or credentials, and does NOT pretend the above end-to-end pipeline works.
*/
