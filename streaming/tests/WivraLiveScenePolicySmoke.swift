// macOS smoke for WivraLiveScenePolicy (same numbers as core/live-scenes.mjs). — Claude
import Foundation

@main
struct WivraLiveScenePolicySmoke {
    static func check(_ ok: Bool, _ what: String) {
        if !ok { FileHandle.standardError.write(Data(("FAIL: " + what + "\n").utf8)); exit(1) }
        print("ok - " + what)
    }

    static func main() {
        typealias P = WivraLiveScenePolicy
        check(P.available(videoLoaded: false, imageLoaded: false) == ["camera"], "only camera without sources")
        check(P.available(videoLoaded: true, imageLoaded: false) == ["camera", "camera-video", "video-camera", "split", "video"], "video scenes")
        let full = P.contain(.init(x: 0, y: 0, w: 1, h: 1), media: .init(w: 1920, h: 1080), frameW: 720, frameH: 1280)
        check(full == .init(x: 0, y: 0.341797, w: 1, h: 0.316406), "contain matches JS")
        guard let l = P.layout("camera-video", frameW: 720, frameH: 1280, video: .init(w: 1920, h: 1080)) else { exit(1) }
        check(l.layers[.video] == .init(visible: true, rect: .init(x: 0.61, y: 0.747129, w: 0.35, h: 0.110742)), "PiP video matches JS")
        check(l.layers[.image]?.visible == false && l.layers[.backdrop]?.visible == false, "hidden slots")
        guard let vc = P.layout("video-camera", frameW: 1280, frameH: 720) else { exit(1) }
        check(vc.layers[.camera]?.rect.w == 0.35 && vc.layers[.backdrop]?.visible == true, "camera as small layer over backdrop")
        check(P.layout("image", frameW: 1280, frameH: 720)?.micMuted == true, "pause scene mutes")
        check(P.layout("nope", frameW: 1, frameH: 1) == nil, "unknown scene")
        check(P.fallback(current: "split", lost: .video) == "camera", "split falls back")
        check(P.fallback(current: "camera-image", lost: .video) == nil, "unrelated loss ignored")
    }
}
