import { marked } from "marked";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { DocumentContentType } from "@/types/document";

/**
 * Client-Side Zero-Knowledge Document Exporter
 * SyncDocs guarantees servers NEVER receive document plaintext.
 * All formatting, conversions, and file generations occur strictly in-browser.
 */

export interface ExportOption {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  description: string;
}

export function getExportOptionsForType(contentType: DocumentContentType): ExportOption[] {
  switch (contentType) {
    case "rich_text":
      return [
        {
          id: "pdf",
          name: "Portable Document Format",
          extension: "pdf",
          mimeType: "application/pdf",
          description: "Client-side rendered vector PDF document",
        },
        {
          id: "markdown",
          name: "Markdown Document",
          extension: "md",
          mimeType: "text/markdown",
          description: "GitHub-flavored markdown source file",
        },
        {
          id: "html",
          name: "HTML Document",
          extension: "html",
          mimeType: "text/html",
          description: "Self-contained HTML file with typographic styles",
        },
        {
          id: "txt",
          name: "Plain Text",
          extension: "txt",
          mimeType: "text/plain",
          description: "Raw unformatted plaintext representation",
        },
      ];
    case "markdown":
      return [
        {
          id: "markdown",
          name: "Markdown Source",
          extension: "md",
          mimeType: "text/markdown",
          description: "Standard .md markdown source file",
        },
        {
          id: "pdf",
          name: "Rendered PDF",
          extension: "pdf",
          mimeType: "application/pdf",
          description: "Client-side rendered vector PDF from markdown",
        },
        {
          id: "html",
          name: "HTML Page",
          extension: "html",
          mimeType: "text/html",
          description: "Rendered HTML page with GitHub-flavored styling",
        },
        {
          id: "txt",
          name: "Plain Text",
          extension: "txt",
          mimeType: "text/plain",
          description: "Plain text with markdown tags stripped",
        },
      ];
    case "latex":
      return [
        {
          id: "tex",
          name: "LaTeX Source File",
          extension: "tex",
          mimeType: "application/x-tex",
          description: "Zero-knowledge .tex source file",
        },
        {
          id: "pdf",
          name: "Compiled PDF",
          extension: "pdf",
          mimeType: "application/pdf",
          description: "Client-compiled PDF document",
        },
        {
          id: "txt",
          name: "Plain Source",
          extension: "txt",
          mimeType: "text/plain",
          description: "Raw unformatted text source",
        },
      ];
    default:
      return [
        {
          id: "txt",
          name: "Plain Text",
          extension: "txt",
          mimeType: "text/plain",
          description: "Plain text export",
        },
      ];
  }
}

/**
 * Converts a Tiptap JSON node structure into plain text
 */
export function tiptapToPlainText(node: any): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (!node.content || !Array.isArray(node.content)) return "";

  const childText = node.content.map(tiptapToPlainText).join("");

  if (node.type === "paragraph" || node.type === "heading") {
    return childText + "\n\n";
  }
  if (node.type === "listItem") {
    return "- " + childText + "\n";
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return childText + "\n";
  }
  return childText;
}

/**
 * Converts a Tiptap JSON node structure into Markdown
 */
export function tiptapToMarkdown(node: any): string {
  if (!node) return "";

  // Text leaf node with formatting marks
  if (node.type === "text") {
    let text = node.text || "";
    if (node.marks && Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type === "bold") text = `**${text}**`;
        if (mark.type === "italic") text = `*${text}*`;
        if (mark.type === "strike") text = `~~${text}~~`;
        if (mark.type === "code") text = `\`${text}\``;
      }
    }
    return text;
  }

  const children = Array.isArray(node.content)
    ? node.content.map(tiptapToMarkdown).join("")
    : "";

  switch (node.type) {
    case "doc":
      return children.trim() + "\n";
    case "heading": {
      const level = node.attrs?.level || 1;
      const prefix = "#".repeat(level);
      return `${prefix} ${children}\n\n`;
    }
    case "paragraph":
      return `${children}\n\n`;
    case "bulletList":
      return `${children}\n`;
    case "orderedList":
      return `${children}\n`;
    case "listItem":
      return `- ${children.trim()}\n`;
    case "blockquote":
      return `> ${children.trim()}\n\n`;
    case "codeBlock":
      return `\`\`\`\n${children.trim()}\n\`\`\`\n\n`;
    case "horizontalRule":
      return `---\n\n`;
    default:
      return children;
  }
}

/**
 * Converts a Tiptap JSON node structure into self-contained styled HTML
 */
export function tiptapToHTML(node: any, title: string): string {
  const md = tiptapToMarkdown(node);
  const bodyHtml = marked.parse(md, { async: false }) as string;
  return buildHTMLDocument(title, bodyHtml);
}

