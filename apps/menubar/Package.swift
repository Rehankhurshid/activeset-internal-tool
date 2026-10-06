// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ActiveSetBar",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "ActiveSetBar", path: "Sources/ActiveSetBar"),
    ]
)
