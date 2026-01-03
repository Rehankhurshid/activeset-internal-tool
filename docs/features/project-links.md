# Project Links Management

The Project Links module is the central hub for managing client projects, embedded widgets, website auditing, and Webflow page management. It provides a unified interface for monitoring and optimizing client websites.

## Core Architecture

### Data Model

The module centers around the `Project` data model:

```typescript
interface Project {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  links: ProjectLink[];
  webflowConfig?: WebflowConfig;
}

interface ProjectLink {
  id: string;
  title: string;
  url: string;
  order: number;
  isDefault: boolean;
  source: 'manual' | 'auto'; // 'auto' = discovered via sitemap
  auditResult?: AuditResult;  // Populated by widget scans
}
```

### Module Structure

```
src/app/modules/project-links/
├── page.tsx                    # Project list dashboard
├── [id]/
│   ├── page.tsx               # Single project detail page
│   └── audit/
│       └── [linkId]/
│           └── page.tsx       # Individual page audit details
```

---

## Key Features & Workflows

### 1. Project Dashboard

**Location**: `src/app/modules/project-links/page.tsx`

The main entry point displays all user projects in a card grid layout.

- **Project Cards**: Shows project name, link count, and quick stats
- **Create Project**: Add new projects with a unique name
- **Access Control**: Only users with `project-links` module access can view
- **Real-time Updates**: Uses Firebase subscriptions for live data sync

**Components**:
- `Dashboard` - Main dashboard controller (src/components/dashboard/Dashboard.tsx)
- `ProjectCard` - Individual project card display (src/components/projects/ProjectCard.tsx)
- `ProjectStats` - Project statistics display (src/components/projects/ProjectStats.tsx)

---

### 2. Project Detail View

**Location**: `src/app/modules/project-links/[id]/page.tsx`

Single project page with tabbed interface for different features:

#### Tabs:

##### **Audit Dashboard Tab** (Default)
- Displays content quality audit results for all auto-discovered pages
- Shows pages scanned via sitemap with quality scores
- Filters by status: No change, Content changed, Tech change, Blocked, Failed
- Integrated with the [Audit Dashboard](./audit-dashboard.md) feature

**Key Features**:
- **Scan Sitemap**: Auto-discover pages from sitemap.xml
- **Quality Scoring**: 0-100 score based on 5 categories
- **Change Detection**: Tracks content and technical changes
- **Deployment Gating**: Blocks deployment if placeholders detected

##### **Webflow Pages Tab**
- Manage and optimize Webflow site pages
- SEO health analysis and bulk editing
- Integrated with the [Webflow Pages](./webflow-pages.md) feature

**Key Features**:
- **SEO Analysis**: Score pages on metadata quality
- **Bulk Editing**: Mass update titles, descriptions, Open Graph tags
- **AI Generation**: Generate optimized SEO metadata
- **Localization**: Support for primary and secondary locales

---

### 3. Link Management

Links can be added two ways:

#### Manual Links
- User-created via "Add Link" dialog
- Used for custom bookmarks or important pages
- Displayed in embedded widget
- `source: 'manual'`

#### Auto-Discovered Links
- Scraped from sitemap.xml via "Scan Sitemap" feature
- Automatically monitored for content quality
- Powers the Audit Dashboard
- `source: 'auto'`

**Components**:
- `LinkList` - Displays and manages project links (src/components/projects/LinkList.tsx)
- `LinkItem` - Individual link with drag-and-drop reordering (src/components/projects/LinkItem.tsx)
- `AddLinkDialog` - Modal for adding new manual links (src/components/projects/AddLinkDialog.tsx)
- `ScanSitemapDialog` - Sitemap scanning interface (src/components/scan-sitemap-dialog.tsx)

---

### 4. Widget Embedding

**Location**: `EmbedDialog` component (src/components/projects/EmbedDialog.tsx)

Generate embeddable widget code for client websites.

**Embed Code**:
```html
<script src="https://app.activeset.co/widget.js"
        data-project-id="PROJECT_ID">
</script>
```

**Widget Features**:
- Displays manual project links
- Runs content quality audits on page load
- Syncs audit results to dashboard
- Configurable appearance and position

