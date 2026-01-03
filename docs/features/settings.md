# Settings Module - Reusable Configuration Editors

The Settings module provides a collection of reusable, purpose-built editor components for managing application-wide configuration data. These components are used across the application (especially in the Proposal module) to provide consistent, user-friendly interfaces for editing different types of structured data.

## Core Architecture

### Module Structure

```
src/app/modules/settings/
└── components/
    ├── SimpleListEditor.tsx      # String list editor with drag-and-drop
    ├── RichItemEditor.tsx        # Master-detail editor for rich text templates
    ├── KeyValueEditor.tsx        # Key-value pair editor with rich text values
    ├── AgencyEditor.tsx          # Agency profile editor with signature capture
    └── TeamAccessEditor.tsx      # Module access control (admin only)
```

### Data Storage

All settings are stored in the Firestore `configurations` collection:

```typescript
// Firestore structure
configurations/
├── about_us          # Rich text templates (ConfigurationItem[])
├── terms             # Terms & conditions templates (ConfigurationItem[])
├── titles            # Simple string list
├── agencies          # Agency profiles with signatures (AgencyProfile[])
├── services          # Service snippets (key-value pairs)
├── deliverables      # Final deliverable templates (ConfigurationItem[])
└── access_control    # Module access permissions (ModuleAccess)
```

---

## Component Reference

### 1. SimpleListEditor

**Purpose**: Edit ordered lists of simple strings with drag-and-drop reordering.

**Location**: `src/app/modules/settings/components/SimpleListEditor.tsx`

**Use Cases**:
- Proposal titles
- Tag lists
- Category names
- Any simple string array

**Features**:
- ✅ Drag-and-drop reordering (via @dnd-kit)
- ✅ Add/remove items
- ✅ Inline editing
- ✅ Auto-save to Firestore
- ✅ Empty item filtering on save

**Props**:
```typescript
interface SimpleListEditorProps {
  title: string;        // Display title
  docId: string;        // Firestore document ID
  initialItems: string[]; // Initial string array
}
```

**Example Usage**:
```tsx
<SimpleListEditor
  title="Proposal Titles"
  docId="titles"
  initialItems={configs.titles}
/>
```

**Data Structure**:
```json
// configurations/titles
{
  "items": [
    "Website Redesign Proposal",
    "SEO Audit & Strategy",
    "Webflow Development Package"
  ]
}
```

---

### 2. RichItemEditor

**Purpose**: Master-detail interface for editing rich text templates with metadata.

**Location**: `src/app/modules/settings/components/RichItemEditor.tsx`

**Use Cases**:
- About Us templates
- Terms & Conditions
- Final Deliverables
- Any labeled rich text content

**Features**:
- ✅ Split-pane UI (list + detail view)
- ✅ Rich text editor integration
- ✅ Drag-and-drop reordering
- ✅ Label and ID editing
- ✅ Visual selection state
- ✅ Auto-select first item

**Props**:
```typescript
interface RichItemEditorProps {
  title: string;              // Display title
  docId: string;              // Firestore document ID
  initialItems: ConfigurationItem[];
}

interface ConfigurationItem {
  id: string;      // Unique identifier
  label: string;   // Display name in dropdowns
  text: string;    // Rich text content (HTML)
}
```

**Example Usage**:
```tsx
<RichItemEditor
  title="About Us Templates"
  docId="about_us"
  initialItems={configs.aboutUs}
/>
```

**Data Structure**:
```json
// configurations/about_us
{
  "items": [
    {
      "id": "standard",
      "label": "Standard Agency Bio",
      "text": "<p>ActiveSet is a digital agency...</p>"
    },
    {
      "id": "technical",
      "label": "Technical Focus",
      "text": "<p>We specialize in complex web applications...</p>"
    }
  ]
}
```

**UI Layout**:
```
┌─────────────────────────────────────────────┐
│ Left Column (1/3)    │ Right Column (2/3)   │
├──────────────────────┼──────────────────────┤
│ ✅ Standard          │ Label: [Standard]    │
│ □ Technical          │ ID: [standard]       │
│ □ Creative           │                      │
│                      │ [Rich Text Editor]   │
│ [+ Add Template]     │                      │
└──────────────────────┴──────────────────────┘
```

---

### 3. KeyValueEditor

**Purpose**: Edit key-value pairs where values are rich text descriptions.

