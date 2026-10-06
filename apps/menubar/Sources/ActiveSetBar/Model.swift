import Foundation
import ServiceManagement

// MARK: - API payload (subset of RaycastProjectPayload in src/lib/raycast-projects.ts)

struct Project: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let status: String?
    let tags: [String]?
    let client: String?
    let logoUrl: String?
    let webflowConfig: WebflowConfig?
    let links: [Link]?
    let stats: Stats?
    let lastReviewDate: String?
    let lastReviewedBy: String?
    let clickupListName: String?
    let summary: Summary?

    struct WebflowConfig: Codable, Hashable {
        let siteName: String?
        let customDomain: String?
    }

    struct Link: Codable, Hashable {
        let id: String
        let title: String
        let url: String
        let source: String?
        let order: Double?
    }

    struct Stats: Codable, Hashable {
        let blockers: Int?
        let openTasks: Int?
    }

    /// `?summary=true` on the projects route (src/lib/raycast-summary.ts).
    struct Summary: Codable, Hashable {
        let clientStatus: String?
        let clientStatusNote: String?
        let stage: Stage?
        let asks: Int?
        let clientUpdatedAt: String?
        let portalViews: Int?
        let portalLastViewedAt: String?
        let checklist: Checklist?
        let milestone: Milestone?
        let milestones: Count?
        let tasks: Tasks?
        let sheetUrl: String?
        let sheetTitle: String?
        let owner: String?
        let assignees: [String]?
        let services: [String]?

        struct Stage: Codable, Hashable {
            let title: String
            let index: Int
            let count: Int
            let percent: Int?
            let dueDate: String?
            let source: String?
        }
        struct Checklist: Codable, Hashable {
            let done: Int
            let total: Int
            let inProgress: Int?
            let next: [Step]?
        }
        struct Step: Codable, Hashable {
            let title: String
            let status: String?
            let owner: String?
            let priority: String?
            let week: String?
            let section: String?
        }
        struct Milestone: Codable, Hashable {
            let title: String
            let status: String?
            let startDate: String?
            let endDate: String?
            let phase: String?
        }
        struct Count: Codable, Hashable {
            let done: Int
            let total: Int
        }
        struct Tasks: Codable, Hashable {
            let open: Int
            let blocked: Int?
            let urgent: Int?
            let overdue: Int?
            let top: [Task]?
        }
        struct Task: Codable, Hashable {
            let id: String
            let title: String
            let status: String?
            let priority: String?
            let dueDate: String?
            let assignee: String?
            let clickupUrl: String?
        }
    }

    /// paid, past and closed projects are searchable but kept off the default list.
    var isActive: Bool { !["paid", "past", "closed"].contains(status ?? "current") }
}

private struct ProjectsResponse: Decodable {
    let ok: Bool?
    let error: String?
    let projects: [Project]?
}

// MARK: - Settings (base URL and email in UserDefaults, token in Application Support)

final class Settings {
    private let defaults = UserDefaults.standard

    var baseURL: String {
        get { defaults.string(forKey: "baseURL") ?? "https://app.activeset.co" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "baseURL") }
    }

    var email: String {
        get { defaults.string(forKey: "email") ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespaces), forKey: "email") }
    }

    /// projectId -> last opened (seconds since 1970)
    var recents: [String: Double] {
        get { defaults.dictionary(forKey: "recents") as? [String: Double] ?? [:] }
        set { defaults.set(newValue, forKey: "recents") }
    }

    /// Kept in a 0600 file rather than the Keychain: the app is ad-hoc signed, so
    /// every rebuild would otherwise ask for the login password again.
    var token: String {
        get { (try? String(contentsOf: Self.tokenURL, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
        set {
            let value = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { try? FileManager.default.removeItem(at: Self.tokenURL); return }
            FileManager.default.createFile(atPath: Self.tokenURL.path, contents: Data(value.utf8),
                                           attributes: [.posixPermissions: 0o600])
        }
    }

    static var supportDir: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ActiveSetBar", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static var tokenURL: URL { supportDir.appendingPathComponent("token") }

    var openAtLogin: Bool {
        get { SMAppService.mainApp.status == .enabled }
        set {
            do {
                if newValue { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            } catch {
                NSLog("ActiveSetBar: login item change failed: \(error)")
            }
        }
    }

    func url(_ path: String) -> URL? { URL(string: baseURL + path) }
}

// MARK: - API client and disk cache

enum API {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static func fetchProjects(_ settings: Settings) async throws -> (projects: [Project], raw: Data) {
        guard !settings.token.isEmpty else { throw Failure(message: "Add the API token in Settings (⌘,)") }
        guard let url = settings.url("/api/raycast/projects?includeLinks=true&summary=true") else {
            throw Failure(message: "Base URL is not valid")
        }
        var request = URLRequest(url: url, timeoutInterval: 60)
        request.setValue(settings.token, forHTTPHeaderField: "x-raycast-token")
        if !settings.email.isEmpty { request.setValue(settings.email, forHTTPHeaderField: "x-activeset-user-email") }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let decoded = try? JSONDecoder().decode(ProjectsResponse.self, from: data)
        if status == 401 || status == 403 { throw Failure(message: "Token rejected. Check Settings (⌘,)") }
        guard (200..<300).contains(status), let projects = decoded?.projects else {
            throw Failure(message: decoded?.error ?? "Server returned \(status)")
        }
        return (projects, data)
    }

    private static var cacheURL: URL { Settings.supportDir.appendingPathComponent("projects.json") }

    static func loadCache() -> (projects: [Project], date: Date?) {
        guard let data = try? Data(contentsOf: cacheURL),
              let decoded = try? JSONDecoder().decode(ProjectsResponse.self, from: data) else { return ([], nil) }
        let date = (try? FileManager.default.attributesOfItem(atPath: cacheURL.path))?[.modificationDate] as? Date
        return (decoded.projects ?? [], date)
    }

    static func saveCache(_ data: Data) {
        try? data.write(to: cacheURL, options: .atomic)
    }
}
