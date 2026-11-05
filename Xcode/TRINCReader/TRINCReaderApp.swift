import SwiftUI

/// Trevor Robey, INC. buyer app: read a delivered research bundle or dataset, see the status of
/// every cited identifier, and confirm each file still matches its seal. Offline by construction:
/// the macOS build carries no network entitlement (ops/tr-suite/verify.sh checks it).
@main
struct TRINCReaderApp: App {
    @State private var library = Library()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(library)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
        #if os(macOS)
        .defaultSize(width: 1200, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open Bundle…") { library.isImporterPresented = true }
                    .keyboardShortcut("o")
            }
        }
        #endif
    }
}