/**
 * Generates a clean, self-contained HTML page styled with Technical Brutalist aesthetics
 */
export function buildHTMLDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 24px;
      background-color: #F7F2EB;
      color: #252822;
    }
    h1, h2, h3, h4, h5, h6 {
      font-weight: 700;
      line-height: 1.25;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      border-bottom: 1px solid #D6CEC1;
      padding-bottom: 0.25em;
    }
    code, pre {
      font-family: "JetBrains Mono", Menlo, Consolas, Monaco, monospace;
      background: #EAE2D6;
      border: 1px solid #D6CEC1;
      border-radius: 2px;
      font-size: 0.9em;
    }
    pre {
      padding: 12px 16px;
      overflow-x: auto;
    }
    code {
      padding: 2px 4px;
    }
    pre code {
      padding: 0;
      border: none;
      background: transparent;
    }
    blockquote {
      border-left: 3px solid #8B9A6E;
      margin: 1.5em 0;
      padding: 0.5em 1em;
      background: #EAE2D6;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1.5em 0;
    }
    th, td {
      border: 1px solid #D6CEC1;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: #EAE2D6;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.85em;
      text-transform: uppercase;
    }
    hr {
      border: 0;
      border-top: 1px solid #D6CEC1;
      margin: 2em 0;
    }
    footer {
      margin-top: 3em;
      padding-top: 1em;
      border-top: 1px solid #D6CEC1;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: #7A7870;
    }
  </style>
</head>
<body>
  <main>
    ${bodyHtml}
  </main>
  <footer>
    Exported from SyncDocs &bull; Zero-Knowledge Client-Side Engine &bull; ${new Date().toLocaleDateString()}
  </footer>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates a clean client-side PDF document using pdf-lib
 */
export async function generateClientPDF(title: string, rawText: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setProducer("SyncDocs Client-Side Zero-Knowledge Engine");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const margin = 50;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y - neededHeight < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  // Header Title
  page.drawText(title || "Untitled Document", {
    x: margin,
    y: y - 20,
    size: 20,
    font: boldFont,
    color: rgb(0.15, 0.16, 0.14),
  });
  y -= 35;

  // Thin dividing line
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.84, 0.81, 0.76), // #D6CEC1
  });
  y -= 25;

  // Split lines
  const lines = rawText.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line) {
      y -= 10;
      continue;
    }

    if (line.startsWith("# ")) {
      checkPageBreak(30);
      y -= 10;
      page.drawText(line.replace(/^#\s+/, ""), {
        x: margin,
        y,
        size: 16,
        font: boldFont,
        color: rgb(0.15, 0.16, 0.14),
      });
      y -= 22;
      continue;
    }

    if (line.startsWith("## ")) {
      checkPageBreak(25);
      y -= 8;
      page.drawText(line.replace(/^##\s+/, ""), {
        x: margin,
        y,
        size: 13,
        font: boldFont,
        color: rgb(0.15, 0.16, 0.14),
      });
      y -= 18;
      continue;
    }

    if (line.startsWith("### ")) {
      checkPageBreak(20);
      y -= 6;
      page.drawText(line.replace(/^###\s+/, ""), {
        x: margin,
        y,
        size: 11,
        font: boldFont,
        color: rgb(0.15, 0.16, 0.14),
      });
      y -= 16;
      continue;
    }

    // Standard paragraph line - wrap long lines
    const isCode = line.startsWith("    ") || line.startsWith("\t");
    const activeFont = isCode ? monoFont : font;
    const fontSize = isCode ? 9 : 10;
    const lineHeight = fontSize + 4;

    const words = line.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = activeFont.widthOfTextAtSize(testLine, fontSize);

      if (textWidth > contentWidth && currentLine) {
        checkPageBreak(lineHeight);
        page.drawText(currentLine, {
          x: margin,
          y,
          size: fontSize,
          font: activeFont,
          color: rgb(0.15, 0.16, 0.14),
        });
        y -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      checkPageBreak(lineHeight);
      page.drawText(currentLine, {
        x: margin,
        y,
        size: fontSize,
        font: activeFont,
        color: rgb(0.15, 0.16, 0.14),
      });
      y -= lineHeight;
    }
  }

  // Footer metadata
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i);
    p.drawText(`Page ${i + 1} of ${totalPages} • SyncDocs Zero-Knowledge Export`, {
      x: margin,
      y: 25,
      size: 8,
      font,
      color: rgb(0.48, 0.47, 0.44),
    });
  }

  return await pdfDoc.save();
}

/**
 * Triggers a browser download of a given Blob with the target filename
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
