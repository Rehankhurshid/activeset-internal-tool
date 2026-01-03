# Webflow Pages Management & SEO

The Webflow Pages feature provides a comprehensive dashboard for auditing, managing, and optimizing the SEO of your Webflow site's pages directly from the widget. It bridges the gap between Webflow's native capabilities and advanced SEO workflows, offering features like bulk editing, AI generation, and granular health analysis.

## Core Architecture

### Data Model & Health Analysis
The system enhances standard Webflow page data with a Quality Control (QC) layer.

- **`WebflowPageWithQC`**: Extends the native Webflow page object.
    - **`seoHealth`**: A computed score (0-100) and status ('good' | 'warning' | 'critical').
    - **`issues`**: An array of specific problems (e.g., "SEO title is too short", "Missing Meta Description").
- **Scoring Logic**:
    - **Missing Fields**: heavily penalized (-25 points).
    - **Length Violations**: penalize based on severity (too short/long).
    - **Open Graph**: Checks for missing titles/descriptions unless they are set to "Same as SEO".

### Component Structure
The feature is built on a modular architecture to ensure consistency and maintainability.

1.  **`WebflowPagesDashboard`**: The main controller. Handles data fetching, locale switching, and displays the sortable/filterable table view.
2.  **`SEOVariableRenderer`**: A specialized component that parses raw CMS variables (e.g., `{{wf ...}}`) and renders them as styled UI chips (e.g., `{{name}}`), ensuring a clean and user-friendly display in lists and tooltips.
3.  **`WebflowSEOEditor`**: The slide-over panel for single-page edits. It intelligently switches between standard input fields for static pages and variable-aware inputs for CMS templates.
4.  **`WebflowBulkSEOEditor`**: A spreadsheet-like interface for mass updates. It structurally separates "Static Pages" from "CMS Templates" to prevent accidental structural changes to templates.
5.  **`WebflowSEOInput`**: A custom Lexical-based rich text editor used for CMS fields. It supports typing plain text mixed with dynamic variables (chips), solving the complexity of editing abstract CMS patterns.

---

## Key Features & Workflows

### 1. Pages Dashboard (Table View)
A compact, content-focused table view of all your Webflow pages.

- **Visual Variable Rendering**: CMS variables are automatically parsed and displayed as purple chips (e.g., `{{title}}`), removing the clutter of raw JSON codes.
- **Smart Tooltips**: Long content is truncated for cleanliness but fully accessible via hover tooltips, which also support the chip rendering.
- **SEO Quick View**: Hover over the **Page Name** to see a comprehensive card with SEO Metadata, Open Graph details, and a list of health issues.
- **Status Indicators**:
    - `Live` / `Draft` / `Archived` badges.
    - `CMS` badge for collection templates.
    - `📁` icon for nested folders.

### 2. Single Page SEO Editor
A dedicated environment for fine-tuning page metadata.

- **Context-Aware Inputs**:
    - **Static Pages**: Standard text inputs.
    - **CMS Templates**: Advanced `WebflowSEOInput` that allows inserting dynamic variables from the collection schema.
- **Open Graph Integration**: 
    - Toggle "Same as SEO" to inherit values.
    - Fully editable Open Graph fields with variable support for CMS pages.
- **Real-time Validation**: Input fields show character counts and color-coded limits (Yellow/Green) based on SEO best practices.
- **AI Generation**: Analyzes page content to generate optimized Title and Description tags (Static pages only).

### 3. Bulk SEO Editor
Designed for high-volume management.

- **Structured Layout**: Clearly separates **Static Pages** from **CMS Templates** to ensure workflow clarity.
- **Bulk AI Generation**: Generate metadata for hundreds of pages at once.
- **Safety Locks**: 
    - **Page Locking**: Click the 🔓 lock icon to prevent specific pages from being overwritten by AI or bulk actions.
    - **Field Diffing**: The system only sends changed fields to the Webflow API, preventing errors on read-only fields (like slugs for Utility pages).

### 4. localization & Multi-language 🌍
Native support for Webflow Localization.

- **Locale Switching**: The dashboard header features a dropdown to switch between "Primary" and "Secondary" locales.
- **Context Preservation**: All editors (Single and Bulk) automatically respect the currently selected locale, ensuring edits are applied to the correct version of the page.
- **Scoped Data**: SEO health scores and issue tracking are calculated independently for each locale.

### 5. Advanced Developer Tools 🛠️
- **Custom Domain Support**: Configure a custom domain in Settings to override default `webflow.io` preview links.
- **Copy DOM**: Instant access to the raw DOM structure of any page via the code (`< >`) icon, useful for debugging structure or content issues.

---

## Technical Specifications

### Variables & Parsing
Webflow stores CMS variables in a complex internal format:
`{{wf {"path":"slug","type":"PlainText"} }}`

Our system implements a standardized parsing layer:
- **`formatForDisplay`**: A utility that transforms internal codes into human-readable `{{slug}}` format.
- **`SEOVariableRenderer`**: A React component that takes this formatted string and renders it visually, treating `{{...}}` blocks as distinct UI elements (chips).

### Data Synchronization
- **API Strategy**: We use the Webflow v2 API.
- **Optimistic UI**: The UI updates immediately on save, while background validators confirm the changes.
- **Error Handling**: Detailed error messaging for API failures (e.g., rate limits, invalid tokens).

### Performance Guidelines
- **Pagination**: The dashboard handles large sites efficiently by virtualizing lists where necessary (future roadmap).
- **Caching**: Page data is cached to minimize API calls, with a manual "Refresh" trigger available to fetch the latest state from Webflow.
