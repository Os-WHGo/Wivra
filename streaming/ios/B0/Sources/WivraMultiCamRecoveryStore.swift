// Wivra W69 | Reconcile orphaned dual-camera receipts after an iOS process restart.
// No network, deletion or Photos write. Never mistake .multicam.json for a
// verified .wivra.json, and never promote a second camera without sample PTS.
// Source/CI tests do NOT prove on-device H.264/AAC or simultaneous cameras.
import AVFoundation
import Foundation

enum WivraMultiCamRecoveryPolicy {
    static func isGeneratedVideoName(_ name: String) -> Bool {
        guard name.hasPrefix("Wivra_"), name.hasSuffix(".mov"),
              name.count == "Wivra_".count + 36 + ".mov".count else { return false }
        let id = String(name.dropFirst("Wivra_".count).dropLast(".mov".count))
        return UUID(uuidString: id) != nil
    }

    static func isValidIntent(_ m: WivraMultiCamTakeManifest) -> Bool {
        guard m.schema == "wivra-multicam-take-v1", m.mode == "dual-separate",
              m.take > 0 && m.take < 100_000,
              isGeneratedVideoName(m.primaryFile),
              let second = m.secondaryFile, isGeneratedVideoName(second),
              second != m.primaryFile, m.secondaryStatus != nil,
              ["back", "front"].contains(m.primaryPosition),
              ["back", "front"].contains(m.secondaryPosition ?? ""),
              m.primaryPosition != m.secondaryPosition,
              ["primary", "none"].contains(m.audio),
              ["awaiting-video-sample-pts", "video-sample-pts"].contains(m.offsetSource),
              (m.secondaryOffsetMs.map { $0.isFinite && abs($0) <= 10_000 } ?? true)
        else { return false }
        return true
    }

    static func mayPair(secondaryVerified: Bool, offsetSource: String,
                        offsetMs: Double?) -> Bool {
        guard secondaryVerified, offsetSource == "video-sample-pts",
              let offsetMs, offsetMs.isFinite, abs(offsetMs) <= 10_000 else { return false }
        return true
    }
}

/// In-process protection only. App crash resets this set, allowing a stale
/// intent to be found on next launch. A live recording is NEVER recovered.
@MainActor
enum WivraMultiCamActiveCaptureRegistry {
    private static var receipts = Set<String>()
    static func start(_ primaryURL: URL) { receipts.insert(primaryURL.path) }
    static func finished(_ primaryURL: URL) { receipts.remove(primaryURL.path) }
    static func isActive(_ primaryURL: URL) -> Bool { receipts.contains(primaryURL.path) }
}

struct WivraMultiCamFileStamp: Equatable, Sendable {
    let bytes: Int
    let modified: Date
}

struct WivraMultiCamRecoverableTake: Identifiable, Sendable {
    let receiptURL: URL
    let receiptStamp: WivraMultiCamFileStamp
    let primaryURL: URL
    let secondaryURL: URL
    let primaryExists: Bool
    let secondaryExists: Bool
    let intent: WivraMultiCamTakeManifest
    var id: String { receiptURL.lastPathComponent }
}

struct WivraMultiCamRecoveryProof: Sendable {
    let main: Bool
    let secondary: Bool
    let mainStamp: WivraMultiCamFileStamp?
    let secondaryStamp: WivraMultiCamFileStamp?
}

enum WivraMultiCamRecoveryOutcome: Sendable {
    case restoredWithPiP
    case restoredMainOnly
    case secondaryOnly
    case unverified
    case changedDuringReview
    case alreadyIndexed
    case writeFailed
}

enum WivraMultiCamRecoveryStore {
    private static let maximumReceiptBytes = 16 * 1024
    private static let maximumReceipts = 2048

