# Proposal Generator & Management

The Proposal module provides a comprehensive system for creating, managing, and sharing professional client proposals with built-in templates, electronic signatures, and public sharing capabilities.

## Core Architecture

### Data Model

```typescript
interface Proposal {
  id: string;
  createdBy?: {
    uid: string;
    email: string;
    displayName?: string;
  };
  title: string;
  clientName: string;
  agencyName: string;
  heroImage?: string;              // URL or data URL for hero banner
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  data: {
    overview: string;
    overviewDetails?: {
      clientDescription: string;
      services: string[];
      finalDeliverable: string;
    };
    aboutUs: string;
    pricing: PricingSection;
    timeline: {
      phases: TimelinePhase[];
    };
    terms: string;
    signatures: {
      agency: { name: string; email: string; signatureData?: string };
      client: {
        name: string;
        email: string;
        signatureData?: string;  // Base64 data URL of signature
        signedAt?: string;       // ISO timestamp
        signedDocUrl?: string;   // URL to signed PDF (DocuSeal)
      };
    };
  };
}

interface ProposalTemplate {
  id: string;
  name: string;
  createdAt: string;
  data: Proposal['data'];  // Reusable proposal structure
}
```

### Module Structure

```
src/app/modules/proposal/
├── page.tsx                    # Main proposal module entry
├── settings/
│   └── page.tsx               # Template management settings
├── components/
│   ├── Dashboard.tsx          # Proposal list view
│   ├── ProposalEditor.tsx     # Create/edit proposals
│   ├── ProposalViewer.tsx     # Read-only proposal view
│   ├── ProposalCard.tsx       # Individual proposal card
│   ├── RichTextEditor.tsx     # Rich text editing component
│   ├── SignatureSection.tsx   # Electronic signature capture
│   ├── LivePreview.tsx        # Real-time preview panel
│   └── ...
├── services/
│   ├── ProposalService.ts     # Proposal CRUD operations
│   └── TemplateService.ts     # Template management
├── types/
│   └── Proposal.ts            # TypeScript type definitions
└── utils/
    └── proposalUtils.ts       # Helper functions (pricing, dates)
```

---

## Key Features & Workflows

### 1. Proposal Dashboard

**Location**: `src/app/modules/proposal/components/Dashboard.tsx`

Team-wide view of all proposals with filtering and actions.

**Features**:
- **Statistics Cards**: Total proposals, draft count, approved count, revenue metrics
- **Status Filter**: View all, drafts, sent, approved, or rejected proposals
- **Search**: Filter by client name or proposal title
- **Quick Actions**: View, Edit, Share, Delete
- **Template Library**: Create proposals from pre-saved templates

**Components**:
- `ProposalCard` - Individual proposal card with status badge
- `StatisticsCards` - KPI dashboard at the top
- `EmptyState` - Onboarding UI when no proposals exist

---

### 2. Proposal Editor

**Location**: `src/app/modules/proposal/components/ProposalEditor.tsx`

Full-featured editor with live preview and template support.

#### Sections:

##### **Header**
- Client name and agency selector
- Proposal title
- Hero image upload
- Status selector (draft, sent, approved, rejected)

##### **Overview**
- Rich text overview description
- Client description
- Services offered (multi-select from template snippets)
- Final deliverable description

##### **About Us**
- Rich text agency description
- Select from pre-saved templates or write custom

##### **Pricing**
- Add/remove pricing items
- Item name, price, and description (rich text)
- Automatic total calculation
- Visual pricing table preview

##### **Timeline**
- Add/remove project phases
- Phase title, description, duration, dates
- Dependency tracking (phases can depend on previous phases)
- Visual timeline rendering

##### **Terms & Conditions**
- Rich text terms editor
- Select from pre-saved templates or write custom
- Legal clauses and payment terms

##### **Signatures**
- Agency signature (name, email)
- Client signature placeholder
- Electronic signature capture (when client signs)

**Key Features**:
- **Live Preview**: Side-by-side editor and preview
- **Auto-save**: Drafts saved automatically
- **Template System**: Save current proposal as template
- **Rich Text Support**: Full formatting for key sections
- **Image Upload**: Hero banner and inline images

---

### 3. Proposal Viewer

**Location**: `src/app/modules/proposal/components/ProposalViewer.tsx`

