"""DOCX parsing service using python-docx."""

from docx import Document


def parse_docx(file_path: str) -> list[dict]:
    """
    Parse a DOCX file into sections grouped by headings.

    Groups content by any Heading style (1-9) or Title. Paragraphs without
    a preceding heading go into a "General" section. Returns a list of dicts with:
    - title: the heading text or "General" for ungrouped content
    - content: concatenated paragraph text under that heading
    - page_number: section index (1-indexed)
    """
    doc = Document(file_path)
    sections = []
    current_title = None
    current_paragraphs = []

    heading_styles = {
        "Title", "Heading 1", "Heading 2", "Heading 3",
        "Heading 4", "Heading 5", "Heading 6", "Heading 7",
        "Heading 8", "Heading 9",
    }

    for paragraph in doc.paragraphs:
        style_name = paragraph.style.name if paragraph.style else ""

        if style_name in heading_styles:
            # Save the previous section if it has content
            if current_paragraphs:
                content = "\n".join(current_paragraphs).strip()
                if content:
                    sections.append({
                        "title": current_title or "General",
                        "content": content,
                        "page_number": len(sections) + 1,
                    })
                current_paragraphs = []

            current_title = paragraph.text.strip() or None
        else:
            text = paragraph.text.strip()
            if text:
                current_paragraphs.append(text)

    # Don't forget the last section
    if current_paragraphs:
        content = "\n".join(current_paragraphs).strip()
        if content:
            sections.append({
                "title": current_title or "General",
                "content": content,
                "page_number": len(sections) + 1,
            })

    # If no headings found at all, split by paragraph groups (every ~500 words)
    if len(sections) <= 1 and sections:
        all_text = sections[0]["content"]
        words = all_text.split()
        if len(words) > 500:
            sections = []
            chunk_size = 400  # words per section
            paragraphs = all_text.split("\n")
            current_chunk = []
            current_word_count = 0

            for para in paragraphs:
                para_words = len(para.split())
                current_chunk.append(para)
                current_word_count += para_words

                if current_word_count >= chunk_size:
                    sections.append({
                        "title": f"Section {len(sections) + 1}",
                        "content": "\n".join(current_chunk).strip(),
                        "page_number": len(sections) + 1,
                    })
                    current_chunk = []
                    current_word_count = 0

            if current_chunk:
                sections.append({
                    "title": f"Section {len(sections) + 1}",
                    "content": "\n".join(current_chunk).strip(),
                    "page_number": len(sections) + 1,
                })

    return sections
