"""
Convert DOCX/PPTX files to PDF.

Strategy:
1. For DOCX on Windows/macOS: Use docx2pdf (requires MS Word installed)
2. For PPTX or fallback: Use LibreOffice headless
"""

import subprocess
import os
import platform
import shutil


def find_libreoffice() -> str | None:
    """Find the LibreOffice executable on the system."""
    soffice = shutil.which("soffice")
    if soffice:
        return soffice

    if platform.system() == "Windows":
        common_paths = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ]
        for path in common_paths:
            if os.path.exists(path):
                return path

    elif platform.system() == "Linux":
        common_paths = [
            "/usr/bin/libreoffice",
            "/usr/bin/soffice",
            "/usr/local/bin/soffice",
        ]
        for path in common_paths:
            if os.path.exists(path):
                return path

    return None


def convert_docx_with_word(source_path: str) -> str | None:
    """Convert DOCX to PDF using docx2pdf (requires MS Word on Windows/macOS)."""
    try:
        from docx2pdf import convert

        out_dir = os.path.dirname(os.path.abspath(source_path))
        base_name = os.path.splitext(os.path.basename(source_path))[0]
        pdf_path = os.path.join(out_dir, f"{base_name}.pdf")

        convert(source_path, pdf_path)

        if os.path.exists(pdf_path):
            print(f"[doc_converter] Converted DOCX to PDF via MS Word: {pdf_path}")
            return pdf_path
        return None
    except ImportError:
        print("[doc_converter] docx2pdf not installed")
        return None
    except Exception as e:
        print(f"[doc_converter] docx2pdf failed: {e}")
        return None


def convert_with_libreoffice(source_path: str) -> str | None:
    """Convert any document to PDF using LibreOffice headless."""
    soffice = find_libreoffice()
    if not soffice:
        print("[doc_converter] LibreOffice not found.")
        return None

    out_dir = os.path.dirname(os.path.abspath(source_path))

    try:
        result = subprocess.run(
            [
                soffice,
                "--headless",
                "--convert-to", "pdf",
                "--outdir", out_dir,
                source_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0:
            print(f"[doc_converter] LibreOffice failed: {result.stderr}")
            return None

        base_name = os.path.splitext(os.path.basename(source_path))[0]
        pdf_path = os.path.join(out_dir, f"{base_name}.pdf")

        if os.path.exists(pdf_path):
            print(f"[doc_converter] Converted to PDF via LibreOffice: {pdf_path}")
            return pdf_path
        return None

    except subprocess.TimeoutExpired:
        print("[doc_converter] LibreOffice timed out (60s)")
        return None
    except Exception as e:
        print(f"[doc_converter] LibreOffice error: {e}")
        return None


def convert_to_pdf(source_path: str) -> str | None:
    """
    Convert a DOCX or PPTX file to PDF.

    For DOCX: tries docx2pdf (MS Word) first, then LibreOffice.
    For PPTX: uses LibreOffice only.

    Returns path to the generated PDF, or None if conversion failed.
    """
    ext = os.path.splitext(source_path)[1].lower()

    if ext == ".docx":
        # Try MS Word first (fast, accurate on Windows)
        pdf_path = convert_docx_with_word(source_path)
        if pdf_path:
            return pdf_path
        # Fallback to LibreOffice
        return convert_with_libreoffice(source_path)

    elif ext == ".pptx":
        # LibreOffice only for PPTX
        return convert_with_libreoffice(source_path)

    return None