Read-only, beautifully formatted proposal view for client presentation.

**Features**:
- **Clean Layout**: Professional, print-ready design
- **Signature Section**: Electronic signature capture for clients
- **PDF Export**: Generate PDF for download
- **Public Access**: Shareable URL (no login required)
- **Status Tracking**: Shows approval status and signature timestamp

**Workflow**:
1. Agency creates and finalizes proposal
2. Agency shares public URL with client
3. Client reviews proposal via `/view/:proposalId`
4. Client signs electronically
5. Status auto-updates to "approved"
6. Agency receives email notification

---

### 4. Template Management

**Location**: `src/app/modules/proposal/settings/page.tsx`

Centralized management of reusable proposal content.

#### Template Types:

| Template Type | Description | Editor Component |
|--------------|-------------|------------------|
| **About Us** | Agency descriptions | `RichItemEditor` |
| **Terms** | Terms & conditions clauses | `RichItemEditor` |
| **Titles** | Common proposal titles | `SimpleListEditor` |
| **Agencies** | Agency details (name, email, address) | `AgencyEditor` |
| **Services** | Service offerings with descriptions | `KeyValueEditor` |
| **Deliverables** | Final deliverable templates | `RichItemEditor` |
| **Team Access** | Module access control (admin only) | `TeamAccessEditor` |

**Features**:
- **Reusable Content**: Save common content blocks for reuse
- **Rich Text Support**: Full formatting for templates
- **Version Control**: Track template creation dates
- **Team-wide Access**: All users share the same templates
- **Admin-only Access Control**: Manage who can access proposals module

---

### 5. Sharing & Collaboration

**Public Sharing Workflow**:

1. **Create Share Link**:
   ```typescript
   await proposalService.createShareLink(proposalId);
   // Returns: https://app.activeset.co/view/proposal-123
   ```

2. **Public Access**:
   - Proposal copied to `shared_proposals` collection
   - Public URL accessible without authentication
   - Client can view and sign

3. **Signature Capture**:
   - Client draws signature on canvas
   - Signature saved as base64 data URL
   - Timestamp recorded
   - Email notification sent to agency

4. **Status Updates**:
   - Auto-updates to "approved" on signature
   - Syncs to both `proposals` and `shared_proposals` collections

---

## Component Hierarchy

```
ProposalPage (page.tsx)
├── Dashboard View
│   ├── StatisticsCards
│   ├── Filter & Search
│   ├── Proposal Grid
│   │   └── ProposalCard (for each proposal)
│   │       ├── Status Badge
│   │       ├── Metadata (client, date, total)
│   │       └── Actions (View, Edit, Share, Delete)
│   └── Template Library
│       └── Template Cards
└── Editor View
    ├── ProposalEditor
    │   ├── Header Section
    │   ├── Overview Section
    │   │   └── RichTextEditor
    │   ├── About Us Section
    │   │   └── RichTextEditor
    │   ├── Pricing Section
    │   │   └── Pricing Item List
    │   ├── Timeline Section
    │   │   └── Phase Editor
    │   ├── Terms Section
    │   │   └── RichTextEditor
    │   └── Signatures Section
    └── LivePreview
        └── ProposalViewer (read-only)
```

---

## Technical Specifications

### Service Layer

**Location**: `src/app/modules/proposal/services/ProposalService.ts`

```typescript
class ProposalService {
  // Proposal CRUD
  async getProposals(): Promise<Proposal[]>
  async getProposalById(id: string): Promise<Proposal | null>
  async createProposal(proposal: Omit<Proposal, 'id'>, user: User): Promise<Proposal>
  async updateProposal(id: string, data: Partial<Proposal>): Promise<Proposal>
  async deleteProposal(id: string): Promise<void>

  // Sharing
  async createShareLink(proposalId: string): Promise<string>
  async getSharedProposal(token: string): Promise<Proposal>
  async getPublicProposal(id: string): Promise<Proposal>

  // Signatures
  async signProposal(id: string, signatureData: string): Promise<Proposal>
}

export const proposalService = new ProposalService();
```

**Location**: `src/app/modules/proposal/services/TemplateService.ts`

