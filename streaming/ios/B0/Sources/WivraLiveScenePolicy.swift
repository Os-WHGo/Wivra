// Wivra LIVE scenes: pure layout for iOS (Foundation only, macOS smoke).
// Mirrors core/live-scenes.mjs, including "video-camera" (camera as a small
// layer), which HaishinKit can draw because every VideoTrackScreenObject of
// track 0 receives the camera frames. — Claude
import Foundation

enum WivraLiveSceneSlot: String, CaseIterable, Sendable { case backdrop, camera, video, image }
enum WivraLiveScenePlace: Sendable { case full, pip, topHalf, bottomHalf }

struct WivraLiveScenePreset: Sendable {
    let id: String
    let label: String
    let show: [WivraLiveSceneSlot: WivraLiveScenePlace]
    var micMuted = false
}

enum WivraLiveScenePolicy {
    struct Rect: Equatable, Sendable { let x: Double, y: Double, w: Double, h: Double }
    struct Layer: Equatable, Sendable { let visible: Bool; let rect: Rect }

    static let presets: [WivraLiveScenePreset] = [
        .init(id: "camera", label: "Cámara", show: [.camera: .full]),
        .init(id: "camera-video", label: "Cámara + video", show: [.camera: .full, .video: .pip]),
        .init(id: "video-camera", label: "Video + cámara", show: [.backdrop: .full, .video: .full, .camera: .pip]),
        .init(id: "split", label: "Cámara arriba, video abajo", show: [.camera: .topHalf, .backdrop: .bottomHalf, .video: .bottomHalf]),
        .init(id: "video", label: "Solo video", show: [.backdrop: .full, .video: .full]),
        .init(id: "camera-image", label: "Cámara + imagen", show: [.camera: .full, .image: .pip]),
        .init(id: "image", label: "Imagen (pausa)", show: [.backdrop: .full, .image: .full], micMuted: true)
    ]

    static func preset(_ id: String) -> WivraLiveScenePreset? { presets.first { $0.id == id } }

    static func available(videoLoaded: Bool, imageLoaded: Bool) -> [String] {
        presets.filter { p in
            (p.show[.video] == nil || videoLoaded) && (p.show[.image] == nil || imageLoaded)
        }.map(\.id)
    }

    private static func r6(_ v: Double) -> Double { (v * 1_000_000).rounded() / 1_000_000 }

    static func contain(_ region: Rect, media: CGSizeLike?, frameW: Double, frameH: Double) -> Rect {
        guard let media, media.w > 0, media.h > 0, frameW > 0, frameH > 0 else {
            return Rect(x: r6(region.x), y: r6(region.y), w: r6(region.w), h: r6(region.h))
        }
        let rw = region.w * frameW, rh = region.h * frameH, a = media.w / media.h
        let (pw, ph) = rw / rh > a ? (rh * a, rh) : (rw, rw / a)
        return Rect(x: r6(region.x + (rw - pw) / 2 / frameW), y: r6(region.y + (rh - ph) / 2 / frameH),
                    w: r6(pw / frameW), h: r6(ph / frameH))
    }

    struct CGSizeLike: Sendable { let w: Double; let h: Double }

    /// Every slot, hidden ones with visible == false.
    static func layout(_ id: String, frameW: Double, frameH: Double,
                       video: CGSizeLike? = nil, image: CGSizeLike? = nil,
                       corner: WivraMultiCamCorner = .bottomRight, pipScale: Double = 0.35)
        -> (layers: [WivraLiveSceneSlot: Layer], micMuted: Bool)? {
        guard let p = preset(id) else { return nil }
        let pip = WivraMultiCamPolicy.pipRect(corner, scale: pipScale, margin: 0.04, frameWidth: frameW, frameHeight: frameH)
        var layers: [WivraLiveSceneSlot: Layer] = [:]
        for slot in WivraLiveSceneSlot.allCases {
            guard let place = p.show[slot] else {
                layers[slot] = Layer(visible: false, rect: Rect(x: 0, y: 0, w: 0, h: 0)); continue
            }
            let region: Rect
            switch place {
            case .full: region = Rect(x: 0, y: 0, w: 1, h: 1)
            case .pip: region = Rect(x: pip.x, y: pip.y, w: pip.w, h: pip.h)
            case .topHalf: region = Rect(x: 0, y: 0, w: 1, h: 0.5)
            case .bottomHalf: region = Rect(x: 0, y: 0.5, w: 1, h: 0.5)
            }
            let size = slot == .video ? video : slot == .image ? image : nil
            layers[slot] = Layer(visible: true, rect: contain(region, media: size, frameW: frameW, frameH: frameH))
        }
        return (layers, p.micMuted)
    }

    /// A lost or finished source returns to the plain camera scene.
    static func fallback(current: String, lost: WivraLiveSceneSlot) -> String? {
        preset(current)?.show[lost] == nil ? nil : "camera"
    }
}
