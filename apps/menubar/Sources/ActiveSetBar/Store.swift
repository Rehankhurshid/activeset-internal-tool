import AppKit
import Foundation

struct Badge: Hashable {
    enum Tone { case neutral, accent, good, warn, bad }
    let text: String
    let tone: Tone
}

struct Item: Identifiable {
    enum Action {
        case open(URL)
        case drill(Project)
    }

    enum Kind: Int { case project = 0, tab, task, step, site, link, page, app }

    let id: String
    var section: String
    let kind: Kind
    let title: String
    let subtitle: String?
    let symbol: String
    var logo: URL? = nil
    let action: Action
    /// Lowercased text the query is matched against.
    let haystack: String
    var projectId: String? = nil
    var dimmed = false
    var badges: [Badge] = []

    var isDrill: Bool { if case .drill = action { return true }; return false }
    var url: URL? { if case .open(let u) = action { return u }; return nil }

    func with(section: String) -> Item {
        var copy = self
        copy.section = section
        return copy
    }
}

/// Tabs on the project detail screen (ProjectDetailScreen.tsx). nil = the page
/// itself. ⌘1–⌘9 open the first nine.
let projectTabs: [(title: String, tab: String?, symbol: String)] = [
    ("Open project", nil, "arrow.up.forward.square"),
    ("Delivery", "delivery", "list.bullet.rectangle"),
    ("Checklist", "checklist", "checklist"),
    ("Timeline", "timeline", "calendar"),
    ("Client", "client", "person.2"),
    ("Tasks", "tasks", "checkmark.circle"),
    ("Audit", "audit", "gauge.with.dots.needle.33percent"),
    ("Webflow", "webflow", "globe"),
    ("Links", "links", "link"),
    ("Images", "images", "photo.on.rectangle"),
    ("Invoices", "invoices", "doc.plaintext"),
]

/// App pages from src/components/shell/nav-items.tsx.
private let appPages: [(title: String, path: String, symbol: String)] = [
    ("Home", "/", "house"),
    ("Client Projects", "/modules/project-links", "folder"),
    ("Proposals", "/modules/proposal", "doc.text"),
    ("Checklist Creator", "/modules/checklist-creator", "checklist"),
    ("Screenshot Runner", "/modules/screenshot-runner", "camera"),
    ("Internal Tools", "/modules/internal-tools", "wrench.and.screwdriver"),
]

/// CLIENT_STATUS_LABELS in src/types/index.ts.
let clientStatusLabels: [String: (String, Badge.Tone)] = [
    "on_track": ("On track", .good),
    "needs_client": ("Waiting on client", .warn),
    "blocked": ("Blocked", .bad),
    "paused": ("Paused", .neutral),
    "delivered": ("Delivered", .accent),
]

@MainActor
final class Store: ObservableObject {
    let settings = Settings()

