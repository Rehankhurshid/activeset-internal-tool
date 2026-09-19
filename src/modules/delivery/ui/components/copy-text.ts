/**
 * Puts text on the clipboard, and says whether it got there.
 *
 * `navigator.clipboard` is not always available: it is absent on an insecure
 * origin, and some mobile browsers refuse it outside a user gesture they
 * recognise. The textarea fallback is deprecated and still the only thing that
 * works in those cases. A caller that gets `false` has to show the text so it
 * can be copied by hand — silently doing nothing is how someone ends up pasting
 * yesterday's clipboard to a client.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
}
