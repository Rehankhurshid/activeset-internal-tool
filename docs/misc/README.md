# Project Links Widget

An embeddable JavaScript widget for managing and displaying project links with real-time collaboration, built with Next.js, Shadcn UI, Firebase, and dnd-kit.

## ✨ Features

- **🔐 Authentication**: Google OAuth with @activeset.co email restriction
- **📱 Real-time Sync**: Live updates using Firebase Firestore
- **🎯 Drag & Drop**: Reorderable links with dnd-kit
- **📂 Project Management**: Create, rename, delete projects
- **🔗 Link Management**: Add unlimited custom links with default placeholders
- **📱 Responsive**: Modal on desktop, direct links on mobile
- **🎨 Dark Theme**: Sleek UI with Shadcn components
- **📦 Embeddable**: Script tag or iframe integration
- **🔒 Style Isolation**: Shadow DOM for embed safety

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Firebase project with Firestore and Authentication enabled

### Installation

1. Clone and install dependencies:

```bash
git clone <repository-url>
cd project-links-widget
npm install
```

2. Set up Firebase:

   - Create a Firebase project at https://console.firebase.google.com
   - Enable Google Authentication
   - Enable Firestore Database
   - Copy your Firebase config

3. Environment setup:

```bash
# Create .env.local file
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCkws6mLQwypnSZmkREy92vsp00YKVdKLs
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=project-list-5aead.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=project-list-5aead
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=project-list-5aead.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=107892075896
NEXT_PUBLIC_FIREBASE_APP_ID=1:107892075896:web:47fdbfe78953ab8d222c8d
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-7WL72JV8D8
```

4. Run the development server:

```bash
npm run dev
```

5. Open http://localhost:3000 to access the dashboard

## 📦 Embedding the Widget

### ⭐ Method 1: Script-Only (Simplest - No DIV Required!)

Just add the script with data attributes - the widget automatically injects itself:

```html
<!-- Widget automatically appears here -->
<script
  src="https://your-domain.com/widget.js"
  data-auto-inject="true"
  data-project-id="your-project-id"
  data-theme="dark"
  data-show-modal="true"
></script>
```

#### Script-Only with Static Links (No Database)

Perfect for static websites:

```html
<script
  src="https://your-domain.com/widget.js"
  data-initial-links='[{"title":"Documentation","url":"https://docs.example.com"},{"title":"GitHub","url":"https://github.com/yourproject"}]'
  data-theme="dark"
></script>
```

### Method 2: JavaScript API (Programmatic)

For dynamic control and custom integration:

```html
<div id="my-project-widget"></div>

<script src="https://your-domain.com/widget.js"></script>
<script>
  embedProjectLinksWidget("my-project-widget", {
    projectId: "your-project-id",
    theme: "dark",
    showModal: true,
  });
</script>
```

### Method 3: Data Attributes (Declarative)

When you want a specific container:

```html
<div
  data-project-links-widget
  data-project-id="your-project-id"
  data-theme="dark"
  data-show-modal="true"
></div>

<script src="https://your-domain.com/widget.js"></script>
```

### Method 4: iFrame

Direct iframe embedding:

```html
<iframe
  src="https://your-domain.com/embed?projectId=your-project-id&theme=dark"
  width="100%"
  height="400"
  frameborder="0"
>
</iframe>
```

## ⚙️ Configuration Options

### Script Data Attributes

| Attribute            | Type              | Default   | Description                             |
| -------------------- | ----------------- | --------- | --------------------------------------- |
| `data-auto-inject`   | boolean           | false     | Auto-inject widget at script location   |
| `data-project-id`    | string            | undefined | Firebase project ID for real-time sync  |
| `data-initial-links` | JSON string       | undefined | Static links (alternative to projectId) |
| `data-theme`         | 'dark' \| 'light' | 'dark'    | Widget theme                            |
| `data-show-modal`    | boolean           | true      | Enable modal preview on desktop         |

### JavaScript API Options

