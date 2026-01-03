# Technical Implementation Notes

## Architecture Overview

The Project Links Widget is built as a full-stack application with embeddable components, designed for scalability and real-time collaboration.

### Tech Stack Rationale

#### Framework: Next.js 14 with App Router

- **SSR/SSG Support**: Optimized performance for dashboard pages
- **API Routes**: Built-in backend for additional endpoints if needed
- **File-based Routing**: Simple structure for embed pages
- **React Server Components**: Reduced bundle size where possible

#### UI Library: Shadcn UI + Tailwind CSS

- **Component Consistency**: Pre-built, accessible components
- **Customizable**: Easy theming and style overrides
- **Dark Theme**: Built-in support for dark mode
- **Developer Experience**: Excellent TypeScript support

#### Drag & Drop: @dnd-kit

**Why @dnd-kit over alternatives:**

- **Accessibility**: Built-in keyboard navigation and screen reader support
- **Touch Support**: Works seamlessly on mobile devices
- **Performance**: Optimized for 60fps animations
- **Framework Agnostic**: Not tied to React internals
- **Type Safety**: Excellent TypeScript support

**Alternative considered:**

- `react-beautiful-dnd`: Less accessible, mobile issues
- `react-sortable-hoc`: Outdated, accessibility concerns

#### Database: Firebase Firestore

**Why Firebase over alternatives:**

- **Real-time Sync**: Built-in `onSnapshot()` listeners
- **Offline Support**: Automatic caching and sync
- **Scalability**: Serverless, auto-scaling
- **Security Rules**: Declarative access control
- **Authentication Integration**: Seamless with Firebase Auth

**Real-time implementation:**

```typescript
// Real-time subscription pattern
const unsubscribe = onSnapshot(
  query(collection(db, "projects"), where("userId", "==", userId)),
  (snapshot) => {
    const projects = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(projects);
  }
);
```

## Authentication Strategy

### Email Domain Restriction

- **Client-side validation**: Immediate feedback for users
- **Server-side enforcement**: Firebase Auth rules and Firestore security
- **Domain validation pattern**: `.*@activeset\.co$`

### Security Rules Example

```javascript
// Firestore security rules
rules_version = '2';
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

## Embedding Architecture

### Multiple Embedding Methods

#### 1. Script Tag (Recommended)

- **Flexibility**: Full JavaScript API control
- **Configuration**: Runtime configuration changes
- **Events**: Can listen to widget events
- **Size**: Larger initial payload

#### 2. iFrame

- **Isolation**: Complete style and script isolation
- **Security**: Sandboxed execution
- **Cross-origin**: Works across domains
- **Limitations**: Less programmatic control

#### 3. Data Attributes

- **Simplicity**: Declarative configuration
- **Auto-initialization**: No JavaScript knowledge required
- **Static**: Configuration set at page load

### Style Isolation Strategy

```css
/* Widget isolation */
.project-links-widget {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.project-links-widget * {
  box-sizing: border-box;
}
```

**Techniques used:**

- CSS `all: initial` to reset inherited styles
- Scoped class names for widget components
- CSS-in-JS consideration for future versions

## Mobile Responsiveness

### Adaptive UI Patterns

```typescript
// Mobile detection
const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
  const checkMobile = () => {
    setIsMobile(window.innerWidth < 768);
  };
  checkMobile();
  window.addEventListener("resize", checkMobile);
  return () => window.removeEventListener("resize", checkMobile);
}, []);
```

### Mobile-Specific Behavior

- **Modal disabled**: Direct link opening on mobile
- **Touch-friendly**: Larger touch targets
- **Drag & Drop**: Optimized for touch interactions with @dnd-kit

## Performance Optimizations

### Bundle Optimization

- **Code Splitting**: Separate bundles for dashboard vs embed
- **Tree Shaking**: Unused code elimination
- **Dynamic Imports**: Load components on demand

### Real-time Sync Optimization

- **Debounced Updates**: Prevent excessive API calls
- **Optimistic UI**: Immediate feedback with rollback on error
- **Connection Management**: Automatic reconnection handling

```typescript
// Optimistic update pattern
const handleDragEnd = async (event: DragEndEvent) => {
  // Immediate UI update
  const newLinks = arrayMove(sortedLinks, oldIndex, newIndex);
  setSortedLinks(newLinks);

  try {
    // Sync with database
    await projectsService.updateProjectLinks(projectId, newLinks);
  } catch (error) {
    // Rollback on error
    setSortedLinks(sortedLinks);
    console.error("Failed to update:", error);
  }
};
```

## Database Schema Design

### Project Document Structure

```typescript
interface Project {
  id: string; // Auto-generated document ID
  name: string; // Project display name
  userId: string; // Owner's Firebase UID
  links: ProjectLink[]; // Embedded link array
  createdAt: Date; // Creation timestamp
  updatedAt: Date; // Last modification timestamp
}

interface ProjectLink {
  id: string; // Unique link identifier
  title: string; // Display title
  url: string; // Target URL
  order: number; // Sort order (0-based)
  isDefault?: boolean; // System-generated link flag
}
```

### Design Decisions

- **Embedded Links**: Links stored as array in project document

  - **Pro**: Single read/write for project + links
  - **Pro**: Atomic updates with transactions
  - **Con**: Document size limits (1MB)
  - **Justification**: Projects typically have <50 links

- **User-based Partitioning**: Projects filtered by userId
  - **Security**: User can only access own projects
  - **Performance**: Smaller query result sets
  - **Scalability**: Horizontal scaling by user

## Error Handling Strategy

### Layered Error Handling

1. **UI Level**: User-friendly error messages
2. **Service Level**: Retry logic and fallbacks
3. **Network Level**: Connection state management
4. **Database Level**: Transaction rollbacks

### Example Implementation

```typescript
export const useAuth = () => {
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      const result = await signInWithPopup(auth, googleProvider);

      if (!result.user.email?.endsWith("@activeset.co")) {
        await signOut(auth);
        setError("Only @activeset.co email addresses are allowed.");
        return;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sign in";
      setError(errorMessage);
    }
  };
};
```

## Future Enhancement Considerations

### Scalability Improvements

- **CDN Distribution**: Widget script via global CDN
- **Caching Layer**: Redis for frequently accessed projects
- **Database Sharding**: User-based sharding for large scale

### Feature Extensions

- **Presence Indicators**: Show online collaborators
- **Link Analytics**: Click tracking and statistics
- **Webhook Support**: External integrations
- **API Access**: REST API for programmatic access

### Security Enhancements

- **CSP Headers**: Content Security Policy for embed pages
- **Rate Limiting**: API call limits per user
- **Audit Logging**: Track all modifications
- **Backup Strategy**: Automated data backups

## Development Workflow

### Code Quality Tools

- **TypeScript**: Compile-time type checking
- **ESLint**: Code linting and style enforcement
- **Prettier**: Code formatting consistency

### Testing Strategy (Future)

- **Unit Tests**: Component and service testing
- **Integration Tests**: Database and API testing
- **E2E Tests**: Full user workflow testing
- **Visual Regression**: UI consistency testing

### Deployment Pipeline

- **Environment Variables**: Secure config management
- **Build Optimization**: Bundle analysis and optimization
- **Health Checks**: Service monitoring and alerting

This architecture provides a solid foundation for a scalable, real-time collaborative widget while maintaining simplicity for end users.
