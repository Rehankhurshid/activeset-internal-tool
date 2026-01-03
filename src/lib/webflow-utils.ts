export function formatForDisplay(text: string | null | undefined): string {
    if (!text) return '';
    // Webflow returns variables like {{wf {"path":"slug","type":"PlainText"} }}
    // We want to display them as {{slug}}
    return text
        .replace(/\{\{wf \{&quot;path&quot;:&quot;([^&]+)&quot;[^}]+\} \}\}/g, '{{$1}}')
        .replace(/\{\{wf \{"path":"([^"]+)","type":"[^"]+"\} \}\}/g, '{{$1}}');
}
