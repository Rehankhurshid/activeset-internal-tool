# Proposal Generator & Management

The Proposal module provides a comprehensive system for creating, managing, and sharing professional client proposals with built-in templates, AI-powered content generation, electronic signatures, commenting system, version history, and public sharing capabilities.

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
  // Edit locking - prevents changes after signature
  isLocked?: boolean;
  lockedAt?: string;
  lockedReason?: 'signed' | 'archived';
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

interface PricingSection {
  currency?: string; // Currency code (e.g., 'USD', 'EUR', 'GBP')
  items: PricingItem[];
  total: string; // Auto-calculated from items
}

interface PricingItem {
  name: string;
  price: string; // Numeric value only (currency handled separately)
  description?: string; // Rich text support
}

interface ProposalComment {
  id: string;
  proposalId: string;
  sectionId: ProposalSectionId;
  authorName: string;
  authorEmail: string;
  authorType: 'agency' | 'client';
  content: string;
  createdAt: string;
  resolved?: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  parentId?: string; // For threaded replies
}

interface ProposalEdit {
  id: string;
  proposalId: string;
  timestamp: string;
  editorName: string;
  editorEmail: string;
  sectionChanged: ProposalSectionId;
  changeType: 'create' | 'update' | 'status_change' | 'signed';
  summary: string;
  changes?: FieldChange[]; // Detailed field-level changes
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
│   ├── RichTextEditor.tsx     # Rich text editing component (Lexical-based)
│   ├── SignatureSection.tsx   # Electronic signature capture
│   ├── LivePreview.tsx        # Real-time preview panel
│   ├── CommentSidebar.tsx     # Comment system sidebar
│   ├── CommentThread.tsx      # Individual comment thread
│   ├── HistoryPanel.tsx       # Version history panel
│   └── LoadingScreen.tsx      # Loading states
├── services/
│   ├── ProposalService.ts     # Proposal CRUD operations
│   ├── TemplateService.ts     # Template management
│   ├── CommentService.ts      # Comment CRUD and real-time updates
│   └── HistoryService.ts      # Version history tracking
├── types/
│   └── Proposal.ts            # TypeScript type definitions
└── api/
    └── ai-gen/
        ├── route.ts           # Full proposal AI generation
        └── ai-gen-block/
            └── route.ts       # Block-level AI generation
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
- **Currency Selector**: Choose from USD, EUR, GBP, CAD, AUD, JPY, CHF, INR
- **Number-Only Price Input**: Enter numeric values only (currency symbol displayed separately)
- **Automatic Total Calculation**: Total auto-calculates from sum of all items
- **Read-Only Total**: Displays formatted total with currency symbol
- Add/remove pricing items
- Item name, price (numeric), and description (rich text)
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
- **Rich Text Support**: Full formatting for key sections (Lexical-based editor)
- **Image Upload**: Hero banner and inline images
- **AI Content Generation**: 
  - Full proposal generation from meeting notes
  - Block-level AI editing for Timeline, Pricing, Client Description, Final Deliverable
  - Optimized prompts for each block type
- **Collapsible Sections**: About Us and Hero Image collapsed by default
- **Section Navigation**: Quick jump to any section
- **Version History**: Track all changes with detailed field-level diffs
- **Comment System**: Google Docs-style inline comments on sections

---

### 3. Proposal Viewer

**Location**: `src/app/modules/proposal/components/ProposalViewer.tsx`

Read-only, beautifully formatted proposal view for client presentation.

**Features**:
- **Clean Layout**: Professional, print-ready design
- **Signature Section**: Electronic signature capture for clients
- **Public Access**: Shareable URL (no login required)
- **Status Tracking**: Shows approval status and signature timestamp
- **Comment System**: Add comments to specific sections (visible to both agency and client)
- **Bullet Point Conversion**: Automatically converts plain text bullets (•) to proper HTML lists
- **Responsive Design**: Optimized for all screen sizes

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
    │   │   ├── AI Fill Button
    │   │   ├── History Button
    │   │   └── Save/Cancel Actions
    │   ├── Hero Image Section (collapsed by default)
    │   ├── Basic Info Section
    │   ├── Overview Section
    │   │   ├── Client Description (with AI Edit)
    │   │   ├── Services (drag-and-drop)
    │   │   └── Final Deliverable (with AI Edit)
    │   ├── About Us Section (collapsed by default)
    │   │   └── RichTextEditor
    │   ├── Pricing Section
    │   │   ├── Currency Selector
    │   │   ├── Pricing Items (with AI Edit)
    │   │   └── Auto-Calculated Total
    │   ├── Timeline Section
    │   │   ├── Phase Editor (with AI Edit)
    │   │   └── Gantt Chart Visualization
    │   ├── Terms Section
    │   │   └── RichTextEditor
    │   ├── Signatures Section
    │   └── Comment Sidebar
    │       └── CommentThread (for each comment)
    └── LivePreview
        └── ProposalViewer (read-only)
            ├── Comment Buttons (per section)
            └── Share/Email Actions
```

### RichTextEditor Component

**Location**: `src/app/modules/proposal/components/RichTextEditor.tsx`

Lexical-based rich text editor with clean, input-matching styling.

**Features**:
- **Lexical Framework**: Modern, extensible editor framework
- **Formatting Options**: Bold, Italic, Underline, Strikethrough, Code
- **Block Types**: Headings (H1-H3), Paragraphs, Quotes, Code blocks
- **Lists**: Ordered and unordered lists with proper HTML rendering
- **Links**: Auto-link detection and manual link insertion
- **Markdown Shortcuts**: Type markdown syntax for quick formatting
- **HTML Import/Export**: Seamless HTML persistence
- **Simple Mode**: Simplified toolbar for inline editing
- **Bullet Conversion**: Automatically converts plain text bullets (•) to HTML lists

**Styling**:
- Matches input field appearance for consistency
- Transparent background
- Border matching form inputs
- Minimal height (no forced minimum)
- Clean toolbar with hover states

---

### 6. AI Content Generation

**Location**: `/api/ai-gen/route.ts` and `/api/ai-gen-block/route.ts`

AI-powered content generation using Google Gemini API.

#### Full Proposal Generation

**Endpoint**: `POST /api/ai-gen`

Generates complete proposal from meeting notes.

**Input**:
- Meeting notes/brief
- Client name
- Agency name
- Client website (optional)
- Project deadline (optional)
- Project budget (optional)

**Output**: Complete proposal structure including:
- Title
- Overview
- Client description
- Services
- Final deliverable
- About Us template selection
- Pricing items with budget distribution
- Timeline phases with dates

#### Block-Level AI Generation

**Endpoint**: `POST /api/ai-gen-block`

Generates optimized content for specific blocks.

**Supported Blocks**:
1. **Timeline**: Generates project phases with realistic dates and durations
2. **Pricing**: Generates pricing items with budget distribution
3. **Client Description**: Generates professional client/company description
4. **Final Deliverable**: Generates clear deliverable description

**Features**:
- Context-aware prompts optimized for each block type
- Uses current proposal data for context
- Respects project deadlines and budgets
- Currency-aware pricing generation

---

### 7. Comment System

**Location**: `src/app/modules/proposal/services/CommentService.ts`

Google Docs-style commenting system for proposals.

**Features**:
- **Section-Specific Comments**: Add comments to Overview, About Us, Pricing, Timeline, Terms, or Signatures
- **Threaded Replies**: Reply to comments to create discussion threads
- **Resolve/Reopen**: Mark comments as resolved and reopen when needed
- **Real-Time Updates**: Live comment sync using Firestore subscriptions
- **Author Tracking**: Track who made each comment (agency vs client)
- **Comment Count Badges**: Display unresolved comment counts

**Components**:
- `CommentSidebar` - Main comment interface
- `CommentThread` - Individual comment thread display

**Firestore Collection**: `proposal_comments`

---

### 8. Version History

**Location**: `src/app/modules/proposal/services/HistoryService.ts`

Comprehensive version history tracking for proposals.

**Features**:
- **Field-Level Tracking**: Records detailed changes to specific fields
- **Section-Based Organization**: Group changes by proposal section
- **Change Types**: Create, Update, Status Change, Signed
- **Editor Tracking**: Records who made each change
- **Relative Time Display**: Shows "2h ago", "3d ago", etc.
- **Summary Generation**: Auto-generates human-readable change summaries

**Components**:
- `HistoryPanel` - History viewer with filtering

**Firestore Collection**: `proposal_history`

---

---

### 9. PDF Generation & Download

**Location**: `src/app/modules/proposal/components/ProposalViewer.tsx` (Download Button)

Server-side high-fidelity PDF generation that matches the browser view.

**Features**:
- **High Fidelity**: Uses Puppeteer to render the proposal exactly as seen in the browser
- **Modern CSS Support**: Fully supports Tailwind 4, CSS variables, and modern color functions (`oklch`)
- **Smart Layout**:
  - **Clean Output**: Automatically removes UI-specific elements (buttons, comments, shadows) via `@media print`
  - **Background Control**: Forces white background to eliminate dark theme artifacts
  - **Page Break Optimization**: Prevents abrupt cuts in pricing tables and timeline phases
- **Conditional Signing Block**:
  - **Unsigned**: Hides the signature section to provide a clean review copy
  - **Signed**: Includes the "Proposal Approved" section with the client's signature and timestamp

**Workflow**:
1. User clicks "Download PDF" in the Proposal Viewer header
2. Request sent to `/api/generate-pdf` with the proposal ID
3. Server launches Puppeteer to render the public view URL
4. Puppeteer emulates `print` media to apply print-specific styles
5. PDF generated and streamed back to the client for download

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
  
  // Locking
  async lockProposal(id: string, reason: 'signed' | 'archived'): Promise<void>
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

**Location**: `src/app/modules/proposal/services/CommentService.ts`

```typescript
class CommentService {
  async getComments(proposalId: string): Promise<ProposalComment[]>
  async getCommentsBySection(proposalId: string, sectionId: ProposalSectionId): Promise<ProposalComment[]>
  async addComment(comment: Omit<ProposalComment, 'id' | 'createdAt'>): Promise<ProposalComment>
  async replyToComment(parentComment: ProposalComment, replyContent: string, ...): Promise<ProposalComment>
  async resolveComment(commentId: string, resolverEmail: string): Promise<void>
  async reopenComment(commentId: string): Promise<void>
  async deleteComment(commentId: string): Promise<void>
  subscribeToComments(proposalId: string, callback: (comments: ProposalComment[]) => void): Unsubscribe
  buildCommentThreads(comments: ProposalComment[]): ProposalComment[][]
}

export const commentService = new CommentService();
```

**Location**: `src/app/modules/proposal/services/HistoryService.ts`

```typescript
class HistoryService {
  async getHistory(proposalId: string, limit?: number): Promise<ProposalEdit[]>
  async recordEdit(edit: Omit<ProposalEdit, 'id'>): Promise<ProposalEdit>
  async recordCreation(proposalId: string, proposalTitle: string, ...): Promise<ProposalEdit>
  async recordDetailedUpdate(proposalId: string, sectionId: ProposalSectionId, changes: FieldChange[], ...): Promise<ProposalEdit>
  async recordStatusChange(proposalId: string, oldStatus: string, newStatus: string, ...): Promise<ProposalEdit>
  async recordSigned(proposalId: string, clientName: string, clientEmail: string): Promise<ProposalEdit>
  formatRelativeTime(timestamp: string): string
}

export const historyService = new HistoryService();
```

**Location**: `src/services/ScreenshotService.ts`

```typescript
class ScreenshotService {
  // Existing screenshot methods...
  
