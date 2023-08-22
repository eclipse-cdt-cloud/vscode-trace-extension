/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as vscode from 'vscode';

/**
 * Manages webview panels and webviews creation events
 */
export class TraceExtensionWebviewManager {
    private webviews: vscode.WebviewView[] = [];
    private webviewCreated: vscode.EventEmitter<vscode.WebviewView> = new vscode.EventEmitter();
    private webviewPanelCreated: vscode.EventEmitter<vscode.WebviewPanel> = new vscode.EventEmitter();
    private isManagerDisposed = false;

    getAllActiveWebviews(): vscode.WebviewView[] {
        if (!this.isDisposed()) {
            return this.webviews;
        }
        return [];
    }

    fireWebviewCreated(_webview: vscode.WebviewView): void {
        if (!this.isDisposed()) {
            this.addWebview(_webview);
            this.webviewCreated.fire(_webview);
        }
    }

    fireWebviewPanelCreated(_webviewPanel: vscode.WebviewPanel): void {
        if (!this.isDisposed()) {
            this.webviewPanelCreated.fire(_webviewPanel);
        }
    }

    onWebviewCreated(listener: (data: vscode.WebviewView) => unknown): void {
        if (!this.isDisposed()) {
            this.webviewCreated.event(listener);
        }
    }

    onWebviewPanelCreated(listener: (data: vscode.WebviewPanel) => unknown): void {
        if (!this.isDisposed()) {
            this.webviewPanelCreated.event(listener);
        }
    }

    dispose(): void {
        if (!this.isDisposed()) {
            this.webviews = [];
            this.webviewCreated.dispose();
            this.webviewPanelCreated.dispose();
            this.isManagerDisposed = true;
        }
    }

    isDisposed(): boolean {
        return this.isManagerDisposed;
    }

    private addWebview(webview: vscode.WebviewView): void {
        // Remove it from the array when the webview disposes
        webview.onDidDispose(() => {
            this.removeWebview(webview);
        });
        this.webviews.push(webview);
    }

    private removeWebview(_webview: vscode.WebviewView): void {
        this.webviews
            .filter(webview => webview === _webview)
            .forEach(webview => {
                const index = this.webviews.indexOf(webview);
                if (index !== -1) {
                    this.webviews.splice(index, 1);
                }
            });
    }
}
