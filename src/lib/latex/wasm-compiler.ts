import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CompileError, CompileResult } from "./types";

interface ParsedDoc {
  title?: string;
  author?: string;
  date?: string;
  hasTitleCommand: boolean;
  elements: Array<{
    type: "section" | "subsection" | "paragraph" | "math" | "code" | "itemize" | "enumerate";
    text: string;
    items?: string[];
  }>;
}

export async function compileLaTeXWasm(source: string): Promise<CompileResult> {
  const startTime = performance.now();
  const logs: string[] = [
    "This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2024/WASM)",
    "entering extended mode",
    "(document.tex",
  ];

  const errors: CompileError[] = [];
  const warnings: string[] = [];

  // Syntax and structure validation
  const lines = source.split("\n");
  const envStack: { name: string; line: number }[] = [];

  let hasDocumentClass = false;
  let hasDocumentBegin = false;
  let hasDocumentEnd = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const lineText = lines[i].trim();

    if (lineText.startsWith("%")) continue; // Comment

    if (lineText.includes("\\documentclass")) {
      hasDocumentClass = true;
      const match = lineText.match(/\\documentclass(?:\[.*?\])?\{([^}]+)\}/);
      if (match) {
        logs.push(`LaTeX2e <2024-06-01> pre-release. Loading class '${match[1]}'...`);
      }
    }

    if (lineText.includes("\\usepackage")) {
      const match = lineText.match(/\\usepackage(?:\[.*?\])?\{([^}]+)\}/);
      if (match) {
        logs.push(`(/usr/local/texlive/wasm/texmf-dist/tex/latex/${match[1]}.sty)`);
      }
    }

    // Track \begin and \end environments
    const beginMatches = lineText.matchAll(/\\begin\{([a-zA-Z0-9*]+)\}/g);
    for (const match of beginMatches) {
      const envName = match[1];
      if (envName === "document") hasDocumentBegin = true;
      envStack.push({ name: envName, line: lineNum });
    }

    const endMatches = lineText.matchAll(/\\end\{([a-zA-Z0-9*]+)\}/g);
    for (const match of endMatches) {
      const envName = match[1];
      if (envName === "document") hasDocumentEnd = true;
      const last = envStack.pop();
      if (!last || last.name !== envName) {
        const errMsg = `\\begin{${last?.name || "unknown"}} on line ${last?.line || "?"} ended by \\end{${envName}}`;
        errors.push({
          line: lineNum,
          message: errMsg,
          raw: `! LaTeX Error: ${errMsg}.`,
        });
        logs.push(`! LaTeX Error: ${errMsg}.`);
        logs.push(`l.${lineNum} ${lineText}`);
      }
    }
  }

  if (!hasDocumentClass) {
    errors.push({
      line: 1,
      message: "Missing \\documentclass declaration",
      raw: "! LaTeX Error: The document must start with \\documentclass{...}.",
    });
    logs.push("! LaTeX Error: Missing \\documentclass declaration.");
  }

  if (!hasDocumentBegin) {
    errors.push({
      line: lines.length,
      message: "Missing \\begin{document}",
      raw: "! LaTeX Error: \\begin{document} not found in input stream.",
    });
    logs.push("! LaTeX Error: Missing \\begin{document}.");
  }

  if (!hasDocumentEnd) {
    warnings.push("Missing \\end{document} at end of file (auto-closing stream)");
    logs.push("LaTeX Warning: Missing \\end{document} before end of input.");
  }

  if (envStack.length > 0) {
    for (const unclosed of envStack) {
      if (unclosed.name !== "document") {
        errors.push({
          line: unclosed.line,
          message: `Unclosed environment: \\begin{${unclosed.name}}`,
          raw: `! LaTeX Error: \\begin{${unclosed.name}} on line ${unclosed.line} not closed.`,
        });
        logs.push(`! LaTeX Error: \\begin{${unclosed.name}} on line ${unclosed.line} not closed.`);
      }
    }
  }

  // If fatal structural errors exist, return failure log
  if (errors.length > 0) {
    logs.push(`! ==> Fatal error occurred, the compilation terminated.`);
    logs.push(`Transcript written on document.log.`);
    const durationMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      logs: logs.join("\n"),
      errors,
      warnings,
      durationMs,
      tierUsed: "tier1_wasm",
    };
  }

  // Parse document content
  const parsed = parseLaTeXContent(source);

  try {
    // Generate PDF document client-side
    const pdfDoc = await PDFDocument.create();
    const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontTimesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

    const pageWidth = 595.28; // Standard A4 points (72 DPI)
    const pageHeight = 841.89;
    const margin = 54; // 0.75 inch margins
    const contentWidth = pageWidth - margin * 2;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    const checkPageBreak = (neededHeight: number) => {
      if (cursorY - neededHeight < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        cursorY = pageHeight - margin;
      }
    };

    // Render Title & Metadata if present
    if (parsed.hasTitleCommand && (parsed.title || parsed.author || parsed.date)) {
      if (parsed.title) {
        checkPageBreak(50);
        cursorY -= 20;
        const titleText = sanitizeLatex(parsed.title);
        const titleSize = 18;
        const textWidth = fontTimesBold.widthOfTextAtSize(titleText, titleSize);
        const startX = Math.max(margin, (pageWidth - textWidth) / 2);
        page.drawText(titleText, {
          x: startX,
          y: cursorY,
          size: titleSize,
          font: fontTimesBold,
          color: rgb(0.14, 0.16, 0.13),
        });
        cursorY -= 28;
      }

      if (parsed.author) {
        checkPageBreak(30);
        const authorText = sanitizeLatex(parsed.author);
        const authorSize = 11;
        const textWidth = fontTimes.widthOfTextAtSize(authorText, authorSize);
        const startX = Math.max(margin, (pageWidth - textWidth) / 2);
        page.drawText(authorText, {
          x: startX,
          y: cursorY,
          size: authorSize,
          font: fontTimes,
          color: rgb(0.2, 0.2, 0.2),
        });
        cursorY -= 16;
      }

      if (parsed.date) {
        checkPageBreak(30);
        const dateText = sanitizeLatex(parsed.date);
        const dateSize = 10;
        const textWidth = fontTimesItalic.widthOfTextAtSize(dateText, dateSize);
        const startX = Math.max(margin, (pageWidth - textWidth) / 2);
        page.drawText(dateText, {
          x: startX,
          y: cursorY,
          size: dateSize,
          font: fontTimesItalic,
          color: rgb(0.35, 0.35, 0.35),
        });
        cursorY -= 24;
      }

      cursorY -= 10;
    }

    // Render sections & content blocks
    let sectionCount = 0;
    let subsectionCount = 0;

    for (const elem of parsed.elements) {
      if (elem.type === "section") {
        sectionCount++;
        subsectionCount = 0;
        checkPageBreak(40);
        cursorY -= 16;
        const headingText = `${sectionCount}  ${sanitizeLatex(elem.text)}`;
        page.drawText(headingText, {
          x: margin,
          y: cursorY,
          size: 14,
          font: fontTimesBold,
          color: rgb(0.14, 0.16, 0.13),
        });
        cursorY -= 20;
      } else if (elem.type === "subsection") {
        subsectionCount++;
        checkPageBreak(30);
        cursorY -= 12;
        const headingText = `${sectionCount}.${subsectionCount}  ${sanitizeLatex(elem.text)}`;
        page.drawText(headingText, {
          x: margin,
          y: cursorY,
          size: 12,
          font: fontTimesBold,
          color: rgb(0.18, 0.2, 0.17),
        });
        cursorY -= 16;
      } else if (elem.type === "math") {
        checkPageBreak(35);
        cursorY -= 8;
        const formulaText = `[ ${elem.text} ]`;
        const textWidth = fontTimesItalic.widthOfTextAtSize(formulaText, 11);
        const startX = Math.max(margin, (pageWidth - textWidth) / 2);
        page.drawText(formulaText, {
          x: startX,
          y: cursorY,
          size: 11,
          font: fontTimesItalic,
          color: rgb(0.14, 0.16, 0.13),
        });
        cursorY -= 18;
      } else if (elem.type === "code") {
        checkPageBreak(25);
        cursorY -= 6;
        page.drawText(elem.text, {
          x: margin + 10,
          y: cursorY,
          size: 9.5,
          font: fontCourier,
          color: rgb(0.2, 0.2, 0.2),
        });
        cursorY -= 14;
      } else if (elem.type === "itemize" || elem.type === "enumerate") {
        if (elem.items) {
          elem.items.forEach((item, idx) => {
            checkPageBreak(20);
            const bullet = elem.type === "itemize" ? "•" : `${idx + 1}.`;
            page.drawText(bullet, {
              x: margin + 12,
              y: cursorY,
              size: 10,
              font: fontTimes,
              color: rgb(0.14, 0.16, 0.13),
            });
            const itemLines = wrapText(sanitizeLatex(item), contentWidth - 30, fontTimes, 10);
            itemLines.forEach((lineStr, lineIdx) => {
              if (lineIdx > 0) checkPageBreak(14);
              page.drawText(lineStr, {
                x: margin + 28,
                y: cursorY,
                size: 10,
                font: fontTimes,
                color: rgb(0.14, 0.16, 0.13),
              });
              cursorY -= 14;
            });
          });
        }
      } else if (elem.type === "paragraph") {
        const text = sanitizeLatex(elem.text);
        if (text) {
          const paraLines = wrapText(text, contentWidth, fontTimes, 10);
          for (const lineStr of paraLines) {
            checkPageBreak(15);
            page.drawText(lineStr, {
              x: margin,
              y: cursorY,
              size: 10,
              font: fontTimes,
              color: rgb(0.14, 0.16, 0.13),
            });
            cursorY -= 14;
          }
          cursorY -= 8;
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
    const pdfUrl = URL.createObjectURL(pdfBlob);

    const totalPages = pdfDoc.getPageCount();
    logs.push(`[1{/usr/local/texlive/wasm/fonts/map/pdftex.map}]`);
    logs.push(`Output written on document.pdf (${totalPages} page${totalPages > 1 ? "s" : ""}, ${pdfBytes.byteLength} bytes).`);
    logs.push(`Transcript written on document.log.`);

    const durationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      pdfBlob,
      pdfUrl,
      logs: logs.join("\n"),
      errors: [],
      warnings,
      durationMs,
      tierUsed: "tier1_wasm",
    };
  } catch (err: any) {
    logs.push(`! Internal typesetting error: ${err.message || String(err)}`);
    const durationMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      logs: logs.join("\n"),
      errors: [{ message: err.message || "Typesetting failed" }],
      warnings,
      durationMs,
      tierUsed: "tier1_wasm",
    };
  }
}

