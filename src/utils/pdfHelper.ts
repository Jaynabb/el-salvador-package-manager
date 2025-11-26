import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
const workerSrc = '/pdf.worker.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const images: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    images.push(canvas.toDataURL('image/png'));
  }

  return images;
};

export const convertPdfToImage = async (file: File, pageNumber: number = 1): Promise<string> => {
  const images = await convertPdfToImages(file);
  return images[pageNumber - 1] || images[0];
};
