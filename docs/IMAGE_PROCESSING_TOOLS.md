# Image Processing and OCR Tools

## Overview
The LM Studio Assistant includes powerful image processing capabilities using Sharp for image manipulation and Tesseract.js for OCR (Optical Character Recognition). These tools enable text extraction, image format conversion, and various image processing operations.

## Available Tools

### 1. **ocr**
Extract text from images using OCR technology.

**Features:**
- Multi-language support (English by default)
- Optional image preprocessing for better accuracy
- Confidence scores for extracted text
- Support for various image formats

**Example Usage:**
```javascript
await ocrTool.execute({
  imagePath: '/path/to/image.png',
  options: {
    language: 'eng', // or 'rus', 'chi_sim', etc.
    preprocess: true  // Apply preprocessing for better OCR
  }
});
```

### 2. **processImage**
Process and manipulate images with various transformations.

**Features:**
- Resize images to specific dimensions
- Rotate images by degrees
- Convert to grayscale
- Apply blur effects
- Sharpen images
- Quality control for JPEG/WebP
- Format conversion

**Example Usage:**
```javascript
await processImageTool.execute({
  inputPath: '/path/to/input.jpg',
  outputPath: '/path/to/output.png',
  options: {
    resize: { width: 800, height: 600 },
    rotate: 90,
    grayscale: true,
    sharpen: true,
    format: 'png'
  }
});
```

### 3. **analyzeImage**
Extract metadata and analyze image properties.

**Features:**
- Image dimensions (width, height)
- File size
- Format detection
- Color space information
- Alpha channel detection
- Progressive JPEG detection
- Aspect ratio calculation

**Example Usage:**
```javascript
await analyzeImageTool.execute({
  imagePath: '/path/to/image.jpg'
});
```

### 4. **screenshotToText**
Specialized tool for extracting text from screenshots.

**Features:**
- Optimized preprocessing for screenshots
- Multi-language support
- Automatic enhancement for better OCR
- Temporary file cleanup

**Example Usage:**
```javascript
await screenshotToTextTool.execute({
  screenshotPath: '/path/to/screenshot.png',
  language: 'eng'
});
```

### 5. **convertImageFormat**
Convert images between different formats.

**Features:**
- Support for JPEG, PNG, WebP, and TIFF
- Quality control for lossy formats
- Compression ratio reporting
- File size comparison

**Example Usage:**
```javascript
await convertImageFormatTool.execute({
  inputPath: '/path/to/image.png',
  outputPath: '/path/to/image.webp',
  format: 'webp',
  quality: 85
});
```

## Technical Details

### Sharp Configuration
- High-performance image processing
- Support for large images
- Memory-efficient operations
- Native performance through libvips

### Tesseract.js Configuration
- Pure JavaScript implementation
- No external dependencies required
- Automatic language model downloads
- Progress tracking during OCR

### Preprocessing Pipeline
For better OCR results, the preprocessing includes:
1. Grayscale conversion
2. Contrast normalization
3. Edge sharpening
4. Threshold application

## Use Cases

1. **Document Processing**
   - Extract text from scanned documents
   - Convert document images to searchable text
   - Process multiple page documents

2. **Screenshot Analysis**
   - Extract error messages from screenshots
   - Process UI screenshots for testing
   - Convert visual bugs to text reports

3. **Image Optimization**
   - Batch resize images for web
   - Convert images to modern formats (WebP)
   - Reduce file sizes while maintaining quality

4. **Data Extraction**
   - Extract text from charts and graphs
   - Process receipts and invoices
   - Read text from photos

## Best Practices

1. **Image Quality**: Higher resolution images generally yield better OCR results
2. **Preprocessing**: Enable preprocessing for low-quality or complex images
3. **Language Selection**: Specify the correct language for better accuracy
4. **Format Choice**: Use WebP for web images, PNG for screenshots, JPEG for photos
5. **Error Handling**: Always check the success status and handle errors gracefully

## Integration with Other Tools

The image processing tools integrate seamlessly with:
- **File System Tools**: Read and write processed images
- **Vector Database**: Index extracted text for semantic search
- **Web Scraper**: Process screenshots from web pages
- **Analysis Tools**: Combine with project analysis for documentation

## Performance Considerations

1. **Memory Usage**: Large images consume significant memory
2. **Processing Time**: OCR can be CPU-intensive for large images
3. **Disk Space**: Consider cleanup of temporary files
4. **Batch Processing**: Process multiple images sequentially to avoid memory issues

## Supported Languages for OCR

Common language codes:
- `eng` - English
- `rus` - Russian
- `deu` - German
- `fra` - French
- `spa` - Spanish
- `chi_sim` - Chinese Simplified
- `jpn` - Japanese
- `kor` - Korean

## Error Handling

Common errors and solutions:
1. **File not found**: Verify the file path is correct and absolute
2. **Unsupported format**: Ensure the image format is supported
3. **OCR failure**: Try enabling preprocessing or check image quality
4. **Memory issues**: Reduce image size or process in smaller batches

## Future Enhancements

Potential improvements:
- Batch processing support
- PDF to image conversion
- Advanced image filters
- Text region detection
- Handwriting recognition
- Real-time OCR from camera