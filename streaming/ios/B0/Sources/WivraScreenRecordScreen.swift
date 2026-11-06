// W100 (Claude, owner decision 1A): "Grabar pantalla" on iPhone. Wivra only shows
// Apple's own start button (RPSystemBroadcastPickerView, preselecting Wivra's
// extension) and the recordings waiting for a decision. iOS starts, shows and
// stops the recording; Wivra never starts it by itself.
import ReplayKit
import SwiftUI

private struct WivraBroadcastButton: UIViewRepresentable {
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
        picker.preferredExtension = "com.oswhgo.WivraMetaB0.ScreenRecord"
        // The person decides in the iOS sheet whether the microphone is recorded.
        picker.showsMicrophoneButton = true
        picker.accessibilityIdentifier = "wivra_screen_record_start"
        return picker
    }

    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}

struct WivraScreenRecordScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var items: [WivraScreenRecording] = []
    @State private var busy = false
    @State private var note: LocalizedStringKey?
    @State private var toDelete: WivraScreenRecording?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("ios.srec.intro")
                    HStack(spacing: 14) {
                        WivraBroadcastButton()
                            .frame(width: 64, height: 64)
                        Text("ios.srec.start_hint").font(.footnote)
                    }
                    if let note { Text(note).font(.footnote.bold()).accessibilityIdentifier("wivra_screen_record_note") }
                }
                Section("ios.srec.limits_title") {
                    Label("ios.srec.limit_protected", systemImage: "lock.rectangle")
                    Label("ios.srec.limit_audio", systemImage: "speaker.wave.2")
                    Label("ios.srec.limit_camera", systemImage: "camera")
                    Label("ios.srec.limit_stop", systemImage: "record.circle")
                }
                .font(.footnote)
                Section("ios.srec.pending_title") {
                    if items.isEmpty {
                        Text("ios.srec.none").foregroundStyle(.secondary)
                    }
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.startedAt.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? item.id)
                                .font(.headline)
                            Text(ByteCountFormatter.string(fromByteCount: item.bytes, countStyle: .file))
                                .font(.caption).foregroundStyle(.secondary)
                            if item.interrupted {
                                Text("ios.srec.interrupted").font(.caption).foregroundStyle(.orange)
                            }
                            if item.session.micAudioFile != nil {
                                Label("ios.srec.has_mic", systemImage: "mic").font(.caption)
                            }
                            HStack {
                                Button("ios.srec.import") { importItem(item) }
                                    .buttonStyle(.borderedProminent)
                                Button("ios.srec.delete", role: .destructive) { toDelete = item }
                                    .buttonStyle(.bordered)
                            }
                            .disabled(busy)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle(Text("ios.srec.title"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("ios.srec.close") { dismiss() }
                }
            }
            .confirmationDialog("ios.srec.delete_confirm", isPresented: Binding(
                get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }
            ), titleVisibility: .visible) {
                Button("ios.srec.delete", role: .destructive) {
                    if let item = toDelete, WivraScreenRecordInbox.discard(item) { note = "ios.srec.deleted" }
                    toDelete = nil
                    refresh()
                }
            }
            .onAppear(perform: refresh)
            // Coming back from another app (where the person recorded) shows the new recording.
            .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
        }
    }

    private func refresh() {
        items = WivraScreenRecordInbox.list()
    }

    private func importItem(_ item: WivraScreenRecording) {
        guard !busy else { return }
        busy = true
        note = "ios.srec.checking"
        Task { @MainActor in
            do {
                _ = try await WivraScreenRecordInbox.importRecording(item)
                note = "ios.srec.imported"
            } catch {
                note = "ios.srec.import_failed"
            }
            busy = false
            refresh()
        }
    }
}
