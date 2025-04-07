#!/usr/bin/env node

/**
 * Cloud Storage MCP Server
 * 
 * This server provides a Model Context Protocol interface for Google Cloud Storage.
 * 
 * Environment variables:
 * - GOOGLE_CLOUD_PROJECTS: Comma-separated list of project-ids
 *   Example: "google-project-id1,google-project-id2"
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Storage } from "@google-cloud/storage";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.resolve(__dirname, "..", "keys");

// Parse project IDs from GOOGLE_CLOUD_PROJECTS environment variable
const projects: string[] = process.env.GOOGLE_CLOUD_PROJECTS ? 
    process.env.GOOGLE_CLOUD_PROJECTS.split(',')
        .map(project => project.trim())
        .filter(project => project) : 
    [];

// Default project is the first one in the list (if any)
const DEFAULT_PROJECT = projects.length > 0 ? projects[0] : '';

if (projects.length === 0) {
    console.error("Warning: GOOGLE_CLOUD_PROJECTS environment variable is not set");
}

// Initialize a map to store Storage clients for each project
const storageClients: Record<string, Storage> = {};

// Function to get Storage client for a specific project
function getStorageClientForProject(projectId: string): Storage {
    if (!storageClients[projectId]) {
        throw new Error(`No Storage client initialized for project: ${projectId}`);
    }
    return storageClients[projectId];
}

// Initialize Storage client for each project
for (const project of projects) {
    try {
        // Construct key path based on project ID
        const keyPath = path.resolve(keysDir, `${project}.json`);
        
        if (!fs.existsSync(keyPath)) {
            console.error(`Warning: No credentials file found for project ${project} at ${keyPath}`);
            continue;
        }
        
        // Read and parse the service account key file
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        
        // Initialize Storage client
        storageClients[project] = new Storage({
            projectId: project,
            credentials: serviceAccount
        });
        
        console.error(`Google Cloud Storage client initialized successfully for project: ${project}`);
    } catch (error) {
        console.error(`Error initializing Google Cloud Storage client for project ${project}:`, error);
    }
}

// Check if at least one project was successfully initialized
if (Object.keys(storageClients).length === 0) {
    console.error("Error: Failed to initialize any Google Cloud Storage clients. Exiting.");
    process.exit(1);
}

// Create MCP server
const server = new Server(
    {
        name: "cloudstorage",
        version: "1.0.0"
    },
    {
        capabilities: {
            tools: {
                listChanged: false
            }
        }
    }
);

// Define empty schema for tools that don't require arguments
const EmptySchema = z.object({});

// Schema definitions
const ProjectSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT)
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_PROJECTS environment variable.",
    path: ["project"]
});

const BucketSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT),
    bucket: z.string().min(1)
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_PROJECTS environment variable.",
    path: ["project"]
});

const FileSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT),
    bucket: z.string().min(1),
    file: z.string().min(1)
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_PROJECTS environment variable.",
    path: ["project"]
});

const UploadFileSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT),
    bucket: z.string().min(1),
    destination: z.string().min(1),
    content: z.string().min(1),
    contentType: z.string().optional()
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_PROJECTS environment variable.",
    path: ["project"]
});

const ListFilesSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT),
    bucket: z.string().min(1),
    prefix: z.string().optional(),
    delimiter: z.string().optional()
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_PROJECTS environment variable.",
    path: ["project"]
});

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "listBuckets",
                description: "List all Cloud Storage buckets in a project",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_PROJECTS env var)"
                        }
                    }
                }
            },
            {
                name: "getBucket",
                description: "Get details of a specific Cloud Storage bucket",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_PROJECTS env var)"
                        },
                        bucket: {
                            type: "string",
                            description: "Name of the bucket"
                        }
                    },
                    required: ["bucket"]
                }
            },
            {
                name: "listFiles",
                description: "List files in a Cloud Storage bucket",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_PROJECTS env var)"
                        },
                        bucket: {
                            type: "string",
                            description: "Name of the bucket"
                        },
                        prefix: {
                            type: "string",
                            description: "Filter files by prefix (folder path)"
                        },
                        delimiter: {
                            type: "string",
                            description: "Delimiter to use (e.g., '/' to get files in a specific folder)"
                        }
                    },
                    required: ["bucket"]
                }
            },
            {
                name: "getFile",
                description: "Get details of a specific file in a Cloud Storage bucket",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_PROJECTS env var)"
                        },
                        bucket: {
                            type: "string",
                            description: "Name of the bucket"
                        },
                        file: {
                            type: "string",
                            description: "Path to the file in the bucket"
                        }
                    },
                    required: ["bucket", "file"]
                }
            },
            {
                name: "uploadFile",
                description: "Upload a file to a Cloud Storage bucket",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_PROJECTS env var)"
                        },
                        bucket: {
                            type: "string",
                            description: "Name of the bucket"
                        },
                        destination: {
                            type: "string",
                            description: "Destination path/filename in the bucket"
                        },
                        content: {
                            type: "string",
                            description: "Content to upload (base64 encoded for binary files)"
                        },
                        contentType: {
                            type: "string",
                            description: "MIME type of the content"
                        }
                    },
                    required: ["bucket", "destination", "content"]
                }
            },
            {
                name: "downloadFile",
                description: "Download a file from a Cloud Storage bucket",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_PROJECTS env var)"
                        },
                        bucket: {
                            type: "string",
                            description: "Name of the bucket"
                        },
                        file: {
                            type: "string",
                            description: "Path to the file in the bucket"
                        }
                    },
                    required: ["bucket", "file"]
                }
            },
            {
                name: "deleteFile",
                description: "Delete a file from a Cloud Storage bucket",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_PROJECTS env var)"
                        },
                        bucket: {
                            type: "string",
                            description: "Name of the bucket"
                        },
                        file: {
                            type: "string",
                            description: "Path to the file in the bucket to delete"
                        }
                    },
                    required: ["bucket", "file"]
                }
            },
            {
                name: "listProjects",
                description: "List all available projects that have been configured",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            }
        ],
    };
});

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "listBuckets") {
            const { project } = ProjectSchema.parse(args);
            
            try {
                const client = getStorageClientForProject(project);
                const [buckets] = await client.getBuckets();
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(buckets.map(bucket => ({
                            name: bucket.name,
                            id: bucket.id,
                            location: bucket.metadata.location,
                            storageClass: bucket.metadata.storageClass,
                            created: bucket.metadata.timeCreated
                        })), null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to list buckets",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "getBucket") {
            const { project, bucket } = BucketSchema.parse(args);
            
            try {
                const client = getStorageClientForProject(project);
                const [bucketInfo] = await client.bucket(bucket).getMetadata();
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(bucketInfo, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Bucket not found or access denied",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "listFiles") {
            const { project, bucket, prefix, delimiter } = ListFilesSchema.parse(args);
            
            try {
                const client = getStorageClientForProject(project);
                const options: { prefix?: string, delimiter?: string } = {};
                
                if (prefix) options.prefix = prefix;
                if (delimiter) options.delimiter = delimiter;
                
                const [files] = await client.bucket(bucket).getFiles(options);
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(files.map(file => ({
                            name: file.name,
                            size: file.metadata.size,
                            contentType: file.metadata.contentType,
                            updated: file.metadata.updated,
                            created: file.metadata.timeCreated
                        })), null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to list files",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "getFile") {
            const { project, bucket, file } = FileSchema.parse(args);
            
            try {
                const client = getStorageClientForProject(project);
                const [metadata] = await client.bucket(bucket).file(file).getMetadata();
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(metadata, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "File not found or access denied",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "uploadFile") {
            const { project, bucket, destination, content, contentType } = UploadFileSchema.parse(args);
            
            try {
                const client = getStorageClientForProject(project);
                const file = client.bucket(bucket).file(destination);
                
                // Check if the content is Base64 encoded
                let fileContent: Buffer;
                try {
                    fileContent = Buffer.from(content, 'base64');
                } catch (e) {
                    // If not Base64, treat as plain text
                    fileContent = Buffer.from(content);
                }
                
                const options: { contentType?: string } = {};
                if (contentType) options.contentType = contentType;
                
                await file.save(fileContent, options);
                
                const [metadata] = await file.getMetadata();
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            success: true,
                            message: `File uploaded successfully to ${bucket}/${destination}`,
                            metadata
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to upload file",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "downloadFile") {
            const { project, bucket, file } = FileSchema.parse(args);
            
            try {
                const client = getStorageClientForProject(project);
                const fileObj = client.bucket(bucket).file(file);
                
                // Check if file exists
                const [exists] = await fileObj.exists();
                if (!exists) {
                    throw new Error(`File ${file} does not exist in bucket ${bucket}`);
                }
                
                // Get the file metadata to determine content type
                const [metadata] = await fileObj.getMetadata();
                
                // Download the file
                const [content] = await fileObj.download();
                
                // For text files, convert to string
                let fileContent = '';
                const contentType = metadata.contentType;
                const isTextFile = contentType && (
                    contentType.startsWith('text/') || 
                    contentType.includes('json') || 
                    contentType.includes('xml') ||
                    contentType.includes('javascript') ||
                    contentType.includes('html')
                );
                
                if (isTextFile) {
                    fileContent = content.toString('utf-8');
                } else {
                    // For binary files, return base64 encoded
                    fileContent = content.toString('base64');
                }
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            name: file,
                            contentType: metadata.contentType,
                            size: metadata.size,
                            content: fileContent,
                            encoding: isTextFile ? 'utf-8' : 'base64'
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to download file",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "deleteFile") {
            const { project, bucket, file } = FileSchema.parse(args);
            
            try {
                const client = getStorageClientForProject(project);
                
                // Check if file exists
                const [exists] = await client.bucket(bucket).file(file).exists();
                if (!exists) {
                    throw new Error(`File ${file} does not exist in bucket ${bucket}`);
                }
                
                await client.bucket(bucket).file(file).delete();
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            success: true,
                            message: `File ${file} deleted successfully from bucket ${bucket}`
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to delete file",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "listProjects") {
            EmptySchema.parse(args);
            
            // Return information about projects and default settings
            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        projects,
                        defaultProject: DEFAULT_PROJECT,
                        initializedProjects: Object.keys(storageClients),
                        currentEnv: process.env.GOOGLE_CLOUD_PROJECTS || "Not set"
                    }, null, 2) 
                }]
            };
        }
        else {
            throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        error: "Invalid arguments",
                        details: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
                    }, null, 2)
                }]
            };
        }
        
        return {
            content: [{ 
                type: "text", 
                text: JSON.stringify({
                    error: "Internal server error",
                    message: (error as Error).message
                }, null, 2)
            }]
        };
    }
});

// Start the server
async function main() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Cloud Storage MCP Server running on stdio");
    } catch (error) {
        console.error("Error during startup:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});