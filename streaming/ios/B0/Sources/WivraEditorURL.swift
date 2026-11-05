// W80 (Claude): the bundled editor changes its own screen with "#…" (#new,
// #p=…, #new-director). That is still the same local file, so the checks
// that only trust the bundled editor compare the URL WITHOUT the fragment.
// Query strings and any other file still fail exactly as before.
import Foundation

extension URL {
    var wivraWithoutFragment: URL {
        guard var parts = URLComponents(url: self, resolvingAgainstBaseURL: false),
              parts.fragment != nil else { return self }
        parts.fragment = nil
        return parts.url ?? self
    }
}
