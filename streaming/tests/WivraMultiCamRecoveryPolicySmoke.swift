import Foundation

@main
struct WivraMultiCamRecoveryPolicySmoke {
    typealias P = WivraMultiCamRecoveryPolicy
    static func check(_ ok: Bool, _ why: String) {
        if !ok { fatalError("W69: " + why) }
        print("ok - " + why)
    }
    static let primaryName = "Wivra_01234567-89AB-CDEF-0123-456789ABCDEF.mov"
    static let secondaryName = "Wivra_A1234567-89AB-CDEF-0123-456789ABCDEF.mov"

    static func receipt(primary: String = "Wivra_01234567-89AB-CDEF-0123-456789ABCDEF.mov", secondary: String? = "Wivra_A1234567-89AB-CDEF-0123-456789ABCDEF.mov",
                        mode: String = "dual-separate", schema: String = "wivra-multicam-take-v1",
                        source: String = "video-sample-pts", offset: Double? = 0,
                        audio: String = "primary", secondStatus: WivraMultiCamTakeStatus? = .needsReview)
    -> WivraMultiCamTakeManifest {
        var r = WivraMultiCamTakeManifest(
            take: 2, mode: mode, primaryFile: primary, primaryPosition: "back",
            secondaryFile: secondary, secondaryPosition: "front",
            secondaryOffsetMs: offset, offsetSource: source, audio: audio,
            corner: .bottomRight, continuation: false,
            primaryStatus: .needsReview, secondaryStatus: secondStatus)
        r.schema = schema
        return r
    }
    static func main() {
        check(P.isGeneratedVideoName(primaryName), "generated UUID MOV")
        check(!P.isGeneratedVideoName("../x.mov"), "reject traversal")
        check(!P.isGeneratedVideoName("Wivra_123.mov"), "reject unknown names")
        check(!P.isGeneratedVideoName(primaryName + ".json"), "reject manifest used as MOV")
        check(P.isValidIntent(receipt()), "dual recovery receipt")
        check(P.isValidIntent(receipt(source: "awaiting-video-sample-pts", offset: nil)),
              "pre-record intent can be scanned")
        check(!P.isValidIntent(receipt(mode: "single")), "single is not dual")
        check(!P.isValidIntent(receipt(secondary: primaryName)), "same filename both streams")
        check(!P.isValidIntent(receipt(secondary: nil)), "missing second stream")
        check(!P.isValidIntent(receipt(secondStatus: nil)), "missing second status")
        check(!P.isValidIntent(receipt(schema: "unknown")), "unknown receipt version")
        check(!P.isValidIntent(receipt(audio: "secondary")), "never invent audio from inset")
        check(!P.isValidIntent(receipt(offset: .infinity)), "reject nonfinite PTS")
        check(!P.isValidIntent(receipt(offset: 10_001)), "reject impossible PTS")
        check(P.mayPair(secondaryVerified: true, offsetSource: "video-sample-pts", offsetMs: -90),
              "measured negative PTS offset is allowed")
        check(!P.mayPair(secondaryVerified: true, offsetSource: "awaiting-video-sample-pts", offsetMs: 0),
              "do not guess PTS from pre-record receipt")
        check(!P.mayPair(secondaryVerified: false, offsetSource: "video-sample-pts", offsetMs: 0),
              "undecodable inset stays separate")
        check(!P.mayPair(secondaryVerified: true, offsetSource: "video-sample-pts", offsetMs: nil),
              "missing PTS stays separate")
    }
}
