import Foundation

/// Wivra's strict iPhone RTMP/RTMPS URL gate. Pure local parsing: no requests,
/// credentials, endpoint strings or stream keys are logged or persisted.
struct WivraIOSLiveEndpoint: Sendable {
    let serverURL: String
    let streamKey: String

    static func parse(_ input: String) -> Self? {
        // A complete endpoint must be supplied. No accidental whitespace,
        // userinfo, port 0, URL query or fragment with a secret.
        guard !input.isEmpty, input.utf8.count <= 2048,
              !input.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) ||
                  CharacterSet.controlCharacters.contains($0) }),
              var parts = URLComponents(string: input),
              let scheme = parts.scheme?.lowercased(),
              scheme == "rtmp" || scheme == "rtmps",
              let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.port == nil || (parts.port! > 0 && parts.port! <= 65535)
        else { return nil }

        let path = parts.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: false)
        guard path.count >= 3, path.first == "", path.last?.isEmpty == false,
              !path.dropFirst().contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }),
              let last = path.last,
              let key = String(last).removingPercentEncoding,
              !key.isEmpty, key != "." && key != ".." else { return nil }

        let app = path.dropFirst().dropLast().joined(separator: "/")
        guard !app.isEmpty else { return nil }
        parts.percentEncodedPath = "/" + app
        parts.query = nil
        parts.fragment = nil
        guard let server = parts.string else { return nil }
        return WivraIOSLiveEndpoint(serverURL: server, streamKey: key)
    }
}
