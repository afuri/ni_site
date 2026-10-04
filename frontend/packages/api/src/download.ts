/** Save an authenticated response without exposing an object-storage URL. */
export function saveDownloadedBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class PdfPopupBlockedError extends Error {
  constructor() {
    super("pdf_popup_blocked");
    this.name = "PdfPopupBlockedError";
  }
}

/** Reserve a tab during the click, then load a PDF through the authenticated API. */
export async function openPdfInNewTab(loadPdf: () => Promise<Blob>): Promise<void> {
  const tab = window.open("", "_blank");
  if (!tab) throw new PdfPopupBlockedError();

  let url: string | null = null;
  try {
    tab.opener = null;
    tab.document.title = "PDF";
    tab.document.body.textContent = "Загрузка PDF…";
    const blob = await loadPdf();
    if (tab.closed) return;
    url = URL.createObjectURL(blob);
    tab.location.replace(url);

    // Keep the URL usable for the browser's PDF viewer, printing and reloading.
    const pdfUrl = url;
    const cleanup = window.setInterval(() => {
      if (tab.closed) {
        URL.revokeObjectURL(pdfUrl);
        window.clearInterval(cleanup);
      }
    }, 30000);
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    tab.close();
    throw error;
  }
}
