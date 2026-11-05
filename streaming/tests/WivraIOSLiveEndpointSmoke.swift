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
        // Percent encoding must not bypass traversal, slash, control or
        // whitespace checks on the decoded RTMP stream key and app path.
        for encoded in ["%2E%2E", "%2e", "%2Fchild", "name%5Cchild",
                        "line%0Abreak", "nul%00byte", "with%20space",
                        "with%09tab", "%0D"] {
            check("rtmps://example.test/live/\(encoded)", server: nil)
            check("rtmps://example.test/\(encoded)/key", server: nil)
        }
        check("rtmps://example.test/live/encoded%2Dkey",
              server: "rtmps://example.test/live", key: "encoded-key")
        print("Wivra iOS RTMP URL contracts PASSED (synthetic, no connection)")
    }
}
