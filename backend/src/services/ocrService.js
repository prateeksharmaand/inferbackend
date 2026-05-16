const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const { extractBiometricMarkers } = require('./loincService');
const logger = require('../config/logger');

let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

async function preprocessImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf' || !sharp) {
    return filePath;
  }

  const outputPath = filePath.replace(ext, '_processed.jpg');
  await sharp(filePath)
    .grayscale()
    .normalize()
    .sharpen()
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 95 })
    .toFile(outputPath);

  return outputPath;
}

async function extractTextFromImage(filePath) {
  try {
    const processedPath = await preprocessImage(filePath);

    const result = await Tesseract.recognize(processedPath, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    if (processedPath !== filePath && fs.existsSync(processedPath)) {
      fs.unlinkSync(processedPath);
    }

    return result.data.text;
  } catch (err) {
    logger.error('OCR extraction failed:', err);
    throw new Error('OCR processing failed: ' + err.message);
  }
}

async function extractTextFromPDF(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    logger.error('PDF extraction failed:', err);
    throw new Error('PDF text extraction failed: ' + err.message);
  }
}

async function processDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  if (ext === '.pdf') {
    text = await extractTextFromPDF(filePath);
  } else {
    text = await extractTextFromImage(filePath);
  }

  const extractedVitals = extractBiometricMarkers(text);

  return {
    text,
    extractedVitals,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

module.exports = { processDocument, extractTextFromImage, extractTextFromPDF };
