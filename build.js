const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// Configure marked for better rendering
marked.setOptions({
  breaks: true,
  gfm: true
});

// Directories
const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const pngDir = path.join(rootDir, 'png');

// Directories to ignore when scanning for markdown files
const ignoreDirs = ['node_modules', '.git', '.netlify', '.vs', 'dist', 'png'];

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy PNG assets
const distPngDir = path.join(distDir, 'png');
if (!fs.existsSync(distPngDir)) {
  fs.mkdirSync(distPngDir, { recursive: true });
}

if (fs.existsSync(pngDir)) {
  const pngFiles = fs.readdirSync(pngDir);
  pngFiles.forEach(file => {
    fs.copyFileSync(path.join(pngDir, file), path.join(distPngDir, file));
  });
  console.log(`Copied ${pngFiles.length} PNG files`);
}

// Recursively find all markdown files in a directory
function findMarkdownFiles(dir, relativePath = '') {
  const results = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      // Skip ignored directories
      if (!ignoreDirs.includes(item) && !item.startsWith('.')) {
        results.push(...findMarkdownFiles(fullPath, itemRelativePath));
      }
    } else if (item.endsWith('.md') && !item.startsWith('.')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const name = path.basename(item, '.md');

      // Extract first heading or use filename
      const headingMatch = content.match(/^#\s+(.+)$/m);
      const title = headingMatch ? headingMatch[1] : name;

      // Get first paragraph for description
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const description = lines[0] ? lines[0].substring(0, 150) + '...' : '';

      // Determine the folder path (empty string for root level files)
      const folder = relativePath || '';

      // Create a unique output filename based on the relative path
      const outputName = relativePath
        ? relativePath.replace(/[/\\]/g, '_') + '_' + name
        : name;

      results.push({
        filename: item,
        name,
        outputName,
        title,
        description,
        content,
        mtime: stats.mtime,
        size: stats.size,
        folder,
        fullPath
      });
    }
  }

  return results;
}

// Find all markdown files recursively
const mdFiles = findMarkdownFiles(rootDir).sort((a, b) => b.mtime - a.mtime);

// Group files by folder for better organization
const filesByFolder = mdFiles.reduce((acc, file) => {
  const folder = file.folder || '根目录';
  if (!acc[folder]) {
    acc[folder] = [];
  }
  acc[folder].push(file);
  return acc;
}, {});

console.log(`Found ${mdFiles.length} markdown files in ${Object.keys(filesByFolder).length} folders`);

// Generate HTML for each markdown file
mdFiles.forEach(file => {
  const htmlContent = marked(file.content);
  const html = generateDocumentPage(file, htmlContent, mdFiles, filesByFolder);
  fs.writeFileSync(path.join(distDir, `${file.outputName}.html`), html);
  console.log(`Generated: ${file.outputName}.html`);
});

// Generate index page (dashboard)
const indexHtml = generateIndexPage(mdFiles, filesByFolder);
fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml);
console.log('Generated: index.html');

// Generate CSS
const css = generateCSS();
fs.writeFileSync(path.join(distDir, 'styles.css'), css);
console.log('Generated: styles.css');

console.log('\nBuild complete! Output in dist/');

