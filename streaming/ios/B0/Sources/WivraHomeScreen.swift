// W80 (Claude): native home of the iPhone app, as in the owner's mockups.
// It only opens the screens that already exist (camera, Ray-Ban, LIVE,
// editor, captures, exports); every consent and camera handoff stays where it was.
import SwiftUI

enum WivraHomeAction: Hashable {
    case newProject, director, aiChat, capturePhone, captureRayBan, live, captures, exports
    case screenRecord   // W100: iPhone screen recording (local only)
}

struct WivraHomeScreen: View {
    /// False while a camera is still releasing AVFoundation / Meta DAT.
    let camerasFree: Bool
    let onAction: (WivraHomeAction) -> Void

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ZStack(alignment: .bottom) {
            WivraTheme.page
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 10) {
                        WivraLogo(size: 40)
                        Text(verbatim: "Wivra")
                            .font(.system(size: 30, weight: .heavy))
                            .accessibilityAddTraits(.isHeader)
                        Spacer()
                    }
                    .padding(.top, 8)
                    Text("ios.home.question")
                        .font(.title3.bold())
                        .padding(.top, 6)
                    LazyVGrid(columns: columns, spacing: 12) {
                        card(.newProject, "scissors", "ios.home.new_project", "ios.home.new_project_sub", main: true)
                        card(.director, "sparkles", "ios.home.director", "ios.home.director_sub")
                        card(.capturePhone, "camera", "ios.home.capture", "ios.home.capture_sub")
                        card(.captureRayBan, "eyeglasses", "ios.home.rayban", "ios.home.rayban_sub")
                        card(.live, "dot.radiowaves.left.and.right", "ios.home.live", "ios.home.live_sub", live: true)
                        card(.aiChat, "bubble.left.and.text.bubble.right", "ios.home.chat", "ios.home.chat_sub")
                    }
                    Text("ios.home.library")
                        .font(.headline)
                        .padding(.top, 10)
                        .accessibilityAddTraits(.isHeader)
                    row(.captures, "folder", "ios.home.captures", "ios.home.captures_sub")
                    row(.screenRecord, "record.circle", "ios.home.screen_record", "ios.home.screen_record_sub")
                    row(.exports, "square.and.arrow.up.on.square", "ios.home.exports", "ios.home.exports_sub")
                    if !camerasFree {
                        Label("ios.app.handoff", systemImage: "hourglass")
                            .font(.footnote)
                            .foregroundStyle(WivraTheme.muted)
                    }
                    Text("ios.home.privacy")
                        .font(.footnote)
                        .foregroundStyle(WivraTheme.muted)
                        .padding(.top, 4)
                    // W82 (Claude): Makers Unbound logo, white version supplied by the owner.
                    VStack(spacing: 6) {
                        Text("ios.home.made_by").font(.caption).foregroundStyle(WivraTheme.muted)
                        Image("MakersUnbound")
                            .resizable()
                            .scaledToFit()
                            .frame(height: 78)
                            .accessibilityLabel(Text(verbatim: "Makers Unbound"))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 18)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 110)
            }
            tabBar
        }
        .foregroundStyle(.white)
        .accessibilityIdentifier("wivra_native_home")
    }

    private func card(_ action: WivraHomeAction, _ icon: String, _ title: LocalizedStringKey,
                      _ subtitle: LocalizedStringKey, main: Bool = false, live: Bool = false) -> some View {
        Button { onAction(action) } label: {
            VStack(alignment: .leading, spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(main ? Color.white : (live ? WivraTheme.liveRed : WivraTheme.accentSoft))
                    .frame(width: 38, height: 38)
                    .background((main ? Color.white.opacity(0.2) : (live ? WivraTheme.liveRed : WivraTheme.accent).opacity(0.15)),
                                in: RoundedRectangle(cornerRadius: 11))
                Spacer(minLength: 18)
                Text(title).font(.headline).foregroundStyle(.white)
                Text(subtitle).font(.caption)
                    .foregroundStyle(main ? Color.white.opacity(0.85) : WivraTheme.muted)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 124, alignment: .leading)
            .padding(14)
            .background {
                if main {
                    RoundedRectangle(cornerRadius: 18).fill(WivraTheme.brand)
                        .shadow(color: WivraTheme.accent.opacity(0.35), radius: 14, y: 6)
                } else {
                    RoundedRectangle(cornerRadius: 18).fill(WivraTheme.card)
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(WivraTheme.line))
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!camerasFree)
        .accessibilityIdentifier("wivra_home_\(String(describing: action))")
    }

    private func row(_ action: WivraHomeAction, _ icon: String, _ title: LocalizedStringKey,
                     _ subtitle: LocalizedStringKey) -> some View {
        Button { onAction(action) } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundStyle(WivraTheme.accentSoft)
                    .frame(width: 38, height: 38)
                    .background(WivraTheme.accent.opacity(0.15), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.bold())
                    Text(subtitle).font(.caption).foregroundStyle(WivraTheme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(WivraTheme.muted)
            }
            .padding(12)
            .background(WivraTheme.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(WivraTheme.line))
        }
        .buttonStyle(.plain)
        .disabled(!camerasFree)
    }

    private var tabBar: some View {
        HStack(alignment: .bottom) {
            tab(nil, "house.fill", "ios.home.tab_home", selected: true)
            tab(.captures, "folder", "ios.home.tab_projects")
            Button { onAction(.newProject) } label: {
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(WivraTheme.button, in: Circle())
                    .shadow(color: WivraTheme.accent.opacity(0.45), radius: 12, y: 4)
            }
            .frame(maxWidth: .infinity)
            .offset(y: -10)
            .disabled(!camerasFree)
            .accessibilityLabel(Text("ios.home.new_project"))
            tab(.live, "dot.radiowaves.left.and.right", "ios.home.live")
            tab(.aiChat, "sparkles", "ios.home.tab_ai")
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(WivraTheme.line).frame(height: 1) }
    }

    private func tab(_ action: WivraHomeAction?, _ icon: String, _ title: LocalizedStringKey,
                     selected: Bool = false) -> some View {
        Button { if let action { onAction(action) } } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 19))
                Text(title).font(.caption2)
            }
            .foregroundStyle(selected ? WivraTheme.accentSoft : WivraTheme.muted)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.plain)
        .disabled(action != nil && !camerasFree)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
