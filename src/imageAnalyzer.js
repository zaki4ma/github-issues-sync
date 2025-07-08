import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ImageAnalyzer {
  constructor(config, githubClient) {
    this.config = config;
    this.githubClient = githubClient;
    this.imageConfig = config.getImagesConfig();
    
    // Create images directory if it doesn't exist
    this.imagesDir = path.join(process.cwd(), 'downloaded_images');
    this.ensureImagesDirectory();
  }

  ensureImagesDirectory() {
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
      console.log(chalk.blue(`Created images directory: ${this.imagesDir}`));
    }
  }

  /**
   * Extract image URLs from issue body and comments
   */
  extractImageUrls(issue) {
    const imageUrls = [];
    const githubImageRegex = /https:\/\/github\.com\/user-attachments\/assets\/[a-f0-9\-]+/g;
    const imgTagRegex = /<img[^>]+src="([^"]+)"/g;
    const markdownImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;

    // Extract from issue body
    if (issue.body) {
      this.extractUrlsFromText(issue.body, imageUrls, [githubImageRegex, imgTagRegex, markdownImageRegex]);
    }

    // Extract from comments
    if (issue.comments && Array.isArray(issue.comments)) {
      issue.comments.forEach(comment => {
        if (comment.body) {
          this.extractUrlsFromText(comment.body, imageUrls, [githubImageRegex, imgTagRegex, markdownImageRegex]);
        }
      });
    }

    return [...new Set(imageUrls)]; // Remove duplicates
  }

  extractUrlsFromText(text, imageUrls, regexes) {
    regexes.forEach(regex => {
      let match;
      regex.lastIndex = 0; // Reset regex state
      while ((match = regex.exec(text)) !== null) {
        const url = match[1] || match[0]; // Get captured group or full match
        if (url && this.isValidImageUrl(url)) {
          imageUrls.push(url);
        }
      }
    });
  }

  isValidImageUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Download image from URL with GitHub authentication
   */
  async downloadImage(imageUrl, filename) {
    return new Promise((resolve, reject) => {
      try {
        const filePath = path.join(this.imagesDir, filename);
        
        // Skip if file already exists
        if (fs.existsSync(filePath)) {
          console.log(chalk.gray(`Image already exists: ${filename}`));
          resolve(filePath);
          return;
        }

        const protocol = imageUrl.startsWith('https:') ? https : http;
        const options = {
          headers: {
            'User-Agent': 'github-issues-sync/0.1.0',
            // Add GitHub token for private repository images
            'Authorization': `token ${this.githubClient.octokit.auth}`
          }
        };

        const request = protocol.get(imageUrl, options, (response) => {
          if (response.statusCode === 200) {
            const writeStream = fs.createWriteStream(filePath);
            response.pipe(writeStream);
            
            writeStream.on('finish', () => {
              writeStream.close();
              console.log(chalk.green(`✓ Downloaded image: ${filename}`));
              resolve(filePath);
            });
            
            writeStream.on('error', (error) => {
              fs.unlink(filePath, () => {}); // Clean up partial file
              reject(error);
            });
          } else if (response.statusCode === 404) {
            console.log(chalk.yellow(`⚠ Image not accessible: ${imageUrl} (404)`));
            resolve(null); // Not an error, just inaccessible
          } else {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          }
        });

        request.on('error', (error) => {
          reject(error);
        });

        request.setTimeout(30000, () => {
          request.destroy();
          reject(new Error('Request timeout'));
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Analyze image using Claude Code's Read tool for image analysis
   */
  async analyzeImage(imagePath, context) {
    try {
      if (!fs.existsSync(imagePath)) {
        return null;
      }

      const stats = fs.statSync(imagePath);
      const filename = path.basename(imagePath);
      
      // For now, we'll create a structured analysis result that can be enhanced
      // when Claude Code's image analysis capabilities are directly integrated
      const analysis = {
        filename,
        size: stats.size,
        lastModified: stats.mtime,
        analysis: {
          description: `Image file: ${filename} (${(stats.size / 1024).toFixed(2)} KB)`,
          extractedText: null,
          detectedElements: ['Image file'],
          suggestedContext: context || 'GitHub Issue/Comment image',
          technicalDetails: {
            fileSize: stats.size,
            filePath: imagePath,
            lastModified: stats.mtime.toISOString()
          }
        }
      };

      console.log(chalk.blue(`📊 Processed image metadata: ${filename}`));
      return analysis;

    } catch (error) {
      console.error(chalk.red(`✗ Failed to analyze image: ${error.message}`));
      return null;
    }
  }

  /**
   * Enhanced image analysis using external tool integration
   * This method can be extended to use actual Claude Code image analysis
   */
  async performAdvancedImageAnalysis(imagePath, context) {
    try {
      // This is where you could integrate with Claude Code's Read tool
      // or other image analysis services in the future
      
      // For demonstration, let's extract some basic information
      const stats = fs.statSync(imagePath);
      const filename = path.basename(imagePath);
      const extension = path.extname(filename).toLowerCase();
      
      let analysisPrompt = `Analyze this image from a GitHub issue/comment context: ${context || 'General'}`;
      
      // You could potentially call Claude Code's Read tool here if integrated
      // const result = await claudeCode.read(imagePath);
      
      return {
        filename,
        analysis: {
          description: `${extension.substring(1).toUpperCase()} image file containing potential UI elements, screenshots, or diagrams`,
          extractedText: null, // Could be populated by OCR
          detectedElements: this.inferImageType(filename, extension),
          suggestedContext: context,
          technicalDetails: {
            fileSize: stats.size,
            fileType: extension,
            lastModified: stats.mtime.toISOString()
          }
        }
      };

    } catch (error) {
      console.error(chalk.red(`✗ Advanced image analysis failed: ${error.message}`));
      return null;
    }
  }

  /**
   * Infer image type and potential content based on filename and extension
   */
  inferImageType(filename, extension) {
    const elements = ['Image file'];
    
    const lowerFilename = filename.toLowerCase();
    
    if (lowerFilename.includes('screenshot') || lowerFilename.includes('screen')) {
      elements.push('Screenshot');
    }
    if (lowerFilename.includes('ui') || lowerFilename.includes('interface')) {
      elements.push('User Interface');
    }
    if (lowerFilename.includes('chart') || lowerFilename.includes('graph')) {
      elements.push('Chart/Graph');
    }
    if (lowerFilename.includes('diagram')) {
      elements.push('Diagram');
    }
    if (lowerFilename.includes('admin') || lowerFilename.includes('dashboard')) {
      elements.push('Admin Dashboard');
    }
    if (lowerFilename.includes('error') || lowerFilename.includes('bug')) {
      elements.push('Error/Bug Report');
    }
    
    return elements;
  }

  /**
   * Process all images in an issue
   */
  async processIssueImages(issue) {
    if (!this.imageConfig.enabled) {
      return { images: [], analyses: [] };
    }

    try {
      const imageUrls = this.extractImageUrls(issue);
      
      if (imageUrls.length === 0) {
        return { images: [], analyses: [] };
      }

      console.log(chalk.blue(`Found ${imageUrls.length} images in issue #${issue.number}`));

      const processedImages = [];
      const imageAnalyses = [];

      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        const filename = this.generateImageFilename(issue.number, i, imageUrl);
        
        try {
          if (this.imageConfig.download_enabled) {
            const localPath = await this.downloadImage(imageUrl, filename);
            
            if (localPath && this.imageConfig.analyze_enabled) {
              const analysis = await this.analyzeImage(localPath, `Issue #${issue.number}`);
              if (analysis) {
                imageAnalyses.push(analysis);
              }
            }

            processedImages.push({
              originalUrl: imageUrl,
              localPath: localPath || null,
              filename,
              downloaded: !!localPath
            });

          } else {
            // Just track URLs without downloading
            processedImages.push({
              originalUrl: imageUrl,
              localPath: null,
              filename,
              downloaded: false
            });
          }

        } catch (error) {
          console.warn(chalk.yellow(`Warning: Failed to process image ${imageUrl}: ${error.message}`));
          processedImages.push({
            originalUrl: imageUrl,
            localPath: null,
            filename,
            downloaded: false,
            error: error.message
          });
        }
      }

      return { images: processedImages, analyses: imageAnalyses };

    } catch (error) {
      console.error(chalk.red(`✗ Failed to process images for issue #${issue.number}: ${error.message}`));
      return { images: [], analyses: [] };
    }
  }

  generateImageFilename(issueNumber, index, imageUrl) {
    try {
      const urlObj = new URL(imageUrl);
      const pathParts = urlObj.pathname.split('/');
      const originalName = pathParts[pathParts.length - 1];
      
      // Extract file extension if available
      const hasExtension = originalName.includes('.');
      const extension = hasExtension ? originalName.split('.').pop() : 'png';
      
      return `issue-${issueNumber}-image-${index + 1}.${extension}`;
    } catch {
      return `issue-${issueNumber}-image-${index + 1}.png`;
    }
  }

  /**
   * Clean up old images (optional maintenance function)
   */
  async cleanupOldImages(maxAgeHours = 168) { // Default: 1 week
    try {
      const files = fs.readdirSync(this.imagesDir);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.imagesDir, file);
        const stats = fs.statSync(filePath);
        const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);

        if (ageHours > maxAgeHours) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(chalk.green(`✓ Cleaned up ${cleanedCount} old images`));
      }

    } catch (error) {
      console.warn(chalk.yellow(`Warning: Failed to cleanup old images: ${error.message}`));
    }
  }
}