import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

// Loading animation frames
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frameIndex = 0;
let spinnerInterval;
let currentStatusMessage = '';
let processedItems = 0;
let totalItems = 0;
let isSpinnerActive = false;

// Load environment variables
dotenv.config();

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Tree node structure to represent Notion pages
class TreeNode {
  constructor(id, title, type, url = null) {
    this.id = id;
    this.title = title;
    this.type = type; // 'page', 'database', etc.
    this.url = url;   // Notion URL if available
    this.children = [];
  }

  addChild(node) {
    this.children.push(node);
  }
}

// Start spinner animation
function startSpinner(initialMessage = 'Processing...') {
  currentStatusMessage = initialMessage;
  isSpinnerActive = true;
  
  // Clear the current line before starting
  process.stdout.write('\r\x1b[K');
  
  spinnerInterval = setInterval(() => {
    const frame = frames[frameIndex];
    frameIndex = (frameIndex + 1) % frames.length;
    
    // Build progress message
    let progressMessage = '';
    if (totalItems > 0) {
      const percentage = Math.round((processedItems / totalItems) * 100);
      progressMessage = `[${processedItems}/${totalItems}, ${percentage}%] `;
    }
    
    // Clear the current line and update with new spinner frame and message
    process.stdout.write(`\r${chalk.cyan(frame)} ${progressMessage}${currentStatusMessage}`);
  }, 80);
}

// Update spinner message
function updateSpinnerMessage(message) {
  currentStatusMessage = message;
}

// Update progress counter
function updateProgressCounter(processed, total = null) {
  processedItems = processed;
  if (total !== null) {
    totalItems = total;
  }
}

// Stop spinner animation
function stopSpinner(finalMessage = null) {
  if (!isSpinnerActive) return;
  
  clearInterval(spinnerInterval);
  isSpinnerActive = false;
  
  // Clear the current line
  process.stdout.write('\r\x1b[K');
  
  // Print final message if provided
  if (finalMessage) {
    console.log(finalMessage);
  }
}

// Main function to generate and export the tree
async function exportNotionTree() {
  try {
    console.log(chalk.blue('🔍 Generating Notion page tree...'));
    
    // Start spinner for fetching root items
    startSpinner('Searching for workspace pages and databases...');
    
    // Get all pages and databases at the workspace level first
    const rootNodes = await fetchRootItems();
    
    stopSpinner();
    console.log(chalk.blue(`Found ${rootNodes.length} root items. Building tree structure...`));
    
    // Reset counters for the tree building phase
    processedItems = 0;
    totalItems = rootNodes.length;
    
    // Start spinner for building the tree
    startSpinner('Building tree structure...');
    
    // Process each root node to build the tree
    const tree = [];
    for (let i = 0; i < rootNodes.length; i++) {
      const rootNode = rootNodes[i];
      updateSpinnerMessage(`Processing ${chalk.green(rootNode.title)}...`);
      const node = await buildTreeRecursively(rootNode);
      tree.push(node);
      updateProgressCounter(i + 1);
    }
    
    stopSpinner(chalk.blue('✅ Tree structure built successfully!'));
    
    // Display the tree
    console.log(chalk.blue('🌳 Displaying tree structure:'));
    displayTree(tree);
    
    // Export the tree to files
    startSpinner('Generating Markdown export...');
    await exportTreeToMarkdown(tree);
    stopSpinner();
    
    startSpinner('Generating ASCII tree export...');
    await exportTreeToASCIIMarkdown(tree);
    stopSpinner();
    
    startSpinner('Generating JSON export...');
    await exportTreeToJSON(tree);
    stopSpinner();
    
    console.log(chalk.green('✅ Tree generation and export complete!'));
  } catch (error) {
    stopSpinner();
    console.error(chalk.red('Error generating tree:'), error.message);
    if (error.code === 'unauthorized') {
      console.error(chalk.yellow('Make sure your Notion API key is correct and the integration has the necessary permissions.'));
    }
  }
}

// Fetch root-level pages and databases
async function fetchRootItems() {
  const rootItems = [];
  let pagesProcessed = 0;
  
  try {
    // Search for all pages the integration has access to
    updateSpinnerMessage('Searching for pages...');
    const response = await notion.search({
      filter: {
        value: 'page',
        property: 'object'
      },
      page_size: 100,
    });
    
    // Filter for only workspace-level pages (no parent page)
    for (const result of response.results) {
      if (result.parent.type === 'workspace') {
        const title = getPageTitle(result);
        rootItems.push({
          id: result.id,
          title,
          type: result.object,
          parent: result.parent,
          url: result.url,
        });
      }
      pagesProcessed++;
      updateSpinnerMessage(`Found ${pagesProcessed} pages...`);
    }
    
    // Also search for databases at the workspace level
    updateSpinnerMessage('Searching for databases...');
    const dbResponse = await notion.search({
      filter: {
        value: 'database',
        property: 'object'
      },
      page_size: 100,
    });
    
    let dbProcessed = 0;
    for (const result of dbResponse.results) {
      if (result.parent.type === 'workspace') {
        const title = getDatabaseTitle(result);
        rootItems.push({
          id: result.id,
          title,
          type: result.object,
          parent: result.parent,
          url: result.url,
        });
      }
      dbProcessed++;
      updateSpinnerMessage(`Found ${pagesProcessed} pages and ${dbProcessed} databases...`);
    }
  } catch (error) {
    updateSpinnerMessage(`Error finding root items: ${error.message}`);
    throw error;
  }
  
  return rootItems;
}

