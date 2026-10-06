import AppKit
import Carbon.HIToolbox
import SwiftUI

/// A borderless panel that can take keyboard focus without activating the app,
/// so the app you were in stays frontmost (the Spotlight pattern).
final class Panel: NSPanel {
    override var canBecomeKey: Bool { true }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = Store()
    private var statusItem: NSStatusItem!
    private var panel: Panel!
    private var keyMonitor: Any?
    private var hotKey: HotKey?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Logos and favicons come back from AsyncImage's cache, not the network.
        URLCache.shared = URLCache(memoryCapacity: 20 << 20, diskCapacity: 100 << 20)

        // Start at login from the first launch on; the Settings toggle turns it off for good.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: "loginItemDefaulted") {
            store.settings.openAtLogin = true
            defaults.set(true, forKey: "loginItemDefaulted")
        }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "square.grid.2x2", accessibilityDescription: "ActiveSet")
            button.target = self
            button.action = #selector(statusClicked)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        panel = Panel(contentRect: NSRect(origin: .zero, size: panelSize),
                      styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isReleasedWhenClosed = false
        panel.contentView = NSHostingView(rootView: PanelView(store: store))

        store.hidePanel = { [weak self] in self?.hide() }

        NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification, object: panel, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.hide() }
        }

        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel.isKeyWindow else { return event }
            return self.handleKey(event) ? nil : event
        }

        // ⌃⌥A
        hotKey = HotKey(keyCode: UInt32(kVK_ANSI_A), modifiers: UInt32(controlKey | optionKey)) { [weak self] in
            self?.toggle()
        }

        store.refresh()
    }

    /// Opening the app again (Spotlight, Raycast, `open -a`) shows the panel.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        show()
        return false
    }

    @objc private func statusClicked() {
        if NSApp.currentEvent?.type == .rightMouseUp {
            let menu = NSMenu()
            menu.addItem(withTitle: "Refresh", action: #selector(refreshMenu), keyEquivalent: "r").target = self
            menu.addItem(withTitle: "Settings…", action: #selector(settingsMenu), keyEquivalent: ",").target = self
            menu.addItem(.separator())
            menu.addItem(withTitle: "Quit ActiveSet Bar", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
            statusItem.menu = menu
            statusItem.button?.performClick(nil)
            statusItem.menu = nil
        } else {
            toggle()
        }
    }

    @objc private func refreshMenu() { store.refresh() }
    @objc private func settingsMenu() { show(); store.showSettings = true }

    private func toggle() { panel.isVisible ? hide() : show() }

    private func show() {
        store.panelDidOpen()
        position()
        panel.makeKeyAndOrderFront(nil)
    }

    private func hide() {
        guard panel.isVisible else { return }
        panel.orderOut(nil)
        store.showSettings = false
    }

    /// Under the menu bar icon, or top-centre of the screen with the mouse when
    /// the icon is hidden (e.g. by a menu bar manager).
    private func position() {
        let size = panel.frame.size
        if let button = statusItem.button, let window = button.window, window.isVisible, window.frame.width > 0 {
            let iconFrame = window.convertToScreen(button.convert(button.bounds, to: nil))
            let screen = (window.screen ?? NSScreen.main)!.visibleFrame
            var x = iconFrame.midX - size.width / 2
            x = min(max(x, screen.minX + 8), screen.maxX - size.width - 8)
            panel.setFrameOrigin(NSPoint(x: x, y: iconFrame.minY - size.height - 6))
        } else {
            let mouse = NSEvent.mouseLocation
            let screen = (NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main)!.visibleFrame
            panel.setFrameOrigin(NSPoint(x: screen.midX - size.width / 2, y: screen.maxY - size.height - 120))
        }
    }

    /// Returns true when the key was handled and should not reach the text field.
    private func handleKey(_ event: NSEvent) -> Bool {
        let cmd = event.modifierFlags.contains(.command)
        switch Int(event.keyCode) {
        case kVK_Escape:
            store.back()
            return true
        case kVK_ANSI_Comma where cmd:
            store.showSettings = true
            return true
        case kVK_ANSI_R where cmd:
            store.refresh()
            return true
        default:
            break
        }
        if store.showSettings { return false }

        if cmd, let ch = event.charactersIgnoringModifiers, let digit = Int(ch), (1...9).contains(digit) {
            store.openTab(digit - 1)
            return true
        }

        switch Int(event.keyCode) {
        case kVK_DownArrow:
            store.move(1); return true
        case kVK_UpArrow:
            store.move(-1); return true
        case kVK_ANSI_N where event.modifierFlags.contains(.control):
            store.move(1); return true
        case kVK_ANSI_P where event.modifierFlags.contains(.control):
            store.move(-1); return true
        case kVK_Return, kVK_ANSI_KeypadEnter:
            cmd ? store.copySelected() : store.activate()
            return true
        case kVK_RightArrow, kVK_Tab:
            guard store.selected?.isDrill == true else { return false }
            store.activate(); return true
        case kVK_LeftArrow:
            guard store.drilled != nil, store.query.isEmpty else { return false }
            store.drilled = nil; return true
        case kVK_Delete:
            // Backspace on an empty filter steps out of the project.
            guard store.drilled != nil, store.query.isEmpty else { return false }
            store.drilled = nil; return true
        default:
            return false
        }
    }
}

/// A system-wide hotkey through Carbon, which needs no Accessibility permission.
final class HotKey {
    private var ref: EventHotKeyRef?
    private static var action: (() -> Void)?

    init(keyCode: UInt32, modifiers: UInt32, action: @escaping @MainActor () -> Void) {
        HotKey.action = { MainActor.assumeIsolated { action() } }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
            HotKey.action?()
            return noErr
        }, 1, &spec, nil, nil)
        let id = EventHotKeyID(signature: OSType(0x4153_4252), id: 1) // "ASBR"
        RegisterEventHotKey(keyCode, modifiers, id, GetApplicationEventTarget(), 0, &ref)
    }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)
    app.run()
}