**Location**: `src/app/modules/settings/components/KeyValueEditor.tsx`

**Use Cases**:
- Service offerings with descriptions
- Configuration options
- Feature explanations
- Any mapping of IDs to rich text

**Features**:
- ✅ Master-detail interface (no drag-and-drop)
- ✅ Unique key validation
- ✅ Rich text value editing
- ✅ Duplicate key detection
- ✅ Preview truncation in list

**Props**:
```typescript
interface KeyValueEditorProps {
  title: string;
  docId: string;
  initialItems: { [key: string]: string };
}
```

**Example Usage**:
```tsx
<KeyValueEditor
  title="Service Snippets"
  docId="services"
  initialItems={configs.serviceSnippets}
/>
```

**Data Structure**:
```json
// configurations/services
{
  "items": {
    "web-design": "<p>Custom website design and branding...</p>",
    "webflow-dev": "<p>Webflow development and CMS setup...</p>",
    "seo": "<p>SEO audit, strategy, and implementation...</p>"
  }
}
```

**UI Layout**:
```
┌─────────────────────────────────────────────┐
│ Left Column (1/3)    │ Right Column (2/3)   │
├──────────────────────┼──────────────────────┤
│ ✅ web-design        │ Key: [web-design]    │
│    Custom website... │                      │
│ □ webflow-dev        │ [Rich Text Editor]   │
│    Webflow dev...    │                      │
│ □ seo                │                      │
│    SEO audit...      │                      │
│                      │                      │
│ [+ Add Item]         │                      │
└──────────────────────┴──────────────────────┘
```

---

### 4. AgencyEditor

**Purpose**: Manage agency representative profiles with electronic signature capture.

**Location**: `src/app/modules/settings/components/AgencyEditor.tsx`

**Use Cases**:
- Agency representative profiles
- Proposal signatories
- Team member signatures

**Features**:
- ✅ Drag-and-drop reordering
- ✅ Name and email fields
- ✅ Electronic signature capture (draw or type)
- ✅ Signature preview
- ✅ Multiple signature fonts (Dancing Script, Great Vibes, etc.)
- ✅ Canvas-based drawing with touch/mouse support
- ✅ Signature data stored as base64 PNG

**Props**:
```typescript
interface AgencyEditorProps {
  initialItems: AgencyProfile[];
}

interface AgencyProfile {
  id: string;
  name: string;
  email: string;
  signatureData?: string; // Base64 data URL
}
```

**Example Usage**:
```tsx
<AgencyEditor initialItems={configs.agencies} />
```

**Data Structure**:
```json
// configurations/agencies
{
  "items": [
    {
      "id": "rep-1",
      "name": "John Doe",
      "email": "john@activeset.co",
      "signatureData": "data:image/png;base64,iVBORw0KG..."
    }
  ]
}
```

**Signature Capture UI**:
```
┌──────────────────────────────────────┐
│ Create Signature                     │
├──────────────────────────────────────┤
│ [Draw] [Type]                        │
├──────────────────────────────────────┤
│ Draw Tab:                            │
│ ┌────────────────────────────────┐   │
│ │ [Signature Canvas]             │   │
│ │                                │   │
│ │                    [Clear]     │   │
│ └────────────────────────────────┘   │
│                                      │
│ Type Tab:                            │
│ Name: [Your Name]                    │
│ Fonts: [Dancing] [Vibes] [Allura]   │
│ Preview: [Signature Preview]         │
├──────────────────────────────────────┤
│ [Cancel] [Save Signature]            │
└──────────────────────────────────────┘
```

**Signature Methods**:

1. **Draw Mode**:
   - Canvas-based signature pad
   - Touch and mouse support
   - Clear and redraw
   - Exports as PNG data URL

2. **Type Mode**:
   - Text input with cursive font preview
   - 5 signature fonts available
   - Converts text to image using canvas
   - Same data URL format as drawn signatures

---

### 5. TeamAccessEditor

**Purpose**: Manage module access permissions for team members (admin only).

**Location**: `src/app/modules/settings/components/TeamAccessEditor.tsx`

**Use Cases**:
- Restricting module access by email
- Team permission management
- Feature gating

**Features**:
- ✅ Module selector dropdown
- ✅ Add/remove user emails
- ✅ Admin badge display
- ✅ Email validation
- ✅ Admin protection (cannot remove admin)
- ✅ Real-time user count