// Global counter for progress tracking
let totalNodesProcessed = 0;

// Recursively build the tree for a given node
async function buildTreeRecursively(item) {
  const node = new TreeNode(item.id, item.title, item.type, item.url);
  totalNodesProcessed++;
  
  if (totalNodesProcessed % 5 === 0) {
    updateSpinnerMessage(`Building tree... (${totalNodesProcessed} nodes processed)`);
  }
  
  if (item.type === 'database') {
    // For databases, fetch all pages in the database
    const pages = await fetchDatabasePages(item.id);
    for (const page of pages) {
      const childNode = await buildTreeRecursively(page);
      node.addChild(childNode);
    }
  } else if (item.type === 'page') {
    // For pages, fetch child blocks
    const children = await fetchPageChildren(item.id);
    for (const child of children) {
      const childNode = await buildTreeRecursively(child);
      node.addChild(childNode);
    }
  }
  
  return node;
}

// Fetch all pages in a database
async function fetchDatabasePages(databaseId) {
  const pages = [];
  
  try {
    updateSpinnerMessage(`Fetching pages from database ${databaseId.substr(0, 8)}...`);
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
    });
    
    for (const page of response.results) {
      const title = getPageTitle(page);
      pages.push({
        id: page.id,
        title,
        type: 'page',
        parent: page.parent,
        url: page.url,
      });
    }
    updateSpinnerMessage(`Found ${pages.length} pages in database ${databaseId.substr(0, 8)}`);
  } catch (error) {
    console.error(chalk.yellow(`Error fetching pages from database ${databaseId}:`, error.message));
  }
  
  return pages;
}

// Fetch child blocks of a page that are pages or databases
async function fetchPageChildren(pageId) {
  const children = [];
  let hasMore = true;
  let cursor = undefined;
  
  try {
    updateSpinnerMessage(`Fetching children for page ${pageId.substr(0, 8)}...`);
    
    while (hasMore) {
      const response = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        start_cursor: cursor,
      });
      
      for (const block of response.results) {
        // Check if the block is a child page or child database
        if (block.type === 'child_page') {
          // Get the actual page to get its URL
          try {
            const pageDetails = await notion.pages.retrieve({ page_id: block.id });
            children.push({
              id: block.id,
              title: block.child_page.title,
              type: 'page',
              parent: { type: 'page_id', page_id: pageId },
              url: pageDetails.url,
            });
          } catch (error) {
            // Fallback if we can't retrieve the page details
            children.push({
              id: block.id,
              title: block.child_page.title,
              type: 'page',
              parent: { type: 'page_id', page_id: pageId },
              url: null,
            });
          }
        } else if (block.type === 'child_database') {
          // Get the actual database to get its URL
          try {
            const dbDetails = await notion.databases.retrieve({ database_id: block.id });
            children.push({
              id: block.id,
              title: block.child_database.title,
              type: 'database',
              parent: { type: 'page_id', page_id: pageId },
              url: dbDetails.url,
            });
          } catch (error) {
            // Fallback if we can't retrieve the database details
            children.push({
              id: block.id,
              title: block.child_database.title,
              type: 'database',
              parent: { type: 'page_id', page_id: pageId },
              url: null,
            });
          }
        }
      }
      
      hasMore = response.has_more;
      cursor = response.next_cursor;
      
      if (hasMore) {
        updateSpinnerMessage(`Fetching more children for page ${pageId.substr(0, 8)}...`);
      }
    }
    
    if (children.length > 0) {
      updateSpinnerMessage(`Found ${children.length} child pages/databases in page ${pageId.substr(0, 8)}`);
    }
  } catch (error) {
    console.error(chalk.yellow(`Error fetching children for page ${pageId}:`, error.message));
  }
  
  return children;
}

// Helper function to extract page title
function getPageTitle(page) {
  // Try to get title from properties
  if (page.properties) {
    // Look for a title property
    for (const key in page.properties) {
      const property = page.properties[key];
      if (property.type === 'title' && property.title.length > 0) {
        return property.title.map(text => text.plain_text).join('');
      }
    }
  }
  
  // Fallback for child pages
  if (page.child_page && page.child_page.title) {
    return page.child_page.title;
  }
  
  return 'Untitled';
}

