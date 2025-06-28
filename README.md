# Notion Tree Generator

This tool generates a tree-like structure of your Notion pages, similar to a Windows directory tree. It visualizes the hierarchy of your pages and databases in the console and can export the structure to files.

## Features

- Displays all pages and databases in a tree structure
- Color-coded output (green for pages, cyan for databases)
- Handles nested pages and databases
- Supports pagination for large workspaces
- Export tree structure to Markdown and JSON files
- Export clean ASCII tree format in Markdown files (similar to console output)
- Includes page URLs in exported files for easy navigation
- Command-line interface with various options
- Visual progress indicators with spinner animation during generation

## Prerequisites

- Node.js (v14 or higher)
- A Notion integration with API access

## Setup

1. Clone this repository or download the files
2. Install dependencies:
   ```
   pnpm install
   ```
3. Create a Notion integration:
   - Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
   - Click "New integration"
   - Give it a name and select the workspace
   - Copy the "Internal Integration Token"

4. Update the `.env` file with your Notion API token:
   ```
   NOTION_API_KEY=your_notion_integration_token_here
   ```

5. Share your Notion pages with the integration:
   - Open your Notion workspace
   - For each top-level page you want to include, click "Share" and invite your integration

## Usage

### Basic Usage

Run the basic application to display the tree in the console:

```
pnpm start
```

This is equivalent to running `pnpm cli` with default options (console output).

### Export Tree to Files

To generate the tree and export it to Markdown, ASCII tree, and JSON files:

```
pnpm export
```

This will:
1. Display the tree in the console
2. Create a Markdown file with clickable links to your Notion pages
3. Create an ASCII tree Markdown file (similar to console output)
4. Create a JSON file with the complete tree data structure

The exported files will be named with a timestamp (e.g., `notion-tree-2023-06-27T12-34-56.md`, `notion-tree-ascii-2023-06-27T12-34-56.md`).

### Command-Line Interface

The tool includes a powerful CLI with various options:

```
pnpm cli [options]
```

#### Options:

- `-h, --help`: Show help message
- `-f, --format`: Output format: console, markdown, json, or all (default: console)
- `-o, --output`: Output file path (without extension, default: notion-tree-{timestamp})
- `-d, --max-depth`: Maximum depth to traverse (default: unlimited)
- `-u, --include-urls`: Include URLs in the output (default: false)
- `-a, --ascii`: Generate an ASCII tree markdown file (similar to console output)
- `-q, --quiet`: Suppress progress indicators and animations

#### Examples:

```
# Display tree in console
pnpm cli

# Export tree to markdown
pnpm cli -f markdown

# Export to console, markdown, and json with custom filename
pnpm cli -f all -o my-notion-tree

# Limit tree depth to 2 levels
pnpm cli -d 2

# Export to markdown with clickable URLs
pnpm cli -f markdown -u

# Generate ASCII tree markdown (like console output)
pnpm cli -a

# Generate all export formats including ASCII tree
pnpm cli -f all -a

# Run without progress indicators
pnpm cli -q
```

### Global Installation

You can also install the package globally to use the CLI from anywhere:

```
pnpm install -g .
```

Then use the command:

```
notion-tree [options]
```

## Progress Indicators

During tree generation, the tool displays progress indicators to provide feedback:

- A spinner animation shows that the process is ongoing
- Status messages indicate the current operation being performed
- Page/database counters show how many items have been processed
- Percentage completion is displayed for operations with known total items

These indicators help make the process more engaging and informative, especially for large workspaces where tree generation might take some time.

If you prefer not to see these indicators, use the `-q` or `--quiet` option.

## Example Output

### Console and ASCII Tree Output

```
🔍 Generating Notion page tree...
Found 5 root items. Building tree structure...
✅ Tree structure built successfully!
🌳 Displaying tree structure:
├── My Workspace (Database)
│   ├── Project A
│   │   └── Tasks
│   └── Project B
├── Personal Notes
│   ├── Travel Plans
│   └── Reading List
└── Work Documents
    └── Meeting Notes
✅ Tree generation complete!
```

### Markdown Output

- **My Workspace (Database)**
  - **Project A**
    - Tasks
  - **Project B**
- **Personal Notes**
  - Travel Plans
  - Reading List
- **Work Documents**
  - Meeting Notes

## Project Structure

The project consists of two main files:

- `cli.js`: The main entry point that provides a command-line interface with various options
- `export-tree.js`: Specialized script for exporting the tree to all available formats

## Limitations

- The Notion API only allows access to pages that have been explicitly shared with your integration
- The tree generation might take some time for large workspaces with many nested pages
- API rate limits may apply for very large workspaces