**How It Works**:
1. Client embeds script on their website
2. Widget loads and extracts page content
3. Computes quality scores (placeholders, spelling, SEO, etc.)
4. POSTs results to `/api/save-audit`
5. Dashboard updates in real-time via Firebase subscription

---

### 5. Sitemap Scanning

**Location**: `ScanSitemapDialog` component

Automatically discover all pages from a website's sitemap.

**Workflow**:
1. User provides sitemap URL (e.g., `https://example.com/sitemap.xml`)
2. API parses XML and extracts `<loc>` tags
3. New URLs added as `ProjectLink` with `source: 'auto'`
4. Widget scans these pages on next visit
5. Audit results appear in Audit Dashboard tab

**API Endpoint**: `/api/scan-sitemap`

---

## Component Hierarchy

```
ProjectLinksPage (page.tsx)
└── Dashboard
    ├── ProjectCard (for each project)
    │   ├── ProjectStats
    │   └── Actions (Edit, Delete, View)
    └── CreateProjectDialog

ProjectDetailPage ([id]/page.tsx)
├── Header
│   ├── InlineEdit (project name)
│   ├── EmbedDialog (widget code)
│   └── ModeToggle (dark/light theme)
└── Tabs
    ├── Audit Dashboard Tab
    │   ├── ScanSitemapDialog
    │   └── WebsiteAuditDashboard
    │       ├── KPI Cards
    │       ├── Filters & Search
    │       └── Pages Table
    │           └── PageDetails (drill-down)
    └── Webflow Pages Tab
        └── WebflowPagesDashboard
            ├── Settings (API token, domain)
            ├── Pages Table
            ├── WebflowSEOEditor (single page)
            └── WebflowBulkSEOEditor (bulk edit)
```

---

## Technical Specifications

### Data Flow

1. **Project Creation**:
   - `projectsService.createProject(userId, name)`
   - Stores in Firestore `projects` collection
   - Auto-generates unique ID

2. **Link Management**:
   - `projectsService.addLinkToProject(projectId, linkData)`
   - `projectsService.updateLinkOrder(projectId, links)`
   - `projectsService.deleteLinkFromProject(projectId, linkId)`

3. **Real-time Sync**:
   - `projectsService.subscribeToProject(projectId, callback)`
   - Uses Firestore `onSnapshot` for live updates
   - Automatically reflects widget audit results

4. **Webflow Integration**:
   - `projectsService.updateWebflowConfig(projectId, config)`
   - Stores API token and site ID in project document
   - Powers Webflow Pages tab

### Service Layer

**Location**: `src/services/database.ts`

```typescript
export const projectsService = {
  // Project CRUD
  createProject(userId: string, name: string): Promise<Project>
  getProjects(userId: string): Promise<Project[]>
  subscribeToProject(projectId: string, callback: (project: Project) => void): () => void
  updateProjectName(projectId: string, name: string): Promise<void>
  deleteProject(projectId: string): Promise<void>

  // Link Management
  addLinkToProject(projectId: string, link: Omit<ProjectLink, 'id'>): Promise<void>
  updateLinkOrder(projectId: string, links: ProjectLink[]): Promise<void>
  deleteLinkFromProject(projectId: string, linkId: string): Promise<void>

  // Webflow Integration
  updateWebflowConfig(projectId: string, config: WebflowConfig): Promise<void>
  removeWebflowConfig(projectId: string): Promise<void>
};
```

### Access Control

- **Authentication**: Firebase Auth (Google Sign-In only)
- **Email Restriction**: Only `@activeset.co` emails allowed
- **Module Access**: Controlled via `access_control` collection
- **Admin**: `rehan@activeset.co` (full access)

**Hook**: `useModuleAccess('project-links')`

---

## Integration Points

### Audit Dashboard Integration

The Audit Dashboard tab is powered by the standalone [Audit Dashboard](./audit-dashboard.md) feature:

- Auto-discovered links (`source: 'auto'`) populate the audit table
- Widget scans update `auditResult` field on `ProjectLink`
- Change detection tracks content and technical modifications
- 5-category scoring system (placeholders, spelling, readability, completeness, SEO)

### Webflow Pages Integration

The Webflow Pages tab is powered by the [Webflow Pages](./webflow-pages.md) feature:

