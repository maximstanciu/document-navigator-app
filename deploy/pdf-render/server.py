"""PDF pages as JPEG for a model that reads only images (SPEC D-6, deploy/README.md).

POST /render with the PDF as the body answers {"pages": ["<base64 JPEG>", ...]}; GET /healthz
answers ok. Nothing is stored: the file and its pages live only in the request's memory. Reachable
only on the compose network. No access log, and errors are logged by type only: a message could
quote the document (SPEC §7.1).
"""

import base64
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pypdfium2 as pdfium

PORT = int(os.environ.get("PORT", "8080"))
# The analyze route takes 20 MB of files (CAP-7) and checks the page count itself (D-4).
MAX_BYTES = 21 * 1024 * 1024
MAX_PAGES = 30
# Long side of a page in pixels: small print stays legible, and a page stays around a thousand
# image tokens, which matters for a model on a CPU.
MAX_SIDE = int(os.environ.get("PAGE_MAX_SIDE", "1600"))
JPEG_QUALITY = 80


def render(data: bytes) -> list[str]:
    pdf = pdfium.PdfDocument(data)
    try:
        if len(pdf) > MAX_PAGES:
            raise ValueError("too many pages")
        pages = []
        for index in range(len(pdf)):
            page = pdf[index]
            try:
                width, height = page.get_size()
                bitmap = page.render(scale=MAX_SIDE / max(width, height))
                image = bitmap.to_pil().convert("RGB")
                buffer = io.BytesIO()
                image.save(buffer, "JPEG", quality=JPEG_QUALITY)
                pages.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
            finally:
                page.close()
        return pages
    finally:
        pdf.close()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/healthz":
            self.answer(200, b"ok", "text/plain")
        else:
            self.answer(404)

    def do_POST(self) -> None:
        if self.path != "/render":
            self.answer(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            self.answer(413)
            return
        data = self.rfile.read(length)
        try:
            pages = render(data)
        except Exception as error:  # a damaged, encrypted or oversized file
            print(f"render failed: {type(error).__name__}", file=sys.stderr, flush=True)
            self.answer(422)
            return
        self.answer(200, json.dumps({"pages": pages}).encode("ascii"), "application/json")

    def answer(self, status: int, body: bytes = b"", content_type: str | None = None) -> None:
        self.send_response(status)
        if content_type:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        pass


if __name__ == "__main__":
    print(f"pdf-render listening on {PORT}", flush=True)
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
