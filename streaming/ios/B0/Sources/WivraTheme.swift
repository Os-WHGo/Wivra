// W80 (Claude): Wivra look for the native iPhone screens, matching the editor
// (W79): dark background, magenta/violet gradient, rounded cards. Original
// drawing; no third-party logos.
import SwiftUI

enum WivraTheme {
    static var background: Color { Color(red: 0.043, green: 0.039, blue: 0.071) }      // #0b0a12
    static var card: Color { Color(red: 0.086, green: 0.075, blue: 0.122) }            // #16131f
    static var cardHigh: Color { Color(red: 0.114, green: 0.098, blue: 0.161) }        // #1d1929
    static var line: Color { Color(red: 0.173, green: 0.153, blue: 0.255) }            // #2c2741
    static var muted: Color { Color(red: 0.627, green: 0.604, blue: 0.714) }           // #a09ab6
    static var accent: Color { Color(red: 0.886, green: 0.220, blue: 0.812) }          // #e238cf
    static var accentSoft: Color { Color(red: 1.0, green: 0.435, blue: 0.878) }        // #ff6fe0
    static var liveRed: Color { Color(red: 1.0, green: 0.361, blue: 0.541) }          // #ff5c8a
    static var brand: LinearGradient { LinearGradient(
        colors: [Color(red: 0.31, green: 0.48, blue: 1.0),
                 Color(red: 0.61, green: 0.30, blue: 1.0),
                 Color(red: 1.0, green: 0.25, blue: 0.71)],
        startPoint: .topLeading, endPoint: .bottomTrailing) }
    static var button: LinearGradient { LinearGradient(
        colors: [Color(red: 0.71, green: 0.17, blue: 1.0), Color(red: 1.0, green: 0.18, blue: 0.70)],
        startPoint: .leading, endPoint: .trailing) }

    /// Dark page background with the soft violet glow of the mockups.
    @MainActor static var page: some View {
        ZStack {
            background
            RadialGradient(colors: [Color(red: 0.61, green: 0.30, blue: 1.0).opacity(0.30), .clear],
                           center: .topTrailing, startRadius: 0, endRadius: 420)
            RadialGradient(colors: [Color(red: 0.31, green: 0.48, blue: 1.0).opacity(0.16), .clear],
                           center: .topLeading, startRadius: 0, endRadius: 300)
        }
        .ignoresSafeArea()
    }
}

/// The Wivra "W" drawn with the brand gradient.
struct WivraLogo: View {
    var size: CGFloat = 40

    var body: some View {
        Canvas { context, canvas in
            let s = canvas.width / 48
            var path = Path()
            path.move(to: CGPoint(x: 7 * s, y: 12 * s))
            path.addLine(to: CGPoint(x: 14 * s, y: 36 * s))
            path.addLine(to: CGPoint(x: 24 * s, y: 18 * s))
            path.addLine(to: CGPoint(x: 34 * s, y: 36 * s))
            path.addLine(to: CGPoint(x: 41 * s, y: 12 * s))
            context.stroke(path, with: .linearGradient(
                Gradient(colors: [Color(red: 0.31, green: 0.48, blue: 1.0),
                                  Color(red: 0.61, green: 0.30, blue: 1.0),
                                  Color(red: 1.0, green: 0.25, blue: 0.71)]),
                startPoint: .zero, endPoint: CGPoint(x: canvas.width, y: canvas.height)),
                style: StrokeStyle(lineWidth: 6.5 * s, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Primary call-to-action style (gradient pill), as in the mockups.
struct WivraPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(WivraTheme.button, in: Capsule())
            .shadow(color: WivraTheme.accent.opacity(0.35), radius: 14, y: 6)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

extension View {
    /// Dark scheme + magenta tint for every native screen and presentation.
    func wivraStyled() -> some View {
        self.preferredColorScheme(.dark).tint(WivraTheme.accent)
    }
}