**Props**:
```typescript
interface TeamAccessEditorProps {
  isAdmin: boolean; // Only admins can edit
}
```

**Example Usage**:
```tsx
<TeamAccessEditor isAdmin={isAdmin} />
```

**Data Structure**:
```json
// configurations/access_control or access_control collection
{
  "modules": {
    "proposal": ["rehan@activeset.co", "john@activeset.co"],
    "project-links": ["rehan@activeset.co", "jane@activeset.co"]
  }
}
```

**Supported Modules**:
- `proposal` - Proposals module
- `project-links` - Project Links module

**Admin User**: `rehan@activeset.co` (hardcoded in `AccessControlService`)

**UI Layout**:
```
┌─────────────────────────────────────┐
│ Module Access Control               │
├─────────────────────────────────────┤
│ Module: [Proposals ▼]               │
│                                     │
│ Email: [________________] [+]       │
│                                     │
│ ✅ rehan@activeset.co [Admin]       │
│ ✅ john@activeset.co       [×]      │
│ ✅ jane@activeset.co       [×]      │
│                                     │
│ 3 user(s) with access to Proposals  │
└─────────────────────────────────────┘
```

---

## Common Patterns

### Drag-and-Drop Implementation

All editor components (except KeyValueEditor and TeamAccessEditor) use [@dnd-kit](https://dndkit.com/) for reordering:

```typescript
import { DndContext, closestCenter, PointerSensor, useSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';

const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor)
);

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (active.id !== over?.id) {
    setItems((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over?.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }
};
```

### Firestore Persistence

All editors follow the same save pattern:

```typescript
const handleSave = async () => {
  setLoading(true);
  try {
    await updateDoc(doc(db, 'configurations', docId), {
      items: processedItems
    });
    toast.success('Saved successfully!');
  } catch (error) {
    toast.error('Failed to save');
  } finally {
    setLoading(false);
  }
};
```

### Master-Detail Layout

RichItemEditor and KeyValueEditor use a consistent split-pane pattern:

```tsx
<div className="flex h-full gap-6">
  {/* Left: Master list (1/3 width) */}
  <div className="w-1/3 min-w-[300px]">
    <Card>
      <CardHeader>
        <h3>{title}</h3>
        <Button onClick={handleSave}>Save</Button>
      </CardHeader>
      <CardContent>
        {/* Item list */}
        <Button onClick={handleAdd}>Add New</Button>
      </CardContent>
    </Card>
  </div>

  {/* Right: Detail editor (2/3 width) */}
  <div className="flex-grow">
    <Card>
      {/* Selected item editor */}
    </Card>
  </div>
</div>
```

---

## Integration with Proposal Module

The Settings components are primarily used in the **Proposal Settings Page**:

**Location**: `src/app/modules/proposal/settings/page.tsx`

**Tabs**:
| Tab | Component | Configuration Doc |
|-----|-----------|------------------|
| About Us | `RichItemEditor` | `about_us` |
| Terms | `RichItemEditor` | `terms` |
| Titles | `SimpleListEditor` | `titles` |
| Agencies | `AgencyEditor` | `agencies` |
| Services | `KeyValueEditor` | `services` |
| Deliverables | `RichItemEditor` | `deliverables` |
| Team Access | `TeamAccessEditor` | `access_control` (admin only) |

**Usage Example**:
```tsx
<Tabs defaultValue="about_us">
  <TabsList>
    <TabsTrigger value="about_us">About Us</TabsTrigger>
    <TabsTrigger value="terms">Terms</TabsTrigger>
    {/* ... */}
  </TabsList>

  <TabsContent value="about_us">
    <RichItemEditor
      title="About Us Templates"
      docId="about_us"
      initialItems={configs.aboutUs}
    />
  </TabsContent>

  {/* ... */}
</Tabs>
```

---

## Data Loading Hook

**Location**: `src/hooks/useConfigurations.ts`

Provides centralized configuration loading:

```typescript
const configs = useConfigurations();

// Available data:
configs.aboutUs        // ConfigurationItem[]
configs.terms          // ConfigurationItem[]
configs.titles         // string[]
configs.agencies       // AgencyProfile[]
configs.serviceSnippets // { [key: string]: string }
configs.deliverables   // ConfigurationItem[]
configs.loading        // boolean
configs.error          // string | null
```

---

## Access Control Service

**Location**: `src/services/AccessControlService.ts`

Manages module permissions:

```typescript
export const accessControlService = {
  // Get all module access data
  async getModuleAccess(): Promise<ModuleAccess>

  // Check if user has access to a module
  async hasModuleAccess(userEmail: string, module: RestrictedModule): Promise<boolean>

  // Add user to module
  async addModuleAccess(email: string, module: RestrictedModule): Promise<void>

  // Remove user from module
  async removeModuleAccess(email: string, module: RestrictedModule): Promise<void>

  // Check if user is admin
  isAdmin(email: string): boolean
};

// Restricted modules
export const RESTRICTED_MODULES = ['proposal', 'project-links'] as const;

// Admin user
const ADMIN_EMAIL = 'rehan@activeset.co';
```

---

## Styling & UI Patterns

### Visual Selection State

Master-detail editors use color-coded selection:

```tsx
className={`
  ${isSelected
    ? 'bg-primary/5 border-primary shadow-sm text-primary'
    : 'bg-card hover:bg-accent/50 hover:border-primary/30'
  }
`}
```

### Drag Handle Styling

Consistent grip icon for drag-and-drop:

```tsx
<div className="cursor-grab text-muted-foreground hover:text-foreground">
  <GripVertical className="h-4 w-4" />
</div>
```

### Empty State

Consistent empty state messaging:

```tsx
<div className="text-center text-muted-foreground">
  <p className="text-lg font-medium">No items yet</p>
  <p className="text-sm">Click "Add New" to get started</p>
</div>
```

---

## Extension Points

### Creating a New Editor Component

Follow this pattern for consistency:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

interface MyEditorProps {
  title: string;
  docId: string;
  initialItems: YourDataType[];
}

export const MyEditor = ({ title, docId, initialItems }: MyEditorProps) => {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'configurations', docId), { items });
      toast.success(`${title} saved!`);
    } catch (err) {
      toast.error('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3>{title}</h3>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </CardHeader>
      <CardContent>
        {/* Your editor UI */}
      </CardContent>
    </Card>
  );
};
```

### Adding to Proposal Settings

```tsx
// In proposal/settings/page.tsx
import { MyEditor } from '@/app/modules/settings/components/MyEditor';