```typescript
class TemplateService {
  // Template CRUD
  async getTemplates(): Promise<ProposalTemplate[]>
  async saveTemplate(name: string, data: Proposal['data']): Promise<void>
  async updateTemplate(id: string, name: string, data: Proposal['data']): Promise<void>
  async deleteTemplate(id: string): Promise<void>
}

export const templateService = new TemplateService();
```

### Data Flow

1. **Create Proposal**:
   ```typescript
   const proposal = await proposalService.createProposal(proposalData, user);
   // Saves to Firestore 'proposals' collection
   // Also syncs to 'shared_proposals' for public access
   ```

2. **Share Proposal**:
   ```typescript
   const shareUrl = await proposalService.createShareLink(proposalId);
   // Copies to 'shared_proposals' collection
   // Returns public URL
   // URL copied to clipboard automatically
   ```

3. **Sign Proposal**:
   ```typescript
   await proposalService.signProposal(proposalId, signatureDataUrl);
   // Updates status to 'approved'
   // Records timestamp
   // Sends email notification to agency
   ```

4. **Template Reuse**:
   ```typescript
   const templates = await templateService.getTemplates();
   // User selects template from dashboard
   // Proposal pre-filled with template data
   ```

---

## Firestore Collections

### `proposals`

Primary collection for team proposals (requires authentication).

```json
{
  "id": "proposal-123",
  "createdBy": {
    "uid": "user-456",
    "email": "john@activeset.co",
    "displayName": "John Doe"
  },
  "title": "Website Redesign Proposal",
  "clientName": "Acme Corp",
  "agencyName": "ActiveSet",
  "status": "sent",
  "createdAt": "2026-01-01T12:00:00Z",
  "updatedAt": "2026-01-02T09:30:00Z",
  "data": {
    "overview": "<p>We propose a complete website redesign...</p>",
    "pricing": {
      "items": [
        { "name": "Design", "price": "$5000", "description": "UI/UX design" }
      ],
      "total": "$5000"
    },
    "timeline": {
      "phases": [
        {
          "title": "Discovery",
          "description": "Research and planning",
          "duration": "2 weeks",
          "startDate": "2026-01-15",
          "endDate": "2026-01-29"
        }
      ]
    },
    "signatures": {
      "agency": { "name": "John Doe", "email": "john@activeset.co" },
      "client": {
        "name": "Jane Smith",
        "email": "jane@acme.com",
        "signatureData": "data:image/png;base64,...",
        "signedAt": "2026-01-03T14:20:00Z"
      }
    }
  }
}
```

### `shared_proposals`

Public collection for client access (no authentication required).

- Same structure as `proposals`
- Additional `sharedAt` timestamp
- Accessible via `/view/:proposalId` route
- Updated when proposal is shared or signed

### `proposal_templates`

Reusable proposal templates.

```json
{
  "id": "template-789",
  "name": "Standard Web Design",
  "createdAt": "2025-12-01T10:00:00Z",
  "data": {
    "overview": "<p>Template overview...</p>",
    "aboutUs": "<p>ActiveSet is a...</p>",
    "pricing": { /* ... */ },
    "timeline": { /* ... */ },
    "terms": "<p>Payment terms...</p>"
  }
}
```

### `configurations`

Stores template content for proposal settings page.

```json
{
  "about_us": {
    "items": [
      { "id": "1", "title": "Standard", "content": "<p>...</p>" }
    ]
  },
  "terms": {
    "items": [
      { "id": "1", "title": "Standard Terms", "content": "<p>...</p>" }
    ]
  },
  "agencies": {
    "items": [
      { "id": "1", "name": "ActiveSet", "email": "hello@activeset.co" }
    ]
  },
  "services": {
    "items": [
      { "key": "web-design", "value": "Website design and development" }
    ]
  }
}
```

---

## Access Control

- **Authentication**: Firebase Auth (Google Sign-In only)
- **Email Restriction**: Only `@activeset.co` emails can create/edit
- **Module Access**: Controlled via `access_control` collection
- **Public Viewing**: Shared proposals accessible without auth
- **Admin**: `rehan@activeset.co` (can manage team access)

**Hook**: `useModuleAccess('proposal')`

---

## UI/UX Patterns

### Real-time Preview
- Editor and viewer displayed side-by-side
- Changes reflect immediately in preview
- Responsive design (preview collapses on mobile)

### Status Badges
- Color-coded status indicators:
  - **Draft**: Gray
  - **Sent**: Blue
  - **Approved**: Green
  - **Rejected**: Red

