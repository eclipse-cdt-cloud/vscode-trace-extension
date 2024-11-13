import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import Ajv from 'ajv';

export class JsonConfigEditor {
    private readonly ajv: Ajv;
    private tempFilePath: string;
    private isEditing: boolean = false;
    private baseUrl: string = 'http://localhost:3069';
    private trackedEditor?: vscode.TextEditor;
    private closeSubscription?: vscode.Disposable;

    constructor() {
        this.ajv = new Ajv();
        this.tempFilePath = path.join(os.tmpdir(), `vscode-config-${Date.now()}.json`);
    }

    private async fetchWithError(url: string, options?: RequestInit): Promise<any> {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('ECONNREFUSED')) {
                    throw new Error(`Cannot connect to config server at ${this.baseUrl}. Is it running?`);
                }
                throw error;
            }
            throw new Error('Unknown error occurred');
        }
    }

    private async fetchSchema(): Promise<any> {
        return this.fetchWithError(`${this.baseUrl}/schema`);
    }

    private async fetchConfig(): Promise<any> {
        return this.fetchWithError(`${this.baseUrl}/config`);
    }

    private async saveConfig(config: any): Promise<void> {
        await this.fetchWithError(`${this.baseUrl}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config)
        });
    }

    public async openJsonEditor() {
        if (this.isEditing) {
            vscode.window.showInformationMessage('A config editing session is already active');
            return;
        }

        try {
            this.isEditing = true;

            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
            statusBarItem.text = "$(loading~spin) Loading configuration...";
            statusBarItem.show();

            try {
                const [schema, currentConfig] = await Promise.all([
                    this.fetchSchema(),
                    this.fetchConfig()
                ]);

                fs.writeFileSync(
                    this.tempFilePath, 
                    JSON.stringify(currentConfig, null, 2),
                    'utf-8'
                );

                const uri = vscode.Uri.file(this.tempFilePath);
                const document = await vscode.workspace.openTextDocument(uri);
                this.trackedEditor = await vscode.window.showTextDocument(document);

                await this.setJsonSchema(uri, schema);

                // Improved editor close detection
                this.closeSubscription = vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
                    if (this.trackedEditor && !editors.some(e => e.document.uri.fsPath === this.tempFilePath)) {
                        // Editor was closed
                        if (this.closeSubscription) {
                            this.closeSubscription.dispose();
                        }
                        
                        await this.handleDocumentClose(this.trackedEditor.document, schema);
                        this.trackedEditor = undefined;
                        this.isEditing = false;
                    }
                });

            } finally {
                statusBarItem.dispose();
            }

        } catch (error) {
            this.isEditing = false;
            if (error instanceof Error) {
                vscode.window.showErrorMessage(error.message);
            }
        }
    }

    private async handleDocumentClose(document: vscode.TextDocument, schema: any): Promise<void> {
        try {
            const content = document.getText();
            let jsonContent: any;

            try {
                jsonContent = JSON.parse(content);
            } catch (error) {
                vscode.window.showErrorMessage('Invalid JSON format. Please fix the JSON syntax before closing.');
                return;
            }

            // Validate against schema
            const validate = this.ajv.compile(schema);

            if (validate(jsonContent)) {
                // Show confirmation dialog
                const action = await vscode.window.showInformationMessage(
                    'Do you want to save these changes to the server?',
                    'Yes',
                    'No'
                );

                if (action === 'Yes') {
                    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
                    statusBarItem.text = "$(loading~spin) Saving configuration...";
                    statusBarItem.show();

                    try {
                        await this.saveConfig(jsonContent);
                        vscode.window.showInformationMessage('Configuration saved to server successfully');
                    } finally {
                        statusBarItem.dispose();
                    }
                }
            } else {
                const errors = validate.errors?.map(error => 
                    `${error.instancePath} ${error.message}`
                ).join('\n');
                
                const viewDetails = 'View Details';
                const response = await vscode.window.showErrorMessage(
                    'Configuration has validation errors.',
                    viewDetails
                );

                if (response === viewDetails) {
                    // Show errors in new document
                    const errorDoc = await vscode.workspace.openTextDocument({
                        content: `Validation Errors:\n\n${errors}`,
                        language: 'text'
                    });
                    await vscode.window.showTextDocument(errorDoc, { viewColumn: vscode.ViewColumn.Beside });
                }
            }

        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(error.message);
            }
        } finally {
            // Clean up
            if (fs.existsSync(this.tempFilePath)) {
                fs.unlinkSync(this.tempFilePath);
            }
            this.isEditing = false;
            if (this.closeSubscription) {
                this.closeSubscription.dispose();
            }
        }
    }

    private async setJsonSchema(documentUri: vscode.Uri, schema: any): Promise<void> {
        const config = vscode.workspace.getConfiguration('json');
        const schemas = config.get('schemas') as any[] || [];

        // Add or update schema for this document
        const schemaConfig = {
            fileMatch: [documentUri.toString()],
            schema: schema
        };

        const existingIndex = schemas.findIndex(s => 
            s.fileMatch.includes(documentUri.toString())
        );

        if (existingIndex >= 0) {
            schemas[existingIndex] = schemaConfig;
        } else {
            schemas.push(schemaConfig);
        }

        await config.update('schemas', schemas, vscode.ConfigurationTarget.Global);
    }
}