    // Resolve the private camera directory, refusing symlinks even if a
    // crafted filename or a local malicious document targets another folder.
    private static func root() -> URL? {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WivraIPhoneMedia", isDirectory: true).standardizedFileURL
        guard dir == dir.resolvingSymlinksInPath().standardizedFileURL,
              let values = try? dir.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey]),
              values.isSymbolicLink == false, values.isDirectory == true else { return nil }
        return dir
    }

    private static func stamp(_ url: URL, in folder: URL) -> WivraMultiCamFileStamp? {
        let file = url.standardizedFileURL
        guard file.isFileURL, file.deletingLastPathComponent() == folder,
              file == file.resolvingSymlinksInPath().standardizedFileURL,
              let v = try? file.resourceValues(forKeys: [
                .isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey, .contentModificationDateKey
              ]),
              v.isSymbolicLink == false, v.isRegularFile == true,
              let bytes = v.fileSize, bytes > 0,
              let modified = v.contentModificationDate else { return nil }
        return WivraMultiCamFileStamp(bytes: bytes, modified: modified)
    }

    /// A receipt is an intent, NOT an editor-ready media manifest. The normal
    /// library only scans .wivra.json. Never overwrite one, even if malformed.
    @MainActor
    static func scan() -> [WivraMultiCamRecoverableTake] {
        guard let folder = root(),
              let urls = try? FileManager.default.contentsOfDirectory(at: folder,
                includingPropertiesForKeys: [.isSymbolicLinkKey, .fileSizeKey]) else { return [] }
        let receipts = urls.filter {
            $0.lastPathComponent.hasSuffix(".multicam.json") &&
            $0.lastPathComponent.hasPrefix("Wivra_")
        }.sorted { $0.lastPathComponent < $1.lastPathComponent }.prefix(maximumReceipts)
        return receipts.compactMap { receiptURL in
            guard let receiptStamp = stamp(receiptURL, in: folder),
                  receiptStamp.bytes <= maximumReceiptBytes,
                  let data = try? Data(contentsOf: receiptURL),
                  data.count <= maximumReceiptBytes,
                  let intent = try? JSONDecoder().decode(WivraMultiCamTakeManifest.self, from: data),
                  WivraMultiCamRecoveryPolicy.isValidIntent(intent),
                  receiptURL.lastPathComponent ==
                    URL(fileURLWithPath: intent.primaryFile)
                        .deletingPathExtension().appendingPathExtension("multicam.json")
                        .lastPathComponent,
                  let second = intent.secondaryFile else { return nil }
            let primary = folder.appendingPathComponent(intent.primaryFile)
            let secondary = folder.appendingPathComponent(second)
            guard !WivraMultiCamActiveCaptureRegistry.isActive(primary),
                  !FileManager.default.fileExists(atPath:
                    primary.deletingPathExtension().appendingPathExtension("wivra.json").path),
                  stamp(receiptURL, in: folder) == receiptStamp else { return nil }
            let mainExists = stamp(primary, in: folder) != nil
            let secondExists = stamp(secondary, in: folder) != nil
            guard mainExists || secondExists else { return nil }
            return WivraMultiCamRecoverableTake(
                receiptURL: receiptURL, receiptStamp: receiptStamp,
                primaryURL: primary, secondaryURL: secondary,
                primaryExists: mainExists, secondaryExists: secondExists, intent: intent)
        }
    }

    /// Parse actual samples and decode boundaries off the UI actor. The
    /// caller must use Task.detached, then call publish on MainActor.
    static func verify(_ candidate: WivraMultiCamRecoverableTake) async -> WivraMultiCamRecoveryProof {
        guard let folder = root(),
              stamp(candidate.receiptURL, in: folder) == candidate.receiptStamp else {
            return WivraMultiCamRecoveryProof(main: false, secondary: false,
                                               mainStamp: nil, secondaryStamp: nil)
        }
        let mainBefore = stamp(candidate.primaryURL, in: folder)
        let secondaryBefore = stamp(candidate.secondaryURL, in: folder)
        var main = false, secondary = false
        if mainBefore != nil {
            main = await WivraCaptureMediaVerifier.verifyFile(candidate.primaryURL, in: folder,
                                                             requireAudio: candidate.intent.audio == "primary")
        }
        if secondaryBefore != nil {
            secondary = await WivraCaptureMediaVerifier.verifyFile(candidate.secondaryURL, in: folder)
        }
        return WivraMultiCamRecoveryProof(
            main: main && mainBefore == stamp(candidate.primaryURL, in: folder),
            secondary: secondary && secondaryBefore == stamp(candidate.secondaryURL, in: folder),
            mainStamp: mainBefore, secondaryStamp: secondaryBefore)
    }

    /// Only this explicit button can publish a newly VERIFIED main movie.
    /// No auto Photos, no deletion, no repairing MOV bytes or guessing PTS.
    @MainActor
    static func publish(_ candidate: WivraMultiCamRecoverableTake,
                        proof: WivraMultiCamRecoveryProof) -> WivraMultiCamRecoveryOutcome {
        guard let folder = root(),
              candidate.primaryURL.deletingLastPathComponent() == folder,
              candidate.secondaryURL.deletingLastPathComponent() == folder,
              stamp(candidate.receiptURL, in: folder) == candidate.receiptStamp,
              !WivraMultiCamActiveCaptureRegistry.isActive(candidate.primaryURL),
              WivraMultiCamRecoveryPolicy.isValidIntent(candidate.intent)
        else { return .changedDuringReview }
        let v2 = candidate.primaryURL.deletingPathExtension().appendingPathExtension("wivra.json")
        guard !FileManager.default.fileExists(atPath: v2.path) else { return .alreadyIndexed }
        let primaryStamp = stamp(candidate.primaryURL, in: folder)
        let secondaryStamp = stamp(candidate.secondaryURL, in: folder)
        guard primaryStamp == proof.mainStamp, secondaryStamp == proof.secondaryStamp
        else { return .changedDuringReview }
        guard proof.main else {
            return proof.secondary ? .secondaryOnly : .unverified
        }
        let mayPair = WivraMultiCamRecoveryPolicy.mayPair(
            secondaryVerified: proof.secondary, offsetSource: candidate.intent.offsetSource,
            offsetMs: candidate.intent.secondaryOffsetMs)
        let secondary: WivraCaptureMulticam? = mayPair ? WivraCaptureMulticam(
            secondaryVideoFile: candidate.secondaryURL.lastPathComponent,
            secondaryOffsetSeconds: candidate.intent.secondaryOffsetMs.map { $0 / 1000 },
            primaryPosition: candidate.intent.primaryPosition,
            secondaryPosition: candidate.intent.secondaryPosition ?? "front",
            corner: candidate.intent.corner.rawValue, audio: "primary") : nil
        do {
            _ = try WivraCaptureManifest.write(
                videoURL: candidate.primaryURL, tracks: [], mergedURL: nil,
                cameraSource: "iphone-avfoundation", multicam: secondary)
        } catch { return .writeFailed }
        // Keep the recovered pair receipt useful to future troubleshooting.
        // An unverified or unsynchronized secondary remains separately saved.
        let updated = WivraMultiCamTakeManifest(
            take: candidate.intent.take, mode: candidate.intent.mode,
            primaryFile: candidate.intent.primaryFile,
            primaryPosition: candidate.intent.primaryPosition,
            secondaryFile: candidate.intent.secondaryFile,
            secondaryPosition: candidate.intent.secondaryPosition,
            secondaryOffsetMs: candidate.intent.secondaryOffsetMs,
            offsetSource: candidate.intent.offsetSource,
            audio: candidate.intent.audio,
            corner: candidate.intent.corner, continuation: candidate.intent.continuation,
            primaryStatus: .kept,
            secondaryStatus: proof.secondary ? .kept :
                (secondaryStamp == nil ? .empty : .needsReview))
        _ = try? WivraMultiCamTakeManifest.write(updated, beside: candidate.primaryURL)
        return mayPair ? .restoredWithPiP : .restoredMainOnly
    }
}