### Rich Text Editing
- Powered by custom `RichTextEditor` component
- Supports: Bold, Italic, Lists, Links, Headings
- Clean, distraction-free interface

### Signature Capture
- Canvas-based signature drawing
- Touch and mouse support
- Clear and redraw functionality
- Base64 export for storage

### Template Picker
- Visual template cards in dashboard
- One-click to create proposal from template
- Shows template name and creation date

---

## Common Operations

### Creating a Proposal

```typescript
import { proposalService } from '@/app/modules/proposal/services/ProposalService';
import { useAuth } from '@/hooks/useAuth';

const { user } = useAuth();

const newProposal = await proposalService.createProposal({
  title: 'Website Redesign',
  clientName: 'Acme Corp',
  agencyName: 'ActiveSet',
  status: 'draft',
  data: {
    overview: '...',
    pricing: { items: [], total: '$0' },
    timeline: { phases: [] },
    // ... other fields
  }
}, user);
```

### Sharing a Proposal

```typescript
const shareUrl = await proposalService.createShareLink(proposalId);
// URL automatically copied to clipboard
// Returns: https://app.activeset.co/view/proposal-123
```

### Signing a Proposal (Client)

```typescript
// Client draws signature on canvas
const signatureDataUrl = canvas.toDataURL('image/png');

await proposalService.signProposal(proposalId, signatureDataUrl);
// Status updates to 'approved'
// Email sent to agency
```

### Creating from Template

```typescript
const templates = await templateService.getTemplates();
const selectedTemplate = templates[0];

const newProposal = {
  id: '',
  title: '',
  clientName: '',
  agencyName: 'ActiveSet',
  status: 'draft',
  data: { ...selectedTemplate.data }  // Pre-fill from template
};
```

### Saving as Template

```typescript
await templateService.saveTemplate('Standard Web Design', proposal.data);
```

---

## Integration Points

### Email Notifications

**Endpoint**: `/api/send-notification`

Sends email when client signs a proposal.

**Payload**:
```json
{
  "type": "proposal-signed",
  "proposalId": "proposal-123",
  "proposalTitle": "Website Redesign",
  "clientName": "Acme Corp",
  "agencyEmail": "john@activeset.co",
  "signedAt": "2026-01-03T14:20:00Z"
}
```

**Email Template**:
- Subject: "Proposal Signed: {proposalTitle}"
- Body: Client name, signature timestamp, view link

### Settings Module Integration

Uses shared settings components from `src/app/modules/settings/`:

- `SimpleListEditor` - For proposal titles
- `RichItemEditor` - For about us, terms, deliverables
- `KeyValueEditor` - For service snippets
- `AgencyEditor` - For agency information
- `TeamAccessEditor` - For module access control

See [Settings Module](./settings.md) for component details.

---

## Environment Variables

```bash
# Firebase (required)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Email notifications (optional)
GMAIL_USER
GMAIL_APP_PASSWORD
NOTIFY_EMAIL
```

---

## Known Limitations

1. **Team-wide Proposals**: All proposals visible to all team members (no user-specific filtering)
2. **No Version History**: Edits overwrite previous versions
3. **Single Signature**: Only client signature supported (not multi-party)
4. **No PDF Generation**: Viewer is web-only (no built-in PDF export yet)
5. **Hero Image Storage**: Images stored as data URLs (no CDN integration)

---

## Extension Points

> [!TIP]
> When extending the Proposal module, consider these files:

| Task | Files to Modify |
|------|----------------|
| Add new proposal field | `types/Proposal.ts` → `Proposal` interface, `ProposalEditor.tsx` → Add section |
| Add new template type | `settings/page.tsx` → Add tab, create editor component |
| Customize proposal layout | `ProposalViewer.tsx` → Modify rendering logic |
| Add PDF export | `ProposalViewer.tsx` → Integrate PDF library (e.g., jsPDF) |
| Add new signature method | `SignatureSection.tsx` → Implement alternative capture method |
| Customize email template | `/api/send-notification` → Modify email body |

---

## Related Features

- **Settings Module**: [settings.md](./settings.md) - Reusable configuration editors
- **Template Management**: Settings page for managing proposal templates
- **Access Control**: Team access management via `access_control` collection