| Option            | Type              | Default       | Description                             |
| ----------------- | ----------------- | ------------- | --------------------------------------- |
| `projectId`       | string            | undefined     | Firebase project ID for real-time sync  |
| `initialLinks`    | array             | undefined     | Static links (alternative to projectId) |
| `theme`           | 'dark' \| 'light' | 'dark'        | Widget theme                            |
| `showModal`       | boolean           | true          | Enable modal preview on desktop         |
| `allowReordering` | boolean           | true          | Enable drag & drop (dashboard only)     |
| `baseUrl`         | string            | auto-detected | Base URL for iframe embedding           |

### Initial Links Format

```javascript
{
  initialLinks: [
    {
      title: "Link Title",
      url: "https://example.com",
    },
    // ... more links
  ];
}
```

## 🛠️ Development

### Project Structure

```
src/
├── app/                 # Next.js app directory
│   ├── embed/          # Embed page for iframe
│   └── page.tsx        # Main dashboard
├── components/         # React components
│   ├── auth/           # Authentication components
│   ├── dashboard/      # Dashboard components
│   ├── projects/       # Project management components
│   └── ui/             # Shadcn UI components
├── hooks/              # Custom React hooks
├── lib/                # Utilities and configurations
├── services/           # Database services
├── types/              # TypeScript type definitions
└── widget/             # Embeddable widget components

public/
└── widget.js           # Standalone widget script
```

### Key Technologies

- **Framework**: Next.js 14 with App Router
- **UI Library**: Shadcn UI + Tailwind CSS
- **Drag & Drop**: @dnd-kit (dndkit.com)
- **Database**: Firebase Firestore with real-time listeners
- **Authentication**: Firebase Auth with Google provider
- **Styling**: Tailwind CSS with dark theme

### Real-time Sync Implementation

The widget uses Firebase Firestore's `onSnapshot()` listeners for real-time updates:

```typescript
// Subscribe to project changes
const unsubscribe = projectsService.subscribeToProject(
  projectId,
  (updatedProject) => {
    setProject(updatedProject);
    setLinks(updatedProject.links.sort((a, b) => a.order - b.order));
  }
);

// Clean up subscription
return () => unsubscribe();
```

### Drag & Drop with dnd-kit

Links are reorderable using dnd-kit's sortable components:

```typescript
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

// Handle drag end event
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  if (active.id !== over?.id) {
    // Reorder and save to database
    const newLinks = arrayMove(sortedLinks, oldIndex, newIndex);
    await projectsService.updateProjectLinks(projectId, newLinks);
  }
};
```

## 🔒 Security Features

- **Email Domain Restriction**: Only @activeset.co emails allowed
- **Style Isolation**: Widget styles don't interfere with parent page
- **Firestore Security Rules**: User-based data access control
- **CSP Friendly**: No inline scripts in widget

### Firestore Security Rules

```javascript
// rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read, write: if request.auth != null
        && request.auth.token.email.matches('.*@activeset\\.co$')
        && resource.data.userId == request.auth.uid;
    }
  }
}
```

## 📱 Mobile Behavior

- **Desktop**: Links show modal preview + external link button
- **Mobile**: Links open directly in new tab (no modal icon)
- **Responsive**: Grid layout adapts to screen size

## 🚀 Deployment

### Production Build

```bash
npm run build
npm start
```

### Environment Variables

Update the `baseUrl` in `public/widget.js` for production:

```javascript
const defaultConfig = {
  baseUrl: "https://your-production-domain.com",
};
```

### Hosting Recommendations

- **Vercel**: Optimized for Next.js
- **Netlify**: Great for static sites
- **Firebase Hosting**: Integrated with Firebase backend

## 🎯 Use Cases

1. **Project Dashboards**: Embed in project management tools
2. **Team Portals**: Quick access to project resources
3. **Client Presentations**: Show project links in proposals
4. **Documentation**: Link to project assets and tools
5. **Status Pages**: Display project health and links

## 🔄 Real-time Collaboration Features

- **Instant Updates**: Changes appear immediately for all users
- **Optimistic UI**: Immediate feedback with error handling
- **Conflict Resolution**: Last-write-wins with Firebase timestamps
- **Presence Indicators**: (Optional) Show online users

## 📞 Support & Contributing

For issues and feature requests, please create an issue in the repository.

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

Built with ❤️ using Next.js, Firebase, Shadcn UI, and dnd-kit.