<TabsTrigger value="my_section">My Section</TabsTrigger>
<TabsContent value="my_section">
  <MyEditor
    title="My Configuration"
    docId="my_config"
    initialItems={configs.myConfig}
  />
</TabsContent>
```

---

## Dependencies

```json
{
  "@dnd-kit/core": "Drag and drop core functionality",
  "@dnd-kit/sortable": "Sortable list implementation",
  "react-signature-canvas": "Signature capture for AgencyEditor",
  "@fontsource/*": "Signature fonts (Dancing Script, Great Vibes, etc.)",
  "firebase/firestore": "Data persistence",
  "sonner": "Toast notifications"
}
```

---

## Related Features

- **Proposal Module**: [proposal.md](./proposal.md) - Primary consumer of settings
- **Access Control**: Team member permissions and module gating
- **Rich Text Editor**: Shared component for formatted content

---

## Best Practices

1. **Consistent Save Pattern**: Always use loading states and toast notifications
2. **Data Validation**: Validate before saving (e.g., duplicate keys, empty values)
3. **Empty Filtering**: Remove empty items on save to keep data clean
4. **Auto-selection**: Select first item automatically in master-detail views
5. **Graceful Degradation**: Show empty states when no items exist
6. **Admin Protection**: Never allow removal of admin users from access control
7. **Unique IDs**: Always generate unique IDs for new items (avoid collisions)

---

## Troubleshooting

### Items not saving
- Check Firestore security rules
- Verify document ID matches configurations collection
- Check browser console for errors

### Drag-and-drop not working
- Ensure items have unique `id` field
- Verify `@dnd-kit` sensors are configured
- Check that items are wrapped in `SortableContext`

### Signature not capturing
- For touch devices, ensure canvas is accessible
- Check that signature fonts are loaded (`@fontsource`)
- Verify canvas dimensions are non-zero

### Access control not working
- Confirm user email matches exactly (case-sensitive)
- Check `access_control` collection exists
- Verify admin email is `rehan@activeset.co`
