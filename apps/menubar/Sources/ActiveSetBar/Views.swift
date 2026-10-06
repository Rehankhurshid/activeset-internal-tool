import AppKit
import SwiftUI

let panelSize = CGSize(width: 820, height: 540)

struct PanelView: View {
    @ObservedObject var store: Store

    var body: some View {
        VStack(spacing: 0) {
            if store.showSettings {
                SettingsView(store: store)
            } else {
                SearchHeader(store: store)
                Divider()
                HStack(spacing: 0) {
                    ResultsList(store: store)
                        .frame(width: 440)
                    Divider()
                    DetailPane(store: store)
                        .frame(maxWidth: .infinity)
                }
                Divider()
                Footer(store: store)
            }
        }
        .frame(width: panelSize.width, height: panelSize.height)
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.82))
        .background(VisualEffect())
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.08)))
    }
}

private struct SearchHeader: View {
    @ObservedObject var store: Store
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            if let project = store.drilled {
                Button { store.drilled = nil } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left").font(.system(size: 10, weight: .bold))
                        Text(project.name).lineLimit(1)
                    }
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(Color.accentColor.opacity(0.2)))
                }
                .buttonStyle(.plain)
            } else {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            }
            TextField(store.drilled == nil ? "Search projects, tabs, links…" : "Filter tabs, links, pages…", text: $store.query)
                .textFieldStyle(.plain)
                .font(.system(size: 16))
                .focused($focused)
            if store.loading { ProgressView().controlSize(.small) }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .onAppear { focused = true }
        .onChange(of: store.focusTick) { focused = true }
        .onChange(of: store.drilled?.id) { focused = true }
    }
}

private struct ResultsList: View {
    @ObservedObject var store: Store

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    ForEach(Array(store.items.enumerated()), id: \.element.id) { index, item in
                        if index == 0 || store.items[index - 1].section != item.section {
                            Text(item.section)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 10)
                                .padding(.top, index == 0 ? 4 : 10)
                                .padding(.bottom, 2)
                        }
                        Row(item: item, selected: index == store.selection)
                            .id(item.id)
                            .onTapGesture { store.selection = index; store.activate(item) }
                    }
                    if store.items.isEmpty {
                        Text(emptyText)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 60)
                    }
                }
                .padding(6)
            }
            .onChange(of: store.selection) {
                guard let item = store.selected else { return }
                proxy.scrollTo(item.id)
            }
            .onChange(of: store.items.first?.id) {
                if let first = store.items.first { proxy.scrollTo(first.id, anchor: .top) }
            }
        }
    }

    private var emptyText: String {
        if store.projects.isEmpty { return store.loading ? "Loading projects…" : "No projects loaded" }
        return "Nothing matches “\(store.query)”"
    }
}

private struct Row: View {
    let item: Item
    let selected: Bool

    var body: some View {
        HStack(spacing: 10) {
            Icon(item: item).frame(width: 20, height: 20)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(.system(size: 13, weight: .medium)).lineLimit(1)
                if let subtitle = item.subtitle {
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            ForEach(item.badges.prefix(3), id: \.self) { BadgeView(badge: $0) }
            if selected {
                Text(item.isDrill ? "→" : "↩")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 12)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, item.subtitle == nil ? 7 : 5)
        .background(RoundedRectangle(cornerRadius: 7, style: .continuous)
            .fill(selected ? Color.accentColor.opacity(0.25) : .clear))
        .opacity(item.dimmed ? 0.55 : 1)
        .contentShape(Rectangle())
    }
}

private struct Icon: View {
    let item: Item

    var body: some View {
        if let logo = item.logo {
            AsyncImage(url: logo) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 4))
                } else {
                    symbol
                }
            }
        } else {
            symbol
        }
    }

    private var symbol: some View {
        Image(systemName: item.symbol)
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
    }
}

private struct Footer: View {
    @ObservedObject var store: Store

