"""PDF parsing service using PyMuPDF (fitz)."""

import fitz  # PyMuPDF


def parse_pdf(file_path: str) -> list[dict]:
    """
    Parse a PDF file into sections.

    Each section represents a logical chunk of text (roughly one page or
    one heading-delimited block). Returns a list of dicts with:
    - title: optional heading detected at the start of the section
    - content: the text content
    - page_number: which page this came from
    """
    doc = fitz.open(file_path)
    sections = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text("dict")["blocks"]

        page_text_parts = []
        page_title = None

        for block in blocks:
            if block["type"] != 0:  # skip non-text blocks (images, etc.)
                continue

            for line in block.get("lines", []):
                line_text = ""
                max_font_size = 0

                for span in line.get("spans", []):
                    line_text += span["text"]
                    max_font_size = max(max_font_size, span["size"])

                line_text = line_text.strip()
                if not line_text:
                    continue

                # Detect headings by font size (>14pt is likely a heading)
                if max_font_size > 14 and not page_title and len(line_text) < 200:
                    page_title = line_text
                else:
                    page_text_parts.append(line_text)

        content = "\n".join(page_text_parts).strip()

        if content and len(content) > 50:  # skip near-empty pages
            sections.append({
                "title": page_title,
                "content": content,
                "page_number": page_num + 1,
            })

    doc.close()
    return sections
