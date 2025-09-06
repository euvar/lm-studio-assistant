import { Tool, ToolResult } from './base.js';
import { SimpleProgress } from '../core/progress.js';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

interface OCROptions {
  language?: string; // 'eng', 'rus', 'chi_sim', etc.
  preprocess?: boolean; // Apply preprocessing for better OCR
}

interface ImageProcessOptions {
  resize?: { width?: number; height?: number };
  rotate?: number;
  grayscale?: boolean;
  blur?: number;
  sharpen?: boolean;
  quality?: number; // 1-100 for JPEG
  format?: 'jpeg' | 'png' | 'webp';
}

export const ocrTool: Tool = {
  name: 'ocr',
  description: 'Extract text from images using OCR (Optical Character Recognition)',
  async execute(params: { imagePath: string; options?: OCROptions }): Promise<ToolResult> {
    if (!params.imagePath) {
      return {
        success: false,
        error: 'Image path is required'
      };
    }

    const progress = new SimpleProgress(`Processing image for OCR...`);

    try {
      // Check if file exists
      await fs.access(params.imagePath);

      // Preprocess image if requested
      let processedImagePath = params.imagePath;
      if (params.options?.preprocess) {
        progress.update('Preprocessing image for better OCR...');
        processedImagePath = await preprocessForOCR(params.imagePath);
      }

      progress.update('Running OCR...');

      // Simple OCR without complex configuration
      const result = await Tesseract.recognize(
        processedImagePath,
        params.options?.language || 'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              progress.update(`OCR progress: ${Math.round((m.progress || 0) * 100)}%`);
            }
          }
        }
      );
      
      // Delete preprocessed image if it was created
      if (processedImagePath !== params.imagePath) {
        await fs.unlink(processedImagePath).catch(() => {});
      }

      progress.succeed('OCR completed successfully');

      return {
        success: true,
        data: {
          text: result.data.text,
          confidence: result.data.confidence
        }
      };

    } catch (error) {
      progress.fail('OCR failed');
      return {
        success: false,
        error: `OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// Preprocess image for better OCR results
async function preprocessForOCR(imagePath: string): Promise<string> {
  const outputPath = path.join(
    path.dirname(imagePath),
    `ocr_preprocessed_${Date.now()}_${path.basename(imagePath)}`
  );

  await sharp(imagePath)
    .grayscale() // Convert to grayscale
    .normalize() // Normalize contrast
    .sharpen() // Sharpen edges
    .threshold(128) // Apply threshold for better text separation
    .toFile(outputPath);

  return outputPath;
}

export const processImageTool: Tool = {
  name: 'processImage',
  description: 'Process and manipulate images (resize, rotate, filter, convert format)',
  async execute(params: { 
    inputPath: string; 
    outputPath: string; 
    options: ImageProcessOptions 
  }): Promise<ToolResult> {
    if (!params.inputPath || !params.outputPath) {
      return {
        success: false,
        error: 'Input and output paths are required'
      };
    }

    const progress = new SimpleProgress(`Processing image...`);

    try {
      // Check if file exists
      await fs.access(params.inputPath);

      let image = sharp(params.inputPath);

      // Get metadata for info
      const metadata = await image.metadata();

      // Apply transformations
      if (params.options.resize) {
        progress.update('Resizing image...');
        image = image.resize(params.options.resize.width, params.options.resize.height);
      }

      if (params.options.rotate) {
        progress.update('Rotating image...');
        image = image.rotate(params.options.rotate);
      }

      if (params.options.grayscale) {
        progress.update('Converting to grayscale...');
        image = image.grayscale();
      }

      if (params.options.blur && params.options.blur > 0) {
        progress.update('Applying blur...');
        image = image.blur(params.options.blur);
      }

      if (params.options.sharpen) {
        progress.update('Sharpening image...');
        image = image.sharpen();
      }

      // Set output format and quality
      if (params.options.format) {
        progress.update(`Converting to ${params.options.format}...`);
        switch (params.options.format) {
          case 'jpeg':
            image = image.jpeg({ quality: params.options.quality || 80 });
            break;
          case 'png':
            image = image.png();
            break;
          case 'webp':
            image = image.webp({ quality: params.options.quality || 80 });
            break;
        }
      }

      // Save the processed image
      progress.update('Saving processed image...');
      const info = await image.toFile(params.outputPath);

      progress.succeed('Image processing completed');

      return {
        success: true,
        data: {
          inputPath: params.inputPath,
          outputPath: params.outputPath,
          originalSize: {
            width: metadata.width,
            height: metadata.height,
            size: metadata.size
          },
          processedSize: {
            width: info.width,
            height: info.height,
            size: info.size
          },
          format: info.format
        }
      };

    } catch (error) {
      progress.fail('Image processing failed');
      return {
        success: false,
        error: `Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const analyzeImageTool: Tool = {
  name: 'analyzeImage',
  description: 'Analyze image properties and extract metadata',
  async execute(params: { imagePath: string }): Promise<ToolResult> {
    if (!params.imagePath) {
      return {
        success: false,
        error: 'Image path is required'
      };
    }

    try {
      // Check if file exists
      await fs.access(params.imagePath);

      const metadata = await sharp(params.imagePath).metadata();
      const stats = await sharp(params.imagePath).stats();

      return {
        success: true,
        data: {
          path: params.imagePath,
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          size: metadata.size,
          density: metadata.density,
          hasAlpha: metadata.hasAlpha,
          channels: metadata.channels,
          colorSpace: metadata.space,
          isProgressive: metadata.isProgressive,
          stats: {
            channels: stats.channels,
            isOpaque: stats.isOpaque,
            entropy: stats.entropy,
            dominant: stats.dominant
          },
          aspectRatio: metadata.width && metadata.height ? 
            (metadata.width / metadata.height).toFixed(2) : 'unknown'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Image analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const screenshotToTextTool: Tool = {
  name: 'screenshotToText',
  description: 'Extract text from screenshots (supports multiple languages)',
  async execute(params: { 
    screenshotPath: string; 
    language?: string;
  }): Promise<ToolResult> {
    if (!params.screenshotPath) {
      return {
        success: false,
        error: 'Screenshot path is required'
      };
    }

    const progress = new SimpleProgress(`Extracting text from screenshot...`);

    try {
      // Preprocess screenshot for better OCR
      progress.update('Preprocessing screenshot...');
      const preprocessedPath = await sharp(params.screenshotPath)
        .grayscale()
        .normalize()
        .sharpen()
        .toBuffer()
        .then(buffer => {
          const tempPath = path.join(
            path.dirname(params.screenshotPath),
            `temp_${Date.now()}.png`
          );
          return fs.writeFile(tempPath, buffer).then(() => tempPath);
        });

      // Run OCR
      progress.update('Extracting text...');
      const result = await Tesseract.recognize(
        preprocessedPath,
        params.language || 'eng'
      );

      // Clean up temp file
      await fs.unlink(preprocessedPath).catch(() => {});

      progress.succeed('Text extraction completed');

      return {
        success: true,
        data: {
          text: result.data.text,
          confidence: result.data.confidence,
          language: params.language || 'eng'
        }
      };

    } catch (error) {
      progress.fail('Screenshot text extraction failed');
      return {
        success: false,
        error: `Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

export const convertImageFormatTool: Tool = {
  name: 'convertImageFormat',
  description: 'Convert images between different formats',
  async execute(params: {
    inputPath: string;
    outputPath: string;
    format: 'jpeg' | 'png' | 'webp' | 'tiff';
    quality?: number;
  }): Promise<ToolResult> {
    if (!params.inputPath || !params.outputPath || !params.format) {
      return {
        success: false,
        error: 'Input path, output path, and format are required'
      };
    }

    const progress = new SimpleProgress(`Converting image to ${params.format}...`);

    try {
      await fs.access(params.inputPath);

      let image = sharp(params.inputPath);
      
      switch (params.format) {
        case 'jpeg':
          image = image.jpeg({ quality: params.quality || 80 });
          break;
        case 'png':
          image = image.png();
          break;
        case 'webp':
          image = image.webp({ quality: params.quality || 80 });
          break;
        case 'tiff':
          image = image.tiff();
          break;
      }

      await image.toFile(params.outputPath);
      
      const inputStats = await fs.stat(params.inputPath);
      const outputStats = await fs.stat(params.outputPath);

      progress.succeed('Image format conversion completed');

      return {
        success: true,
        data: {
          inputPath: params.inputPath,
          outputPath: params.outputPath,
          format: params.format,
          originalSize: inputStats.size,
          convertedSize: outputStats.size,
          compressionRatio: ((1 - outputStats.size / inputStats.size) * 100).toFixed(1) + '%'
        }
      };

    } catch (error) {
      progress.fail('Format conversion failed');
      return {
        success: false,
        error: `Failed to convert image: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};