    var body: some View {
        HStack(spacing: 10) {
            Text(status)
                .foregroundStyle(store.error != nil ? Color.red : .secondary)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Text("↩ open  → into  ⌘1–9 tabs  ⌘↩ copy  esc back")
                .foregroundStyle(.tertiary)
            Button { store.showSettings = true } label: { Image(systemName: "gearshape") }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Settings (⌘,)")
        }
        .font(.system(size: 11))
        .padding(.horizontal, 12)
        .frame(height: 30)
    }

    private var status: String {
        if let notice = store.notice { return notice }
        if let error = store.error { return error }
        if store.loading { return "Refreshing…" }
        guard let date = store.lastUpdated else { return "" }
        let ago = RelativeDateTimeFormatter().localizedString(for: date, relativeTo: Date())
        return "\(store.projects.count) projects · \(ago)"
    }
}

struct SettingsView: View {
    @ObservedObject var store: Store
    @State private var baseURL = ""
    @State private var token = ""
    @State private var email = ""
    @State private var openAtLogin = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Settings").font(.system(size: 15, weight: .semibold))
            field("App URL") { TextField("https://app.activeset.co", text: $baseURL) }
            field("API token") { SecureField("RAYCAST_API_TOKEN", text: $token) }
            Text("The shared token the Raycast extension uses (RAYCAST_API_TOKEN). Stored only on this Mac.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
            field("Your email") { TextField("you@activeset.co", text: $email) }
            Toggle("Open at login", isOn: $openAtLogin)
            Text("Hotkey: ⌃⌥A opens this panel from anywhere. It starts at login unless you turn that off here.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
            Spacer()
            HStack {
                Button("Quit") { NSApp.terminate(nil) }
                Spacer()
                Button("Cancel") { store.showSettings = false }
                Button("Save") { save() }.keyboardShortcut(.defaultAction)
            }
        }
        .textFieldStyle(.roundedBorder)
        .padding(18)
        .onAppear {
            baseURL = store.settings.baseURL
            token = store.settings.token
            email = store.settings.email
            openAtLogin = store.settings.openAtLogin
        }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            content()
        }
    }

    private func save() {
        store.settings.baseURL = baseURL.isEmpty ? "https://app.activeset.co" : baseURL
        store.settings.token = token
        store.settings.email = email
        if openAtLogin != store.settings.openAtLogin { store.settings.openAtLogin = openAtLogin }
        store.showSettings = false
        store.refresh()
    }
}

struct BadgeView: View {
    let badge: Badge

    var body: some View {
        Text(badge.text)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(color.opacity(0.15)))
            .lineLimit(1)
            .fixedSize()
    }

    private var color: Color {
        switch badge.tone {
        case .neutral: return .secondary
        case .accent: return .accentColor
        case .good: return .green
        case .warn: return .orange
        case .bad: return .red
        }
    }
}

// MARK: - Detail pane

private struct DetailPane: View {
    @ObservedObject var store: Store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let item = store.selected {
                    if let project = store.focusedProject {
                        ProjectDetail(store: store, project: project, item: item)
                    } else {
                        PlainDetail(item: item)
                    }
                } else {
                    Text("Nothing selected").foregroundStyle(.secondary)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.primary.opacity(0.025))
    }
}

private struct PlainDetail: View {
    let item: Item

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Icon(item: item).frame(width: 28, height: 28)
            Text(item.title).font(.system(size: 15, weight: .semibold))
            if let url = item.url {
                Text(url.absoluteString).font(.system(size: 11)).foregroundStyle(.secondary).textSelection(.enabled)
            }
        }
    }
}

private struct ProjectDetail: View {
    @ObservedObject var store: Store
    let project: Project
    let item: Item

