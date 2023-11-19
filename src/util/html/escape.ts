export function textToHtml (text: string): string {
  const paragraphs = text.split('\n\n');
  const safeParagraphs = paragraphs.map(paragraph => {
    const lines = paragraph.split('\n');
    const safeLines = lines.map(escapeHtml);
    return safeLines.join('<br />');
  });
  return `<p>${safeParagraphs.join('</p><p>')}</p>`;
}

export function escapeHtml (text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
