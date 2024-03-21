/***************************************************************************************
 * Copyright (c) 2024 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as vscode from 'vscode';

export type ResourceType = 'File' | 'Folder';
export type ResourceTypeQuickPickItem = vscode.QuickPickItem & { type: ResourceType };

export class TraceExplorerResourceTypeHandler {
    private static instance: TraceExplorerResourceTypeHandler;
    private doHandleFiles = true;
    private doHandleFolders = true;
    private quickpickItems: ResourceTypeQuickPickItem[] = [
        { label: 'File', type: 'File' },
        { label: 'Folder', type: 'Folder' }
    ];

    private constructor() {
        /** Empty constructor */
    }

    public static getInstance(): TraceExplorerResourceTypeHandler {
        if (!TraceExplorerResourceTypeHandler.instance) {
            TraceExplorerResourceTypeHandler.instance = new TraceExplorerResourceTypeHandler();
        }
        return TraceExplorerResourceTypeHandler.instance;
    }

    /**
     * Updates the stored value of whether files and/or folders should be handled by the extension
     *
     * @param handleFiles  trace files to be handled
     * @param handleFolders trace folders to be handled
     */
    setHandleResourceTypes(handleFiles: boolean | undefined, handleFolders: boolean | undefined): void {
        if (handleFiles !== undefined) {
            this.doHandleFiles = handleFiles;
        }
        if (handleFolders !== undefined) {
            this.doHandleFolders = handleFolders;
        }
    }

    /**
     * Checks if trace folders are handled to by the extension
     *
     * @returns true if folders are handled
     */
    handleFolders(): boolean {
        return this.doHandleFolders;
    }

    /**
     * Checks if trace files are handled to by the extension
     * @returns true if files are handled
     */
    handleFiles(): boolean {
        return this.doHandleFiles;
    }

    /**
     * Detects what resource type should be handled by the extension based on the set values.
     * If both file and folder resource types are to be handled, a quick pick is prompted to let the user
     * decide which type should be handled.
     *
     * @returns TraceResourceType to be handled
     */
    async detectOrPromptForTraceResouceType(): Promise<ResourceType | undefined> {
        // Try to figure out from context set
        if (this.handleFiles() && !this.handleFolders()) {
            return 'File';
        } else if (!this.handleFiles() && this.handleFolders()) {
            return 'Folder';
        } else {
            const selection = await vscode.window.showQuickPick(this.quickpickItems, {
                title: 'Select the trace resource type to open'
            });
            if (!selection) return undefined;
            return selection.type;
        }
    }
}