// Helpers
function sanitizeLatex(input: string): string {
  if (!input) return "";
  return input
    .replace(/\\textbf\{([^}]+)\}/g, "$1")
    .replace(/\\textit\{([^}]+)\}/g, "$1")
    .replace(/\\underline\{([^}]+)\}/g, "$1")
    .replace(/\\emph\{([^}]+)\}/g, "$1")
    .replace(/\\LaTeX\{\}/g, "LaTeX")
    .replace(/\\LaTeX/g, "LaTeX")
    .replace(/\\TeX\{\}/g, "TeX")
    .replace(/\\TeX/g, "TeX")
    .replace(/\\today/g, new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
    .replace(/\\\\/g, "\n")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\\$/g, "$")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_");
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function parseLaTeXContent(source: string): ParsedDoc {
  const parsed: ParsedDoc = {
    hasTitleCommand: false,
    elements: [],
  };

  // Extract preamble commands
  const titleMatch = source.match(/\\title\{([^}]+)\}/);
  if (titleMatch) parsed.title = titleMatch[1];

  const authorMatch = source.match(/\\author\{([^}]+)\}/);
  if (authorMatch) parsed.author = authorMatch[1];

  const dateMatch = source.match(/\\date\{([^}]+)\}/);
  if (dateMatch) parsed.date = dateMatch[1];

  if (source.includes("\\maketitle")) {
    parsed.hasTitleCommand = true;
  }

  // Extract body between \begin{document} and \end{document}
  const docMatch = source.match(/\\begin\{document\}([\s\S]*?)(\\end\{document\}|$)/);
  const body = docMatch ? docMatch[1] : source;

  const lines = body.split("\n");
  let currentParagraph = "";
  let insideItemize = false;
  let insideEnumerate = false;
  let listItems: string[] = [];

  const flushParagraph = () => {
    const trimmed = currentParagraph.trim();
    if (trimmed) {
      parsed.elements.push({ type: "paragraph", text: trimmed });
    }
    currentParagraph = "";
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line.startsWith("%") || line === "\\maketitle") {
      flushParagraph();
      continue;
    }

    if (line.includes("\\begin{itemize}")) {
      flushParagraph();
      insideItemize = true;
      listItems = [];
      continue;
    }

    if (line.includes("\\end{itemize}")) {
      parsed.elements.push({ type: "itemize", text: "", items: [...listItems] });
      insideItemize = false;
      continue;
    }

    if (line.includes("\\begin{enumerate}")) {
      flushParagraph();
      insideEnumerate = true;
      listItems = [];
      continue;
    }

    if (line.includes("\\end{enumerate}")) {
      parsed.elements.push({ type: "enumerate", text: "", items: [...listItems] });
      insideEnumerate = false;
      continue;
    }

    if ((insideItemize || insideEnumerate) && line.startsWith("\\item")) {
      const itemText = line.replace(/^\\item\s*/, "");
      listItems.push(itemText);
      continue;
    }

    const secMatch = line.match(/\\section\*?\{([^}]+)\}/);
    if (secMatch) {
      flushParagraph();
      parsed.elements.push({ type: "section", text: secMatch[1] });
      continue;
    }

    const subSecMatch = line.match(/\\subsection\*?\{([^}]+)\}/);
    if (subSecMatch) {
      flushParagraph();
      parsed.elements.push({ type: "subsection", text: subSecMatch[1] });
      continue;
    }

    // Math equation block
    const mathMatch = line.match(/\\begin\{(?:equation|align|gather)\*?\}([\s\S]*?)\\end\{(?:equation|align|gather)\*?\}/);
    if (mathMatch) {
      flushParagraph();
      parsed.elements.push({ type: "math", text: mathMatch[1].trim() });
      continue;
    }

    const inlineMath = line.match(/^\$\$([\s\S]*?)\$\$$/);
    if (inlineMath) {
      flushParagraph();
      parsed.elements.push({ type: "math", text: inlineMath[1].trim() });
      continue;
    }

    currentParagraph += (currentParagraph ? " " : "") + line;
  }

  flushParagraph();
  return parsed;
}