    private var s: Project.Summary? { project.summary }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            if item.kind != .project && item.kind != .tab, let url = item.url { selectedCard(url) }
            if let status = s?.clientStatus, let label = clientStatusLabels[status] {
                VStack(alignment: .leading, spacing: 4) {
                    BadgeView(badge: Badge(text: label.0, tone: label.1))
                    if let note = s?.clientStatusNote, !note.isEmpty { Text(note).font(.system(size: 12)) }
                }
            }
            if let stage = s?.stage { stageBlock(stage) }
            if let checklist = s?.checklist { checklistBlock(checklist) }
            if let milestone = s?.milestone { milestoneBlock(milestone) }
            if let tasks = s?.tasks { tasksBlock(tasks) }
            clientPageBlock
            teamBlock
            if s == nil {
                Text("Stage, checklist and tasks appear once the app's server has the summary endpoint.")
                    .font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            shortcuts
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Group {
                if let logo = project.logoUrl.flatMap(URL.init(string:)) {
                    AsyncImage(url: logo) { $0.image?.resizable().scaledToFit() }
                } else {
                    Image(systemName: "folder").font(.system(size: 18)).foregroundStyle(.secondary)
                }
            }
            .frame(width: 34, height: 34)
            .clipShape(RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 2) {
                Text(project.name).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }

    private var subtitle: String {
        var bits: [String] = []
        if let client = project.client, !client.isEmpty, client != project.name { bits.append(client) }
        bits.append((project.status ?? "current").capitalized)
        if let services = s?.services, !services.isEmpty {
            bits.append(services.map { Store.words($0) }.joined(separator: ", "))
        } else if let tag = project.tags?.first {
            bits.append(Store.words(tag))
        }
        return bits.joined(separator: " · ")
    }

    private func selectedCard(_ url: URL) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Icon(item: item).frame(width: 16, height: 16)
                Text(item.title).font(.system(size: 12, weight: .semibold)).lineLimit(2)
            }
            Text(url.absoluteString)
                .font(.system(size: 11)).foregroundStyle(.secondary)
                .lineLimit(3).textSelection(.enabled)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.05)))
    }

    private func stageBlock(_ stage: Project.Summary.Stage) -> some View {
        block("Client page stage") {
            HStack {
                Text(stage.title).font(.system(size: 13, weight: .medium))
                Spacer()
                if stage.index < stage.count {
                    Text("\(stage.index + 1) of \(stage.count)").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
            SegmentBar(done: stage.index, total: stage.count)
            HStack(spacing: 8) {
                if let percent = stage.percent { Text("\(percent)% through").foregroundStyle(.secondary) }
                if let due = stage.dueDate {
                    Text("due \(Store.shortDate(due))").foregroundStyle(Store.isPast(due) ? .red : .secondary)
                }
                if let source = stage.source { Text("from the \(source)").foregroundStyle(.tertiary) }
            }
            .font(.system(size: 11))
        }
    }

    private func checklistBlock(_ checklist: Project.Summary.Checklist) -> some View {
        block("Checklist") {
            HStack {
                Text("\(checklist.done) of \(checklist.total) done").font(.system(size: 12, weight: .medium))
                Spacer()
                Text("\(checklist.total == 0 ? 0 : checklist.done * 100 / checklist.total)%")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            ProgressView(value: Double(checklist.done), total: Double(max(checklist.total, 1)))
                .progressViewStyle(.linear)
            ForEach(Array((checklist.next ?? []).enumerated()), id: \.offset) { _, step in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: step.status == "in_progress" ? "circle.lefthalf.filled" : "circle")
                        .font(.system(size: 9)).foregroundStyle(.secondary)
                    Text(step.title).font(.system(size: 12)).lineLimit(2)
                }
            }
        }
    }

    private func milestoneBlock(_ milestone: Project.Summary.Milestone) -> some View {
        block("Next milestone") {
            Text(milestone.title).font(.system(size: 12, weight: .medium))
            HStack(spacing: 8) {
                if let phase = milestone.phase { Text(phase) }
                if let start = milestone.startDate, let end = milestone.endDate {
                    Text("\(Store.shortDate(start)) – \(Store.shortDate(end))")
                        .foregroundStyle(Store.isPast(end) ? .red : .secondary)
                }
                if let count = s?.milestones { Text("\(count.done)/\(count.total) done").foregroundStyle(.tertiary) }
            }
            .font(.system(size: 11)).foregroundStyle(.secondary)
        }
    }

    private func tasksBlock(_ tasks: Project.Summary.Tasks) -> some View {
        block("Tasks") {
            HStack(spacing: 6) {
                BadgeView(badge: Badge(text: "\(tasks.open) open", tone: .neutral))
                if let n = tasks.overdue, n > 0 { BadgeView(badge: Badge(text: "\(n) overdue", tone: .bad)) }
                if let n = tasks.blocked, n > 0 { BadgeView(badge: Badge(text: "\(n) blocked", tone: .bad)) }
                if let n = tasks.urgent, n > 0 { BadgeView(badge: Badge(text: "\(n) high", tone: .warn)) }
            }
            ForEach((tasks.top ?? []).prefix(4), id: \.id) { task in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: task.status == "blocked" ? "exclamationmark.octagon" : "circle")
                        .font(.system(size: 9)).foregroundStyle(task.status == "blocked" ? .red : .secondary)
                    Text(task.title).font(.system(size: 12)).lineLimit(1)
                    Spacer(minLength: 4)
                    if let due = task.dueDate {
                        Text(Store.shortDate(due)).font(.system(size: 10))
                            .foregroundStyle(Store.isPast(due) ? .red : .secondary)
                    }
                }
            }
        }
    }

    @ViewBuilder private var clientPageBlock: some View {
        let views = s?.portalViews ?? 0
        let asks = s?.asks ?? 0
        if views > 0 || asks > 0 || s?.sheetUrl != nil {
            block("Client") {
                if asks > 0 { line("questionmark.bubble", "\(asks) thing\(asks == 1 ? "" : "s") we need from them") }
                if views > 0 {
                    let last = s?.portalLastViewedAt.flatMap(Self.relative) ?? ""
                    line("eye", "Client page opened \(views)×\(last.isEmpty ? "" : ", last \(last)")")
                }
                if s?.sheetUrl != nil { line("tablecells", s?.sheetTitle ?? "Project sheet") }
            }
        }
    }

    @ViewBuilder private var teamBlock: some View {
        let owner = s?.owner
        let people = s?.assignees ?? []
        if owner != nil || !people.isEmpty || project.lastReviewDate != nil || project.clickupListName != nil {
            block("Team") {
                if let owner { line("person.crop.circle", "Owner: \(Store.person(owner))") }
                if !people.isEmpty { line("person.2", people.map(Store.person).joined(separator: ", ")) }
                if let date = project.lastReviewDate {
                    line("checkmark.seal", "Reviewed \(Store.shortDate(date))\(project.lastReviewedBy.map { " by \(Store.person($0))" } ?? "")")
                }
                if let list = project.clickupListName { line("checkmark.circle", list) }
            }
        }
    }

    private var shortcuts: some View {
        block("Shortcuts") {
            LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], spacing: 4) {
                ForEach(0..<9, id: \.self) { i in
                    Button { store.openTab(i) } label: {
                        HStack(spacing: 4) {
                            Text("⌘\(i + 1)").foregroundStyle(.tertiary).frame(width: 22, alignment: .leading)
                            Text(projectTabs[i].title)
                        }
                        .font(.system(size: 11))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func block<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary)
            content()
        }
    }

    private func line(_ symbol: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: symbol).font(.system(size: 10)).foregroundStyle(.secondary).frame(width: 14)
            Text(text).font(.system(size: 12)).lineLimit(2)
        }
    }

    private static func relative(_ iso: String) -> String? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        return RelativeDateTimeFormatter().localizedString(for: date, relativeTo: Date())
    }
}

/// One segment per stage: done ones filled, the current one half.
private struct SegmentBar: View {
    let done: Int
    let total: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<max(total, 1), id: \.self) { i in
                Capsule()
                    .fill(i < done ? Color.accentColor : i == done ? Color.accentColor.opacity(0.45) : Color.primary.opacity(0.12))
                    .frame(height: 5)
            }
        }
    }
}

private struct VisualEffect: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .popover
        view.blendingMode = .behindWindow
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}
