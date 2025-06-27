#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  format: 'console', // Default output format
  output: null,      // Output file path
  maxDepth: Infinity, // Maximum depth to traverse
  includeUrls: false, // Include URLs in output
  help: false,       // Show help
  asciiTree: false,  // Generate ASCII tree in markdown
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--help' || arg === '-h') {
    options.help = true;
  } else if (arg === '--format' || arg === '-f') {
    options.format = args[++i];
  } else if (arg === '--output' || arg === '-o') {
    options.output = args[++i];
  } else if (arg === '--max-depth' || arg === '-d') {
    options.maxDepth = parseInt(args[++i], 10);
  } else if (arg === '--include-urls' || arg === '-u') {
    options.includeUrls = true;
  } else if (arg === '--ascii' || arg === '-a') {
    options.asciiTree = true;
  }
}

// Show help
if (options.help) {
  console.log(`
${chalk.bold('Notion Tree Generator')}

Generate a tree structure of your Notion pages and databases.

${chalk.bold('Usage:')}
  node cli.js [options]

${chalk.bold('Options:')}
  -h, --help          Show this help message
  -f, --format        Output format: console, markdown, json, or all (default: console)
  -o, --output        Output file path (without extension, default: notion-tree-{timestamp})
  -d, --max-depth     Maximum depth to traverse (default: unlimited)
  -u, --include-urls  Include URLs in the output (default: false)
  -a, --ascii         Generate an ASCII tree markdown file (similar to console output)

${chalk.bold('Examples:')}
  node cli.js                           # Display tree in console
  node cli.js -f markdown               # Export tree to markdown
  node cli.js -f all -o my-notion-tree  # Export to console, markdown, and json with custom filename
  node cli.js -d 2                      # Limit tree depth to 2 levels
  node cli.js -f markdown -u            # Export to markdown with clickable URLs
  node cli.js -a                        # Generate ASCII tree markdown (like console output)
  node cli.js -f all -a                 # Generate all export formats including ASCII tree
  `);
  process.exit(0);
}

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

// Main function to generate the tree
async function generateNotionTree() {
  try {
    console.log(chalk.blue('🔍 Generating Notion page tree...'));
    
    // Check if API key is set
    if (!process.env.NOTION_API_KEY) {
      console.error(chalk.red('Error: NOTION_API_KEY is not set in .env file'));
      console.log(chalk.yellow('Please create a .env file with your Notion API key:'));
      console.log('NOTION_API_KEY=your_notion_integration_token_here');
      process.exit(1);
    }
    
    // Get all pages and databases at the workspace level first
    const rootNodes = await fetchRootItems();
    
    console.log(chalk.blue(`Found ${rootNodes.length} root items. Building tree structure...`));
    
    // Process each root node to build the tree
    const tree = [];
    for (const rootNode of rootNodes) {
      const node = await buildTreeRecursively(rootNode, 0);
      tree.push(node);
    }
    
    // Handle output based on format option
    if (options.format === 'console' || options.format === 'all') {
      displayTree(tree);
    }
    
    if (options.format === 'markdown' || options.format === 'all') {
      await exportTreeToMarkdown(tree);
    }
    
    if (options.format === 'json' || options.format === 'all') {
      await exportTreeToJSON(tree);
    }
    
    // Handle ASCII tree export if requested
    if (options.asciiTree) {
      await exportTreeToASCIIMarkdown(tree);
    }
    
    console.log(chalk.green('✅ Tree generation complete!'));
  } catch (error) {
    console.error(chalk.red('Error generating tree:'), error.message);
    if (error.code === 'unauthorized') {
      console.error(chalk.yellow('Make sure your Notion API key is correct and the integration has the necessary permissions.'));
    }
    process.exit(1);
  }
}

// Fetch root-level pages and databases
async function fetchRootItems() {
  const rootItems = [];
  
  // Search for all pages the integration has access to
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
        url: options.includeUrls ? result.url : null,
      });
    }
  }
  
  // Also search for databases at the workspace level
  const dbResponse = await notion.search({
    filter: {
      value: 'database',
      property: 'object'
    },
    page_size: 100,
  });
  
  for (const result of dbResponse.results) {
    if (result.parent.type === 'workspace') {
      const title = getDatabaseTitle(result);
      rootItems.push({
        id: result.id,
        title,
        type: result.object,
        parent: result.parent,
        url: options.includeUrls ? result.url : null,
      });
    }
  }
  
  return rootItems;
}

// Recursively build the tree for a given node
async function buildTreeRecursively(item, depth) {
  const node = new TreeNode(item.id, item.title, item.type, item.url);
  
  // Stop recursion if we've reached the maximum depth
  if (depth >= options.maxDepth) {
    return node;
  }
  
  if (item.type === 'database') {
    // For databases, fetch all pages in the database
    const pages = await fetchDatabasePages(item.id);
    for (const page of pages) {
      const childNode = await buildTreeRecursively(page, depth + 1);
      node.addChild(childNode);
    }
  } else if (item.type === 'page') {
    // For pages, fetch child blocks
    const children = await fetchPageChildren(item.id);
    for (const child of children) {
      const childNode = await buildTreeRecursively(child, depth + 1);
      node.addChild(childNode);
    }
  }
  
  return node;
}

// Fetch all pages in a database
async function fetchDatabasePages(databaseId) {
  const pages = [];
  
  try {
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
        url: options.includeUrls ? page.url : null,
      });
    }
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
    while (hasMore) {
      const response = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        start_cursor: cursor,
      });
      
      for (const block of response.results) {
        // Check if the block is a child page or child database
        if (block.type === 'child_page') {
          // Get the actual page to get its URL if needed
          let url = null;
          if (options.includeUrls) {
            try {
              const pageDetails = await notion.pages.retrieve({ page_id: block.id });
              url = pageDetails.url;
            } catch (error) {
              // Ignore URL retrieval errors
            }
          }
          
          children.push({
            id: block.id,
            title: block.child_page.title,
            type: 'page',
            parent: { type: 'page_id', page_id: pageId },
            url,
          });
        } else if (block.type === 'child_database') {
          // Get the actual database to get its URL if needed
          let url = null;
          if (options.includeUrls) {
            try {
              const dbDetails = await notion.databases.retrieve({ database_id: block.id });
              url = dbDetails.url;
            } catch (error) {
              // Ignore URL retrieval errors
            }
          }
          
          children.push({
            id: block.id,
            title: block.child_database.title,
            type: 'database',
            parent: { type: 'page_id', page_id: pageId },
            url,
          });
        }
      }
      
      hasMore = response.has_more;
      cursor = response.next_cursor;
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

// Generate output filename based on options
function getOutputFilename() {
  if (options.output) {
    return options.output;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `notion-tree-${timestamp}`;
}

// Export the tree to a Markdown file
async function exportTreeToMarkdown(tree) {
  try {
    const filePath = `${getOutputFilename()}.md`;
    
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
    const baseFilename = getOutputFilename();
    const filePath = `${baseFilename}-ascii.md`;
    
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
    
    // Add footnotes for URLs if include URLs option is enabled
    if (options.includeUrls) {
      const footnotes = addURLFootnotes(tree);
      if (footnotes) {
        content += '\n### Links\n\n';
        content += footnotes;
      }
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
    const filePath = `${getOutputFilename()}.json`;
    
    const data = {
      generated: new Date().toISOString(),
      options: {
        maxDepth: options.maxDepth,
        includeUrls: options.includeUrls
      },
      tree: tree
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(chalk.green(`✅ Tree exported to JSON file: ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Error exporting tree to JSON:'), error.message);
  }
}

// Run the main function
generateNotionTree(); 