import * as vscode from 'vscode';
import * as fs from 'fs';
import { DefaultValue } from 'vscode-trace-common/lib/types/customization';

/**
 * Service for handling file operations related to JSON configurations
 */
export class FileService {
    private fileWatchers: Map<string, vscode.Disposable>;
    private autoSaveListeners: Map<string, vscode.Disposable>;

    constructor() {
        this.fileWatchers = new Map();
        this.autoSaveListeners = new Map();
    }

    /**
     * Creates a configuration file from the provided config object.
     * If there is a file open, it modifies the content instead.
     *
     * This is the physical file that is displayed in the editor
     * @param fileUri The file path to write over or create the temp config file
     * @param json The json object to add to the file
     * @param meta Optional metadata for the file header
     */
    public async loadJSONConfigFile(fileUri: vscode.Uri, json: DefaultValue): Promise<void> {
        const fileContent = [
            '/**',
            '* A toolbar is located in the top-right',
            '* • Submit the current config',
            '* • Save this config for future use',
            '* • Load an existing config file',
            '*/',
            JSON.stringify(json, undefined, 2)
        ].join('\n');

        // First, find the editor that's showing this document
        const openConfigEditor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.toString() === fileUri.toString()
        );

        if (openConfigEditor) {
            // If the editor is open, update its content using edit
            await openConfigEditor.edit(editBuilder => {
                // Replace the entire content
                const fullRange = new vscode.Range(
                    0,
                    0,
                    openConfigEditor.document.lineCount - 1,
                    openConfigEditor.document.lineAt(openConfigEditor.document.lineCount - 1).text.length
                );
                editBuilder.replace(fullRange, fileContent);
            });
        } else {
            // If no editor is open for this file, just write to the file
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(fileContent, 'utf-8'));
        }

        const document = await vscode.workspace.openTextDocument(fileUri);
        await document.save();

        // Setup watcher for this file
        this.watchConfigFile(fileUri);
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
            new vscode.RelativePattern(
                vscode.workspace.getWorkspaceFolder(fileUri)?.uri || fileUri,
                vscode.workspace.asRelativePath(fileUri)
            )
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

        let saveTimeout: ReturnType<typeof setTimeout>;

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
