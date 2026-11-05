// swift-tools-version: 6.0
//
// TRINCKit — the logic behind the Trevor Robey, INC. buyer app, kept in a package so it builds
// and tests from the command line (`swift test`) without Xcode's UI.
//
// Everything here is offline and read-only: it parses a delivery bundle that is already on the
// device (a folder or the sealed ZIP), recomputes SHA-256 fingerprints, and reads the citation
// ledger. It opens no sockets and writes no files.

import PackageDescription

let package = Package(
    name: "TRINCKit",
    platforms: [.macOS(.v15), .iOS(.v18)],
    products: [
        .library(name: "TRINCKit", targets: ["TRINCKit"]),
    ],
    targets: [
        .target(name: "TRINCKit"),
        .testTarget(
            name: "TRINCKitTests",
            dependencies: ["TRINCKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