- Requires Webflow API token and Site ID in project settings
- Fetches pages via Webflow v2 API
- SEO health scoring and bulk editing
- Localization support for multi-language sites

### Widget Integration

Client-side widget (`public/widget.js`) communicates with:

- **GET** `/api/audit-config` - Check if spellcheck is enabled for URL
- **POST** `/api/save-audit` - Sync audit results to project
- **POST** `/api/check-text` - Spell check via LanguageTool

---

## Firestore Collections

### `projects`

```json
{
  "id": "project-123",
  "name": "Client Website",
  "userId": "user-456",
  "createdAt": "2026-01-01T12:00:00Z",
  "links": [
    {
      "id": "link-789",
      "title": "Homepage",
      "url": "https://example.com",
      "order": 0,
      "isDefault": true,
      "source": "auto",
      "auditResult": {
        "score": 85,
        "canDeploy": true,
        "lastRun": "2026-01-03T10:00:00Z",
        "categories": { /* ... */ }
      }
    }
  ],
  "webflowConfig": {
    "siteId": "site-id",
    "apiToken": "encrypted-token",
    "customDomain": "example.com"
  }
}
```

---

## Common Operations

### Creating a New Project

```typescript
import { projectsService } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';

const { user } = useAuth();
const project = await projectsService.createProject(user.uid, 'New Project');
```

### Adding a Link

```typescript
await projectsService.addLinkToProject(projectId, {
  title: 'About Page',
  url: 'https://example.com/about',
  order: 1,
  isDefault: false,
  source: 'manual'
});
```

### Scanning a Sitemap

```typescript
// Via ScanSitemapDialog component
const response = await fetch('/api/scan-sitemap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    sitemapUrl: 'https://example.com/sitemap.xml'
  })
});
```

### Subscribing to Project Updates

```typescript
useEffect(() => {
  if (!projectId) return;

  const unsubscribe = projectsService.subscribeToProject(
    projectId,
    (updatedProject) => {
      setProject(updatedProject);
    }
  );

  return () => unsubscribe();
}, [projectId]);
```

---

## UI/UX Patterns

### Inline Editing
- Project name is inline-editable via `InlineEdit` component
- Saves automatically on blur or Enter key
- Provides immediate visual feedback

### Real-time Badges
- Link count badge updates live as links are added/removed
- Audit status badges reflect latest scan results
- Color-coded indicators (green, yellow, red) for quality scores

### Drag-and-Drop
- Manual links can be reordered via drag-and-drop
- Auto-saved to Firestore on drop
- Visual feedback during drag operation

### Responsive Design
- Mobile-friendly with collapsible navigation
- Responsive tabs (abbreviated labels on small screens)
- Card grid adapts to screen size

---

## Related Features

- **Audit Dashboard**: [audit-dashboard.md](./audit-dashboard.md) - Detailed content quality monitoring
- **Webflow Pages**: [webflow-pages.md](./webflow-pages.md) - SEO management for Webflow sites
- **Widget**: `public/widget.js` - Embeddable client-side script

---

## Environment Variables

```bash
# Firebase (required for all features)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# AI for audit analysis (optional)
GEMINI_API_KEY
```

---

## Known Limitations

1. **Single User Projects**: Projects are not shared between users (user-specific)
2. **No Scheduled Scans**: Audits only run when widget is loaded on client site
3. **Manual Link Widget**: Auto-discovered links don't appear in embedded widget
4. **Webflow Rate Limits**: Webflow API has rate limits (60 requests/minute)
5. **Large Sitemaps**: Very large sitemaps (>1000 URLs) may timeout

---

## Extension Points

> [!TIP]
> When extending Project Links, consider these integration points:

| Task | Files to Modify |
|------|----------------|
| Add new project metadata field | `types/index.ts` → `Project` interface, `database.ts` → CRUD methods |
| Add new tab to project detail | `[id]/page.tsx` → Add `TabsTrigger` and `TabsContent` |
| Customize widget behavior | `public/widget.js` → Modify `ContentQualityAuditor` |
| Add new link metadata | `types/index.ts` → `ProjectLink` interface |
| Modify dashboard layout | `components/dashboard/Dashboard.tsx` |
