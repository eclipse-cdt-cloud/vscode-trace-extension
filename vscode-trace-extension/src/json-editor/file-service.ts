import * as vscode from 'vscode';
import * as fs from 'fs';
import * as jsoncParser from 'jsonc-parser';
import { CustomizationSubmission, DefaultValue, Schema, ValidationResult } from 'vscode-trace-common/lib/types/customization';
import { SchemaService } from './schema-service';

/**
 * Service for handling file operations related to JSON configurations
 */
export class FileService {
    private schemaService: SchemaService;
    private fileWatchers: Map<string, vscode.Disposable>;
    private autoSaveListeners: Map<string, vscode.Disposable>;

    constructor() {
        this.schemaService = new SchemaService();
        this.fileWatchers = new Map();
        this.autoSaveListeners = new Map();
    }

    /**
     * Creates a configuration file from the provided config object
     *
     * This is the physical file that is displayed in the editor
     * @param filePath The file path to write over or create the temp config file
     * @param json The json object to add to the file
     * @param meta Optional metadata for the file header
     */
    public async loadJSONConfigFile(filePath: vscode.Uri, json: DefaultValue): Promise<void> {
        const fileContent = [
            '/**',
            '* A toolbar is located in the top-right',
            '* • Submit the current config',
            '* • Save this config for future use',
            '* • Load an existing config file',
            '*',
            '* You can also submit by simply closing the file',
            '*/',
            JSON.stringify(json, undefined, 2)
        ].join('\n');

        await vscode.workspace.fs.writeFile(filePath, Buffer.from(fileContent, 'utf-8'));
        
        // Setup watcher for this file
        this.watchConfigFile(filePath);
    }

    /**
     * Validates a JSON file against a schema, using current editor content
     * @param fileUri Path to the JSON file
     * @param schema JSON schema to validate against
     * @returns Validation result object
     */
    public async validateJsonFile(fileUri: vscode.Uri, schema: Schema): Promise<ValidationResult> {
        try {
            // Get the TextDocument for the file - this gets current content including unsaved changes
            const document = await vscode.workspace.openTextDocument(fileUri);
            const text = document.getText();

            // Strip comments and parse the JSONC content
            const strippedContent = jsoncParser.stripComments(text);
            const jsonContent = JSON.parse(strippedContent);

            // Create a new validator for this schema to avoid ID conflicts
            const validator = this.schemaService.getValidator(schema);
            if (validator(jsonContent)) {
                return { isValid: true, content: jsonContent as CustomizationSubmission };
            } else {
                const errors = validator.errors?.map(error => `${error.instancePath} ${error.message}`) || [];
                return { isValid: false, errors };
            }
        } catch (error) {
            if (error instanceof Error) {
                return { isValid: false, errors: [error.message] };
            }
            return { isValid: false, errors: ['Unknown error occurred while validating JSON file'] };
        }
    }

    /**
     * Set up a watcher for the config file to enable settings-like behavior
     */
    private watchConfigFile(fileUri: vscode.Uri): void {
        const key = fileUri.toString();
        
        if (this.fileWatchers.has(key)) {
            this.fileWatchers.get(key)?.dispose();
        }
        
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.workspace.getWorkspaceFolder(fileUri)?.uri || fileUri, 
                vscode.workspace.asRelativePath(fileUri))
        );

        
        this.fileWatchers.set(key, watcher);
        this.setupAutoSaveForFile(fileUri);
    }
    
    /**
     * Sets up auto-save functionality for a specific file
     * @param fileUri The URI of the file to auto-save
     * @param delayMs Optional delay in milliseconds before saving (default: 500ms)
     * @private Internal method used by file watchers
     */
    private async setupAutoSaveForFile(fileUri: vscode.Uri, delayMs: number = 250): Promise<void> {
        const key = fileUri.toString();
        
        if (this.autoSaveListeners.has(key)) {
            this.autoSaveListeners.get(key)?.dispose();
            this.autoSaveListeners.delete(key);
        }
        
        let saveTimeout: NodeJS.Timeout | undefined;
        
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            
            const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() === document.uri.toString()) {
                    if (saveTimeout) {
                        clearTimeout(saveTimeout);
                    }
                    
                    saveTimeout = setTimeout(async () => {
                        try {
                            await document.save();
                        } catch (error) {
                            console.error('Failed to auto-save document:', error);
                        }
                    }, delayMs);
                }
            });
            
            // Store the listener
            this.autoSaveListeners.set(key, changeListener);
        } catch (error) {
            console.error(`Failed to set up auto-save for ${fileUri.toString()}:`, error);
        }
    }

    /**
     * Cleans up the temporary file and any watchers
     * @param filePath Path to the temporary file
     */
    public cleanupTempFile(filePath: string): void {
        const fileUri = vscode.Uri.file(filePath);
        const key = fileUri.toString();
        
        if (this.fileWatchers.has(key)) {
            this.fileWatchers.get(key)?.dispose();
            this.fileWatchers.delete(key);
        }
        
        if (this.autoSaveListeners.has(key)) {
            this.autoSaveListeners.get(key)?.dispose();
            this.autoSaveListeners.delete(key);
        }
        
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (error) {
                console.error('Failed to delete temporary file:', error);
            }
        }
    }
    
    /**
     * Dispose all resources
     */
    public dispose(): void {
        for (const watcher of this.fileWatchers.values()) {
            watcher.dispose();
        }
        this.fileWatchers.clear();
        
        for (const listener of this.autoSaveListeners.values()) {
            listener.dispose();
        }
        this.autoSaveListeners.clear();
    }
}