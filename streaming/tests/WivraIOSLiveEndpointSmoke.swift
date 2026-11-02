import Foundation

func check(_ input: String, server: String?, key: String? = nil) {
    let parsed = WivraIOSLiveEndpoint.parse(input)
    precondition(parsed?.serverURL == server && parsed?.streamKey == key,
                 "Unexpected LIVE endpoint accept/reject: " + String(input.count) + " chars")
}
@main struct WivraIOSLiveEndpointSmoke {
    static func main() {
        check("rtmps://example.test/live/secret", server: "rtmps://example.test/live", key: "secret")
        check("rtmp://example.test:1935/app/name/key", server: "rtmp://example.test:1935/app/name", key: "key")
        check("https://example.test/live/key", server: nil)
        check("rtmps://example.test/live", server: nil)
        check("rtmp://example.test/live/key?token=private", server: nil)
        check("rtmps://username:password@example.test/live/key", server: nil)
        check("rtmps://example.test/live/key#fragment", server: nil)
        check("rtmps://example.test/live//key", server: nil)
        check("rtmps://example.test/live/../key", server: nil)
        check("rtmps://example.test/live/key ", server: nil)
        check("rtmps://example.test/live/key\n", server: nil)
        check("rtmp://example.test:0/live/key", server: nil)
        check("rtmps://example.test/live/key/..", server: nil)
        print("Wivra iOS RTMP URL contracts PASSED (synthetic, no connection)")
    }
}