// Helper function to extract database title
function getDatabaseTitle(database) {
  if (database.title && database.title.length > 0) {
    return database.title.map(text => text.plain_text).join('');
  }
  return 'Untitled Database';
}

// Display the tree structure
function displayTree(tree, prefix = '') {
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    const isLast = i === tree.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    
    // Use different colors for different node types
    let nodeDisplay;
    if (node.type === 'database') {
      nodeDisplay = chalk.cyan(`${node.title} (Database)`);
    } else {
      nodeDisplay = chalk.green(node.title);
    }
    
    console.log(`${prefix}${connector}${nodeDisplay}`);
    
    // Recursively display children with proper indentation
    if (node.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      displayTree(node.children, childPrefix);
    }
  }
}

// Export the tree to a Markdown file
async function exportTreeToMarkdown(tree) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(process.cwd(), `notion-tree-${timestamp}.md`);
    
    let content = '# Notion Workspace Structure\n\n';
    content += 'Generated on: ' + new Date().toLocaleString() + '\n\n';
    
    // Helper function to build the markdown tree
    function buildMarkdownTree(nodes, level = 0) {
      let result = '';
      for (const node of nodes) {
        const indent = '  '.repeat(level);
        const nodeType = node.type === 'database' ? ' (Database)' : '';
        const nodeLink = node.url ? `[${node.title}${nodeType}](${node.url})` : `${node.title}${nodeType}`;
        result += `${indent}- ${nodeLink}\n`;
        
        if (node.children.length > 0) {
          result += buildMarkdownTree(node.children, level + 1);
        }
      }
      return result;
    }
    
    content += buildMarkdownTree(tree);
    
    await fs.writeFile(filePath, content, 'utf8');
    console.log(chalk.green(`✅ Tree exported to Markdown file: ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Error exporting tree to Markdown:'), error.message);
  }
}

// Export the tree to a clean ASCII tree format in Markdown file
async function exportTreeToASCIIMarkdown(tree) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(process.cwd(), `notion-tree-ascii-${timestamp}.md`);
    
    let content = '# Notion Workspace Structure - ASCII Tree\n\n';
    content += 'Generated on: ' + new Date().toLocaleString() + '\n\n';
    content += '```\n'; // Start code block for the ASCII tree
    
    // Helper function to build the ASCII tree
    function buildASCIITree(nodes, prefix = '') {
      let result = '';
      
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        
        // Format node display
        let nodeDisplay;
        if (node.type === 'database') {
          nodeDisplay = `${node.title} (Database)`;
          if (node.url) {
            // Include URL as a footnote reference
            nodeDisplay += ` [${i + 1}]`;
          }
        } else {
          nodeDisplay = node.title;
          if (node.url) {
            // Include URL as a footnote reference
            nodeDisplay += ` [${i + 1}]`;
          }
        }
        
        result += `${prefix}${connector}${nodeDisplay}\n`;
        
        // Recursively add children with proper indentation
        if (node.children.length > 0) {
          const childPrefix = prefix + (isLast ? '    ' : '│   ');
          result += buildASCIITree(node.children, childPrefix);
        }
      }
      
      return result;
    }
    
    // Build the ASCII tree
    content += buildASCIITree(tree);
    content += '```\n\n'; // End code block
    
    // Add URL footnotes if any
    let footnoteIndex = 1;
    function addURLFootnotes(nodes) {
      let footnotes = '';
      
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.url) {
          footnotes += `[${footnoteIndex}]: ${node.url}\n`;
          footnoteIndex++;
        }
        
        if (node.children.length > 0) {
          footnotes += addURLFootnotes(node.children);
        }
      }
      
      return footnotes;
    }
    
    // Add footnotes for URLs
    const footnotes = addURLFootnotes(tree);
    if (footnotes) {
      content += '\n### Links\n\n';
      content += footnotes;
    }
    
    await fs.writeFile(filePath, content, 'utf8');
    console.log(chalk.green(`✅ Tree exported to ASCII Markdown file: ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Error exporting tree to ASCII Markdown:'), error.message);
  }
}

// Export the tree to a JSON file
async function exportTreeToJSON(tree) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(process.cwd(), `notion-tree-${timestamp}.json`);
    
    const data = {
      generated: new Date().toISOString(),
      tree: tree
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(chalk.green(`✅ Tree exported to JSON file: ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Error exporting tree to JSON:'), error.message);
  }
}

// Clean up spinner on exit
process.on('exit', () => {
  stopSpinner();
});

// Clean up spinner on ctrl+c
process.on('SIGINT', () => {
  stopSpinner();
  process.exit(0);
});

// Run the main function
exportNotionTree(); 