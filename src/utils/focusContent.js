// HashRouter owns the URL fragment; skip links must move focus without replacing it.
export function focusContent(event, id) {
  event.preventDefault();
  const content = document.getElementById(id);
  if (content) {
    content.focus();
    content.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }
}