    @Published private(set) var projects: [Project] = [] {
        didSet { byId = Dictionary(projects.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }); recompute() }
    }
    @Published var query = "" { didSet { if query != oldValue { recompute() } } }
    @Published var drilled: Project? { didSet { query = ""; recompute() } }
    @Published private(set) var items: [Item] = []
    @Published var selection = 0
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    @Published private(set) var lastUpdated: Date?
    @Published var notice: String?
    @Published var showSettings = false
    /// Bumped every time the panel opens, so the search field takes focus.
    @Published private(set) var focusTick = 0

    private(set) var byId: [String: Project] = [:]
    var hidePanel: () -> Void = {}

    init() {
        let cached = API.loadCache()
        projects = cached.projects
        lastUpdated = cached.date
        recompute()
    }

    // MARK: lifecycle

    func panelDidOpen() {
        drilled = nil
        query = ""
        notice = nil
        focusTick += 1
        if settings.token.isEmpty {
            showSettings = true
        } else if lastUpdated == nil || Date().timeIntervalSince(lastUpdated!) > 120 {
            refresh()
        }
    }

    func refresh() {
        guard !loading else { return }
        loading = true
        error = nil
        Task {
            do {
                let result = try await API.fetchProjects(settings)
                API.saveCache(result.raw)
                projects = result.projects
                // Keep the open project pointing at its fresh copy.
                if let id = drilled?.id, let fresh = byId[id] { drilledSilently(fresh) }
                lastUpdated = Date()
            } catch {
                self.error = error.localizedDescription
            }
            loading = false
        }
    }

    private func drilledSilently(_ project: Project) {
        let q = query, sel = selection
        drilled = project
        query = q
        selection = min(sel, max(items.count - 1, 0))
    }

    // MARK: keyboard actions

    func move(_ delta: Int) {
        guard !items.isEmpty else { return }
        selection = (selection + delta + items.count) % items.count
    }

    var selected: Item? { items.indices.contains(selection) ? items[selection] : nil }

    /// The project the selection belongs to, or the one you are inside.
    var focusedProject: Project? {
        if let id = selected?.projectId, let p = byId[id] { return p }
        return drilled
    }

    func activate(_ item: Item? = nil) {
        guard let item = item ?? selected else { return }
        if let id = item.projectId { touch(id) }
        switch item.action {
        case .drill(let project):
            drilled = project
        case .open(let url):
            NSWorkspace.shared.open(url)
            hidePanel()
        }
    }

    /// ⌘1–⌘9: that tab of the selected project, without stepping into it.
    func openTab(_ index: Int) {
        guard let project = focusedProject, projectTabs.indices.contains(index),
              let url = tabURL(project, projectTabs[index].tab) else { return }
        touch(project.id)
        NSWorkspace.shared.open(url)
        hidePanel()
    }

    func open(_ url: URL, project: Project?) {
        if let project { touch(project.id) }
        NSWorkspace.shared.open(url)
        hidePanel()
    }

    func copySelected() {
        guard let item = selected else { return }
        let url: URL?
        switch item.action {
        case .open(let u): url = u
        case .drill(let p): url = tabURL(p, nil)
        }
        guard let url else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.absoluteString, forType: .string)
        notice = "Copied \(url.absoluteString)"
    }

    /// Esc: leave settings, clear the query, step out of a project, then close.
    func back() {
        if showSettings { showSettings = false }
        else if !query.isEmpty { query = "" }
        else if drilled != nil { drilled = nil }
        else { hidePanel() }
    }

    private func touch(_ projectId: String) {
        var recents = settings.recents
        recents[projectId] = Date().timeIntervalSince1970
        if recents.count > 30 {
            for key in recents.sorted(by: { $0.value > $1.value }).dropFirst(30).map(\.key) { recents[key] = nil }
        }
        settings.recents = recents
    }

    func tabURL(_ project: Project, _ tab: String?) -> URL? {
        settings.url("/modules/project-links/\(project.id)" + (tab.map { "?tab=\($0)" } ?? ""))
    }

    // MARK: building the list

    private func recompute() {
        let tokens = Self.fold(query).split(separator: " ").map(String.init)
        if let project = drilled {
            items = rank(projectItems(project, flattened: false, includePages: !tokens.isEmpty), tokens, limit: 200)
        } else if tokens.isEmpty {
            items = rootItems()
        } else {
            var all = appItems() + projects.map { projectRow($0, section: "Projects") }
            for project in projects { all += projectItems(project, flattened: true, includePages: false) }
            items = rank(all, tokens, limit: 80)
        }
        selection = 0
    }

    private func rank(_ items: [Item], _ tokens: [String], limit: Int) -> [Item] {
        guard !tokens.isEmpty else { return items }
        let recents = settings.recents
        return items
            .compactMap { item -> (Item, Int)? in Self.score(item.haystack, tokens).map { (item, $0) } }
            .sorted { a, b in
                if a.1 != b.1 { return a.1 > b.1 }
                if a.0.dimmed != b.0.dimmed { return !a.0.dimmed }
                if a.0.kind != b.0.kind { return a.0.kind.rawValue < b.0.kind.rawValue }
                return (recents[a.0.projectId ?? ""] ?? 0) > (recents[b.0.projectId ?? ""] ?? 0)
            }
            .prefix(limit)
            .enumerated()
            // Ranked results are one mixed list: group them by kind, best match first within each.
            .sorted { ($0.element.0.kind.rawValue, $0.offset) < ($1.element.0.kind.rawValue, $1.offset) }
            .map { $0.element.0.with(section: Self.sectionName($0.element.0.kind)) }
    }

    private static func sectionName(_ kind: Item.Kind) -> String {
        switch kind {
        case .project: return "Projects"
        case .tab: return "Tabs"
        case .task: return "Tasks"
        case .step: return "Next on the checklist"
        case .site, .link: return "Links"
        case .page: return "Pages"
        case .app: return "App"
        }
    }

    private func rootItems() -> [Item] {
        let recents = settings.recents
        let recent = projects
            .filter { recents[$0.id] != nil }
            .sorted { recents[$0.id]! > recents[$1.id]! }
            .prefix(5)
        let recentIds = Set(recent.map(\.id))
        let rest = projects
            .filter { $0.isActive && !recentIds.contains($0.id) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        return recent.map { projectRow($0, section: "Recent") }
            + rest.map { projectRow($0, section: "Projects") }
            + appItems()
    }

    private func appItems() -> [Item] {
        appPages.compactMap { page in
            guard let url = settings.url(page.path) else { return nil }
            return Item(id: "app:\(page.path)", section: "App", kind: .app, title: page.title, subtitle: nil,
                        symbol: page.symbol, action: .open(url), haystack: Self.fold(page.title))
        }
    }

    private func projectRow(_ project: Project, section: String) -> Item {
        let s = project.summary
        var bits: [String] = []
        if let stage = s?.stage {
            var text = stage.index < stage.count ? "\(stage.title) · \(stage.index + 1)/\(stage.count)" : stage.title
            if let percent = stage.percent, percent > 0 { text += " · \(percent)%" }
            bits.append(text)
        } else {
            if let client = project.client, !client.isEmpty, client.caseInsensitiveCompare(project.name) != .orderedSame { bits.append(client) }
            if let tag = project.tags?.first { bits.append(tag.replacingOccurrences(of: "_", with: " ")) }
        }
        if let status = project.status, status != "current" { bits.insert(status.capitalized, at: 0) }

        var badges: [Badge] = []
        if let status = s?.clientStatus, status != "on_track", let label = clientStatusLabels[status] {
            badges.append(Badge(text: label.0, tone: label.1))
        }
        if let asks = s?.asks, asks > 0 { badges.append(Badge(text: "\(asks) ask\(asks == 1 ? "" : "s")", tone: .warn)) }
        if let overdue = s?.tasks?.overdue, overdue > 0 { badges.append(Badge(text: "\(overdue) overdue", tone: .bad)) }
        if let open = s?.tasks?.open, open > 0 { badges.append(Badge(text: "\(open) task\(open == 1 ? "" : "s")", tone: .neutral)) }
        if let blockers = project.stats?.blockers, blockers > 0 { badges.append(Badge(text: "\(blockers) blocker\(blockers == 1 ? "" : "s")", tone: .bad)) }

        return Item(id: "project:\(project.id):\(section)", section: section, kind: .project, title: project.name,
                    subtitle: bits.isEmpty ? nil : bits.joined(separator: " · "), symbol: "folder",
                    logo: project.logoUrl.flatMap(URL.init(string:)), action: .drill(project),
                    haystack: Self.fold("\(project.name) \(project.client ?? "") \(project.webflowConfig?.siteName ?? "") \(s?.stage?.title ?? "")"),
                    projectId: project.id, dimmed: !project.isActive, badges: badges)
    }

    /// Tabs, site, links, tasks and next steps for one project. `flattened`
    /// prefixes titles with the project name so they read on their own in the
    /// global search.
    private func projectItems(_ project: Project, flattened: Bool, includePages: Bool) -> [Item] {
        let prefix = flattened ? "\(project.name) › " : ""
        let projectHay = flattened ? "\(project.name) \(project.client ?? "") " : ""
        var out: [Item] = []

        func add(_ kind: Item.Kind, _ section: String, _ key: String, _ title: String, _ subtitle: String?,
                 _ symbol: String, _ url: URL?, extraHay: String = "", logo: URL? = nil, badges: [Badge] = []) {
            guard let url else { return }
            out.append(Item(id: "\(project.id):\(key)", section: section, kind: kind, title: prefix + title,
                            subtitle: subtitle, symbol: symbol, logo: logo, action: .open(url),
                            haystack: Self.fold(projectHay + title + " " + extraHay),
                            projectId: project.id, dimmed: !project.isActive, badges: badges))
        }

        for (i, tab) in projectTabs.enumerated() {
            add(.tab, "Project", "tab:\(tab.tab ?? "open")", tab.title, nil, tab.symbol, tabURL(project, tab.tab),
                badges: !flattened && i < 9 ? [Badge(text: "⌘\(i + 1)", tone: .neutral)] : [])
        }

        if let host = Self.host(project.webflowConfig?.customDomain) {
            if host.hasSuffix(".webflow.io") {
                let short = String(host.dropLast(".webflow.io".count))
                add(.site, "Site", "designer", "Webflow Designer", "\(short).design.webflow.com", "paintbrush",
                    URL(string: "https://\(short).design.webflow.com"), extraHay: "designer webflow",
                    logo: Self.favicon("webflow.com"))
                add(.site, "Site", "staging", "Staging site", host, "globe", URL(string: "https://\(host)"),
                    extraHay: "staging", logo: Self.favicon(host))
            } else {
                add(.site, "Site", "live", "Live site", host, "globe", URL(string: "https://\(host)"),
                    extraHay: "live site", logo: Self.favicon(host))
            }
        }
        if let sheet = project.summary?.sheetUrl, let url = URL(string: sheet) {
            add(.site, "Site", "sheet", "Project sheet", project.summary?.sheetTitle ?? "Google Sheets", "tablecells",
                url, extraHay: "sheet spreadsheet google", logo: Self.favicon("sheets.google.com"))
        }

        let links = (project.links ?? []).filter { !$0.url.trimmingCharacters(in: .whitespaces).isEmpty }
            .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
        for link in links where link.source != "auto" {
            let url = URL(string: link.url.trimmingCharacters(in: .whitespaces))
            add(.link, "Links", "link:\(link.id)", link.title, url?.host, Self.linkSymbol(link.url), url,
                extraHay: link.url, logo: Self.favicon(url?.host))
        }

        for task in project.summary?.tasks?.top ?? [] {
            guard let url = task.clickupUrl.flatMap(URL.init(string:)) ?? tabURL(project, "tasks") else { continue }
            var bits = [task.status.map(Self.words)].compactMap { $0 }
            if let due = task.dueDate { bits.append("due \(Self.shortDate(due))") }
            if let who = task.assignee { bits.append(Self.person(who)) }
            if flattened { bits.insert(project.name, at: 0) }
            var badges: [Badge] = []
            if let p = task.priority, p == "urgent" || p == "high" { badges.append(Badge(text: p.capitalized, tone: p == "urgent" ? .bad : .warn)) }
            if let due = task.dueDate, Self.isPast(due) { badges.append(Badge(text: "Overdue", tone: .bad)) }
            out.append(Item(id: "\(project.id):task:\(task.id)", section: "Tasks", kind: .task, title: task.title,
                            subtitle: bits.joined(separator: " · "),
                            symbol: task.status == "blocked" ? "exclamationmark.octagon" : "circle",
                            action: .open(url), haystack: Self.fold(projectHay + task.title + " task"),
                            projectId: project.id, dimmed: !project.isActive, badges: badges))
        }

        if !flattened, let steps = project.summary?.checklist?.next {
            for (i, step) in steps.enumerated() {
                var bits = [step.section].compactMap { $0 }
                if let owner = step.owner { bits.append(owner == "activeset" ? "ActiveSet" : owner.capitalized) }
                if let week = step.week { bits.append("week \(week)") }
                var badges: [Badge] = []
                if let p = step.priority { badges.append(Badge(text: p, tone: p == "P0" ? .warn : .neutral)) }
                if step.status == "in_progress" { badges.append(Badge(text: "In progress", tone: .accent)) }
                add(.step, "Next on the checklist", "step:\(i)", step.title, bits.joined(separator: " · "),
                    step.status == "in_progress" ? "circle.lefthalf.filled" : "circle.dashed",
                    tabURL(project, "checklist"), badges: badges)
            }
        }

        if includePages {
            for link in links where link.source == "auto" {
                let url = URL(string: link.url)
                let path = url.map { $0.path.isEmpty ? "/" : $0.path } ?? link.url
                add(.page, "Pages", "page:\(link.id)", path, url?.host, "doc", url, extraHay: link.title)
            }
        }
        return out
    }

    // MARK: helpers

    static func fold(_ s: String) -> String {
        s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }

    /// Every token must appear; word starts score higher than mid-word hits.
    static func score(_ hay: String, _ tokens: [String]) -> Int? {
        var total = 0
        for token in tokens {
            guard let range = hay.range(of: token) else { return nil }
            if range.lowerBound == hay.startIndex { total += 3 }
            else if " /.-_›".contains(hay[hay.index(before: range.lowerBound)]) { total += 2 }
            else { total += 1 }
        }
        return total
    }

    static func favicon(_ host: String?) -> URL? {
        guard let host, !host.isEmpty else { return nil }
        return URL(string: "https://www.google.com/s2/favicons?domain=\(host)&sz=64")
    }

    private static func host(_ domain: String?) -> String? {
        guard var d = domain?.trimmingCharacters(in: .whitespaces), !d.isEmpty else { return nil }
        if !d.contains("://") { d = "https://" + d }
        return URL(string: d)?.host
    }

    static func words(_ s: String) -> String {
        let t = s.replacingOccurrences(of: "_", with: " ")
        return t.prefix(1).uppercased() + t.dropFirst()
    }

    /// "rehan@activeset.co" → "Rehan"
    static func person(_ email: String) -> String {
        words(String(email.split(separator: "@").first ?? Substring(email)).replacingOccurrences(of: ".", with: " "))
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func day(_ iso: String) -> Date? { isoDay.date(from: String(iso.prefix(10))) }

    /// "2026-10-13" → "13 Oct"
    static func shortDate(_ iso: String) -> String {
        guard let date = day(iso) else { return iso }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }

    static func isPast(_ iso: String) -> Bool {
        guard let date = day(iso) else { return false }
        return date < Calendar.current.startOfDay(for: Date())
    }

    private static func linkSymbol(_ url: String) -> String {
        let u = url.lowercased()
        if u.contains("figma.com") { return "pencil.and.outline" }
        if u.contains("docs.google.com/spreadsheets") { return "tablecells" }
        if u.contains("docs.google.com") { return "doc.richtext" }
        if u.contains("drive.google.com") { return "externaldrive" }
        if u.contains("webflow") { return "globe" }
        if u.contains("clickup.com") { return "checkmark.circle" }
        if u.contains("markup.io") { return "bubble.left.and.text.bubble.right" }
        if u.contains("slack.com") { return "number" }
        return "link"
    }
}
