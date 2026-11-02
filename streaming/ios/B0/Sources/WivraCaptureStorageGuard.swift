// Wivra Gen 2 P0: estimate and protect LOCAL recording capacity.
// Disk-space APIs are used only on-device for the user's capture decisions.
// See Resources/PrivacyInfo.xcprivacy (85F4.1 display, E174.1 write guard).
import Foundation

enum WivraCaptureStorageGuard {
    // The stop reserve is deliberately lower than the start reserve.
    // This is a safety margin for closing MOV/CAF files, NOT an export guarantee.
    static let minimumStartBytes: Int64 = 512 * 1024 * 1024
    static let minimumContinueBytes: Int64 = 256 * 1024 * 1024

    static func availableBytes() -> Int64? {
        guard let documents = FileManager.default.urls(
            for: .documentDirectory, in: .userDomainMask
        ).first,
              let values = try? documents.resourceValues(
                forKeys: [.volumeAvailableCapacityForImportantUsageKey]
              ),
              let free = values.volumeAvailableCapacityForImportantUsage,
              free >= 0 else { return nil }
        return free
    }

    static func mayStart(availableBytes: Int64?) -> Bool {
        // Unknown space MUST remain visible as a warning. Do not claim an
        // infinite recording or fabricate a capacity estimate.
        availableBytes.map { $0 >= minimumStartBytes } ?? true
    }

    static func shouldStopToProtectFiles(availableBytes: Int64?) -> Bool {
        availableBytes.map { $0 < minimumContinueBytes } ?? false
    }

    static func approximateMinutes(availableBytes: Int64?, hevcMbps: Double) -> Int? {
        guard let free = availableBytes, free > minimumStartBytes,
              hevcMbps.isFinite, hevcMbps > 0 else { return nil }
        // Leave room for safe finalization. HEVC payload Mbps does not include
        // sidecar audio, Photos copies, a merged export or temporary files.
        let usableBytes = Double(free - minimumStartBytes)
        let seconds = usableBytes * 8 / (hevcMbps * 1_000_000)
        guard seconds.isFinite, seconds >= 60,
              seconds / 60 <= Double(Int.max) else { return nil }
        return Int(seconds / 60)
    }

    static func diagnostic(hevcMbps: Double) -> String {
        guard let free = availableBytes() else {
            return NSLocalizedString("ios.capture.storage_unknown", comment: "")
        }
        let formatted = ByteCountFormatter.string(fromByteCount: free, countStyle: .file)
        let availableText = String(
            format: NSLocalizedString("ios.capture.storage_available", comment: ""),
            formatted
        )
        if !mayStart(availableBytes: free) {
            return availableText + " " +
                NSLocalizedString("ios.capture.storage_insufficient_start", comment: "")
        }
        if let minutes = approximateMinutes(availableBytes: free, hevcMbps: hevcMbps) {
            return availableText + " " + String(
                format: NSLocalizedString("ios.capture.storage_minutes_estimate", comment: ""),
                minutes
            )
        }
        return availableText + " " +
            NSLocalizedString("ios.capture.storage_export_reserve", comment: "")
    }
}
