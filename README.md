# Cloud Storage MCP Server

A Model Context Protocol (MCP) server for Google Cloud Storage that enables interactions with Google Cloud Storage buckets and files.

## Features

- List Cloud Storage buckets in a project
- Get details of a specific bucket
- List files in a bucket
- Get details of a specific file
- Upload files to a bucket
- Download files from a bucket
- Delete files from a bucket

## Setup

1. **Install dependencies**:
   ```
   npm install
   ```

2. **Build the project**:
   ```
   npm run build
   ```

3. **Configure Claude Desktop**:
   Add the following to your `claude_desktop_config.json`:

   ```json
   "cloudstorage-mcp": {
     "command": "node",
     "args": [
       "/path/to/cloudstorage-mcp/build/index.js"
     ],
     "env": {
       "GOOGLE_CLOUD_PROJECTS": "project-id1,project-id2"
     }
   }
   ```

   Replace the path in args with the actual path to index.js.
   
   Define a comma-separated list of project IDs in GOOGLE_CLOUD_PROJECTS.
   Example: `google-project-id1,google-project-id2`
   The first listed project is the default.
   
   The application expects to find .json credential file(s) in the keys folder for each project.
   Example: keys/google-project-id1.json
   
   Ensure the relevant cloud service account has appropriate permission to interact with Cloud Storage, e.g. `Storage Admin` or lesser permission(s).

### Available Tools

- `listBuckets`: List all Cloud Storage buckets in a project
- `getBucket`: Get details of a specific Cloud Storage bucket
- `listFiles`: List files in a Cloud Storage bucket
- `getFile`: Get details of a specific file in a Cloud Storage bucket
- `uploadFile`: Upload a file to a Cloud Storage bucket
- `downloadFile`: Download a file from a Cloud Storage bucket
- `deleteFile`: Delete a file from a Cloud Storage bucket

## Example Usage in Claude Desktop

Here are examples of how to use each tool in Claude Desktop:

### List Buckets

```
List all buckets in my Google Cloud project.
```

### Get Files in a Bucket

```
Show me all files in the backup-data bucket.
```

### Get File Details

```
Get details of the file reports/monthly_report.pdf in the data-analysis bucket.
```

## Development

```bash
# Watch mode
npm run dev
```