// Template functions
function generateIndexPage(files, filesByFolder) {
  // Get sorted folder names with '根目录' (root) first
  const sortedFolders = Object.keys(filesByFolder).sort((a, b) => {
    if (a === '根目录') return -1;
    if (b === '根目录') return 1;
    return a.localeCompare(b, 'zh-CN');
  });

  const folderSections = sortedFolders.map(folder => {
    const folderFiles = filesByFolder[folder];
    const cards = folderFiles.map(file => `
      <a href="${file.outputName}.html" class="card">
        <div class="card-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <h2 class="card-title">${file.title}</h2>
        <p class="card-description">${file.description}</p>
        <div class="card-meta">
          <span class="card-date">${formatDate(file.mtime)}</span>
          <span class="card-size">${formatSize(file.size)}</span>
        </div>
      </a>
    `).join('\n');

    return `
      <section class="folder-section" id="${encodeURIComponent(folder)}">
        <h2 class="folder-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          ${folder}
          <span class="folder-count">${folderFiles.length} 篇</span>
        </h2>
        <div class="cards-grid">
          ${cards}
        </div>
      </section>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>工作文档仓库</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <header class="header">
      <h1 class="header-title">工作文档仓库</h1>
      <p class="header-subtitle">Stock Investment Documentation Dashboard</p>
      <div class="header-stats">
        <span class="stat">${files.length} 篇文档</span>
        <span class="stat-divider">|</span>
        <span class="stat">${sortedFolders.length} 个文件夹</span>
        <span class="stat-divider">|</span>
        <span class="stat">最后更新: ${formatDate(Math.max(...files.map(f => f.mtime)))}</span>
      </div>
    </header>

    <nav class="folder-nav">
      <h3 class="folder-nav-title">快速导航</h3>
      <div class="folder-nav-links">
        ${sortedFolders.map(folder => `<a href="#${encodeURIComponent(folder)}" class="folder-nav-link">${folder} (${filesByFolder[folder].length})</a>`).join('\n')}
      </div>
    </nav>

    <main class="main">
      ${folderSections}
    </main>

    <footer class="footer">
      <p>工作相关笔记</p>
    </footer>
  </div>
</body>
</html>`;
}

function generateDocumentPage(file, htmlContent, allFiles, filesByFolder) {
  // Get sorted folder names with '根目录' (root) first
  const sortedFolders = Object.keys(filesByFolder).sort((a, b) => {
    if (a === '根目录') return -1;
    if (b === '根目录') return 1;
    return a.localeCompare(b, 'zh-CN');
  });

  const nav = sortedFolders.map(folder => {
    const folderFiles = filesByFolder[folder];
    const folderLinks = folderFiles.map(f =>
      `<a href="${f.outputName}.html" class="nav-link ${f.outputName === file.outputName ? 'active' : ''}">${f.title}</a>`
    ).join('\n');

    return `
      <div class="nav-folder">
        <div class="nav-folder-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>${folder}</span>
        </div>
        <div class="nav-folder-content">
          ${folderLinks}
        </div>
      </div>
    `;
  }).join('\n');

  // Show breadcrumb path for files in subfolders
  const breadcrumb = file.folder
    ? `<div class="doc-breadcrumb">${file.folder.replace(/[/\\]/g, ' / ')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${file.title} - 工作文档仓库</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="doc-container">
    <aside class="sidebar">
      <a href="index.html" class="sidebar-logo">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span>工作文档仓库</span>
      </a>
      <nav class="sidebar-nav">
        <h3 class="nav-title">文档列表</h3>
        ${nav}
      </nav>
    </aside>

    <main class="doc-main">
      <article class="doc-content">
        <header class="doc-header">
          ${breadcrumb}
          <h1>${file.title}</h1>
          <div class="doc-meta">
            <span>更新时间: ${formatDate(file.mtime)}</span>
            <span>文件大小: ${formatSize(file.size)}</span>
          </div>
        </header>
        <div class="markdown-body">
          ${htmlContent}
        </div>
      </article>
    </main>
  </div>
</body>
</html>`;
}

function generateCSS() {
  return `/* Reset and Base Styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --primary-color: #2563eb;
  --primary-hover: #1d4ed8;
  --bg-color: #f8fafc;
  --card-bg: #ffffff;
  --text-color: #1e293b;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --sidebar-bg: #1e293b;
  --sidebar-text: #e2e8f0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  line-height: 1.6;
}

/* Dashboard Styles */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  min-height: 100vh;
}

.header {
  text-align: center;
  margin-bottom: 3rem;
  padding: 2rem;
  background: linear-gradient(135deg, var(--primary-color), #7c3aed);
  border-radius: 1rem;
  color: white;
}

.header-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.header-subtitle {
  font-size: 1.1rem;
  opacity: 0.9;
  margin-bottom: 1rem;
}

.header-stats {
  font-size: 0.9rem;
  opacity: 0.8;
}

.stat-divider {
  margin: 0 0.5rem;
}

/* Folder Navigation */
.folder-nav {
  background: var(--card-bg);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 1px solid var(--border-color);
}

.folder-nav-title {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.folder-nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.folder-nav-link {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: var(--bg-color);
  border-radius: 0.5rem;
  text-decoration: none;
  color: var(--text-color);
  font-size: 0.875rem;
  transition: all 0.15s ease;
  border: 1px solid var(--border-color);
}

.folder-nav-link:hover {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

/* Folder Sections */
.folder-section {
  margin-bottom: 3rem;
}

.folder-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid var(--border-color);
  color: var(--text-color);
  scroll-margin-top: 2rem;
}

.folder-title svg {
  color: var(--primary-color);
}

.folder-count {
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: auto;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.card {
  background: var(--card-bg);
  border-radius: 0.75rem;
  padding: 1.5rem;
  text-decoration: none;
  color: inherit;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  border: 1px solid var(--border-color);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.card-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, var(--primary-color), #7c3aed);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 1rem;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.card-description {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.footer {
  text-align: center;
  margin-top: 3rem;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* Document Page Styles */
.doc-container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 280px;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  padding: 1.5rem;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: white;
  text-decoration: none;
  font-weight: 600;
  font-size: 1.1rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 1.5rem;
}

.nav-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 0.75rem;
}

.nav-link {
  display: block;
  padding: 0.625rem 0.75rem;
  color: var(--sidebar-text);
  text-decoration: none;
  border-radius: 0.375rem;
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
  transition: all 0.15s ease;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.1);
}

.nav-link.active {
  background: var(--primary-color);
  color: white;
}

/* Sidebar Folder Navigation */
.nav-folder {
  margin-bottom: 1rem;
}

.nav-folder-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.nav-folder-content {
  padding-left: 0.5rem;
}

/* Document Breadcrumb */
.doc-breadcrumb {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-color);
  border-radius: 0.375rem;
  display: inline-block;
}

.doc-main {
  flex: 1;
  margin-left: 280px;
  padding: 2rem 3rem;
}

.doc-content {
  max-width: 800px;
  margin: 0 auto;
}

.doc-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.doc-header h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.doc-meta {
  display: flex;
  gap: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Markdown Content Styles */
.markdown-body {
  line-height: 1.8;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  font-weight: 600;
}

.markdown-body h1 { font-size: 1.75rem; }
.markdown-body h2 { font-size: 1.5rem; }
.markdown-body h3 { font-size: 1.25rem; }
.markdown-body h4 { font-size: 1.1rem; }

.markdown-body p {
  margin-bottom: 1rem;
}

.markdown-body ul,
.markdown-body ol {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.markdown-body li {
  margin-bottom: 0.5rem;
}

.markdown-body code {
  background: #f1f5f9;
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
  font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
}

.markdown-body pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin-bottom: 1rem;
}

.markdown-body pre code {
  background: none;
  padding: 0;
  color: inherit;
}

.markdown-body blockquote {
  border-left: 4px solid var(--primary-color);
  padding-left: 1rem;
  margin: 1rem 0;
  color: var(--text-muted);
  font-style: italic;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid var(--border-color);
  padding: 0.75rem;
  text-align: left;
}

.markdown-body th {
  background: #f8fafc;
  font-weight: 600;
}

.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

.markdown-body a {
  color: var(--primary-color);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 2rem 0;
}

/* Responsive Design */
@media (max-width: 768px) {
  .container {
    padding: 1rem;
  }

  .header-title {
    font-size: 1.75rem;
  }

  .cards-grid {
    grid-template-columns: 1fr;
  }

  .sidebar {
    width: 100%;
    height: auto;
    position: relative;
  }

  .doc-main {
    margin-left: 0;
    padding: 1rem;
  }

  .doc-container {
    flex-direction: column;
  }
}
`;
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