  // PDF Generation
  async capturePdf(url: string, filename: string): Promise<Buffer>
  // Uses Puppeteer to render URL with print media emulation
}
export const screenshotService = new ScreenshotService();
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
  "isLocked": false,
  "data": {
    "overview": "<p>We propose a complete website redesign...</p>",
    "overviewDetails": {
      "clientDescription": "Acme Corp is a leading...",
      "services": ["Website Design", "Webflow Development"],
      "finalDeliverable": "A fully functional website..."
    },
    "pricing": {
      "currency": "USD",
      "items": [
        { "name": "Design", "price": "5000", "description": "UI/UX design" }
      ],
      "total": "$5,000"
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

### `proposal_comments`

Comments and discussions on proposals.

```json
{
  "id": "comment-123",
  "proposalId": "proposal-123",
  "sectionId": "pricing",
  "authorName": "John Doe",
  "authorEmail": "john@activeset.co",
  "authorType": "agency",
  "content": "Should we adjust the pricing for Phase 2?",
  "createdAt": "2026-01-02T10:00:00Z",
  "resolved": false,
  "parentId": null
}
```

### `proposal_history`

Version history and change tracking.

```json
{
  "id": "edit-123",
  "proposalId": "proposal-123",
  "timestamp": "2026-01-02T10:00:00Z",
  "editorName": "John Doe",
  "editorEmail": "john@activeset.co",
  "sectionChanged": "pricing",
  "changeType": "update",
  "summary": "Updated pricing total: $5,000 → $6,000",
  "changes": [
    {
      "field": "data.pricing.total",
      "oldValue": "$5,000",
      "newValue": "$6,000"
    }
  ]
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
- **Local Development**: Authentication bypassed on localhost/127.0.0.1 for easier development

**Hooks**: 
- `useAuth()` - Authentication state and user info
- `useModuleAccess('proposal')` - Module access checking

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
- Powered by Lexical-based `RichTextEditor` component
- Supports: Bold, Italic, Underline, Strikethrough, Lists, Links, Headings, Quotes, Code blocks
- Clean, distraction-free interface matching input field styling
- Inline formatting toolbar
- Markdown shortcuts support
- HTML import/export for persistence

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
    pricing: { 
      currency: 'USD',
      items: [], 
      total: '$0' 
    },
    timeline: { phases: [] },
    // ... other fields
  }
}, user);
```

### Using AI to Generate Content

```typescript
// Full proposal generation
const response = await fetch('/api/ai-gen', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    meetingNotes: 'Client wants website redesign...',
    clientName: 'Acme Corp',
    agencyName: 'ActiveSet',
    clientWebsite: 'https://acme.com',
    projectDeadline: '2026-03-01',
    projectBudget: '$10,000'
  })
});

// Block-level generation
const blockResponse = await fetch('/api/ai-gen-block', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    blockType: 'timeline', // or 'pricing', 'clientDescription', 'finalDeliverable'
    notes: 'Project needs 4 phases...',
    clientName: 'Acme Corp',
    projectDeadline: '2026-03-01',
    currentData: { /* current proposal data */ }
  })
});
```

### Adding Comments

```typescript
import { commentService } from '@/app/modules/proposal/services/CommentService';

// Add a comment
await commentService.addComment({
  proposalId: 'proposal-123',
  sectionId: 'pricing',
  authorName: 'John Doe',
  authorEmail: 'john@activeset.co',
  authorType: 'agency',
  content: 'Should we adjust this pricing?'
});

// Reply to a comment
await commentService.replyToComment(
  parentComment,
  'Good point, let me review',
  'Jane Smith',
  'jane@activeset.co',
  'agency'
);

// Subscribe to real-time updates
const unsubscribe = commentService.subscribeToComments(
  'proposal-123',
  (comments) => {
    console.log('Comments updated:', comments);
  }
);
```

### Tracking History

```typescript
import { historyService } from '@/app/modules/proposal/services/HistoryService';

// Record detailed update
await historyService.recordDetailedUpdate(
  'proposal-123',
  'pricing',
  'John Doe',
  'john@activeset.co',
  [
    {
      field: 'data.pricing.total',
      oldValue: '$5,000',
      newValue: '$6,000'
    }
  ]
);

// Get history
const history = await historyService.getHistory('proposal-123', 50);
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

## Content Processing

### Bullet Point Conversion

**Location**: `ProposalViewer.tsx` - `convertBulletsToHtmlLists()` function

Automatically converts plain text bullet points to proper HTML list structures.

**Problem**: Some content contains plain text bullets like:
```
• <p>Website Design: ...</p>
• <p>Webflow Development: ...</p>
```

**Solution**: Converts to proper HTML:
```html
<ul>
  <li><p>Website Design: ...</p></li>
  <li><p>Webflow Development: ...</p></li>
</ul>
```

**Applied To**: Overview, About Us, and Terms sections

**CSS Styling**: Ensures bullets appear inline with text, not on separate lines

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

### AI Content Generation

**Endpoints**: 
- `/api/ai-gen` - Full proposal generation
- `/api/ai-gen-block` - Block-level generation

**Model**: Google Gemini Flash (via `@google/genai` SDK)

**Configuration**: Requires `GEMINI_API_KEY` environment variable

**Response Format**: JSON with structured proposal data

### Settings Module Integration

Uses shared settings components from `src/app/modules/settings/`:

- `SimpleListEditor` - For proposal titles
- `RichItemEditor` - For about us, terms, deliverables
- `KeyValueEditor` - For service snippets
- `AgencyEditor` - For agency information
- `TeamAccessEditor` - For module access control

See [Settings Module](./settings.md) for component details.

---

## API Endpoints

### AI Content Generation

**Full Proposal Generation**: `POST /api/ai-gen`
- Generates complete proposal from meeting notes
- Uses Google Gemini Flash model
- Returns structured JSON with all proposal sections

**Block-Level Generation**: `POST /api/ai-gen-block`
- Generates optimized content for specific blocks
- Supports: timeline, pricing, clientDescription, finalDeliverable
- Context-aware with current proposal data

### Email Notifications

**Send Notification**: `POST /api/send-notification`
- Sends email when proposal is signed
- Uses Nodemailer with Gmail
- Supports proposal-signed event type

### PDF Generation

**Generate PDF**: `GET /api/generate-pdf?proposalId={id}`
- Generates PDF for a specific proposal
- Uses Puppeteer with print media emulation
- Returns `application/pdf` stream

## Environment Variables

```bash
# Firebase (required)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# AI Generation (required for AI features)
GEMINI_API_KEY

# Email notifications (optional)
GMAIL_USER
GMAIL_APP_PASSWORD
NOTIFY_EMAIL
```

---

## Known Limitations

1. **Team-wide Proposals**: All proposals visible to all team members (no user-specific filtering)
2. **Single Signature**: Only client signature supported (not multi-party)
3. **Hero Image Storage**: Images stored as data URLs (no CDN integration)

---

## Extension Points

> [!TIP]
> When extending the Proposal module, consider these files:

| Task | Files to Modify |
|------|----------------|
| Add new proposal field | `types/Proposal.ts` → `Proposal` interface, `ProposalEditor.tsx` → Add section |
| Add new template type | `settings/page.tsx` → Add tab, create editor component |
| Customize proposal layout | `ProposalViewer.tsx` → Modify rendering logic |
| Add new signature method | `SignatureSection.tsx` → Implement alternative capture method |
| Customize email template | `/api/send-notification` → Modify email body |
| Add new AI block type | `/api/ai-gen-block/route.ts` → Add new block type and prompt |
| Customize AI prompts | `/api/ai-gen/route.ts` and `/api/ai-gen-block/route.ts` → Modify system prompts |
| Add new currency | `ProposalEditor.tsx` → Update currency selector and `getCurrencySymbol()` function |
| Extend comment system | `CommentService.ts` → Add new comment features, `CommentSidebar.tsx` → Update UI |
| Customize history tracking | `HistoryService.ts` → Add new change types or tracking logic |

---

## Recent Updates

### AI Content Generation
- **Full Proposal AI**: Generate complete proposals from meeting notes
- **Block-Level AI**: Targeted AI editing for Timeline, Pricing, Client Description, and Final Deliverable
- **Optimized Prompts**: Each block type has specialized prompts for better results
- **Context Awareness**: AI uses current proposal data and project constraints

### Pricing Improvements
- **Currency Selector**: Choose from 8 major currencies (USD, EUR, GBP, CAD, AUD, JPY, CHF, INR)
- **Number-Only Input**: Clean numeric input with currency symbol displayed separately
- **Auto-Calculated Total**: Total automatically updates when items change
- **Read-Only Total**: Prevents manual errors, ensures accuracy

### Collaboration Features
- **Comment System**: Google Docs-style inline comments on proposal sections
- **Version History**: Comprehensive change tracking with field-level diffs
- **Real-Time Updates**: Live comment sync using Firestore subscriptions

### PDF Export
- **Server-Side Generation**: Robust PDF generation using Puppeteer
- **Print Optimization**: Dedicated `@media print` styles for clean layout
- **Smart Page Breaks**: Content-aware breakpoints for pricing and lists
- **Signature Handling**: Conditionally includes/excludes signature block based on status
- **Visual Fidelity**: Pixel-perfect rendering matching the web view

### UI/UX Improvements
- **Default Collapsed Sections**: About Us and Hero Image collapsed by default for cleaner interface
- **RichTextEditor Styling**: Matches input field styling for consistency
- **Bullet Point Conversion**: Automatically converts plain text bullets to proper HTML lists
- **Local Development**: Authentication bypassed on localhost for easier development

## Related Features

- **Settings Module**: [settings.md](./settings.md) - Reusable configuration editors
- **Template Management**: Settings page for managing proposal templates
- **Access Control**: Team access management via `access_control` collection
