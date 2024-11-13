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

    private async validateJsonFile(filePath: string, schema: any): Promise<{ isValid: boolean; content?: any; errors?: string[] }> {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const jsonContent = JSON.parse(fileContent);
            
            const validate = this.ajv.compile(schema);
            if (validate(jsonContent)) {
                return { isValid: true, content: jsonContent };
            } else {
                const errors = validate.errors?.map(error => 
                    `${error.instancePath} ${error.message}`
                ) || [];
                return { isValid: false, errors };
            }
        } catch (error) {
            if (error instanceof Error) {
                return { isValid: false, errors: [error.message] };
            }
            return { isValid: false, errors: ['Unknown error occurred while validating JSON file'] };
        }
    }

    public async openJsonEditor(options: { useDefaults?: boolean; sourceFile?: vscode.Uri } = {}) {
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
                // Always fetch schema
                const schema = await this.fetchSchema();
                
                // Determine the configuration source
                let config: any;
                
                if (options.sourceFile) {
                    // Validate the source file against the schema
                    const validation = await this.validateJsonFile(options.sourceFile.fsPath, schema);
                    
                    if (!validation.isValid) {
                        const viewDetails = 'View Details';
                        const response = await vscode.window.showErrorMessage(
                            'The selected file has validation errors and cannot be loaded.',
                            viewDetails
                        );

                        if (response === viewDetails) {
                            const errorDoc = await vscode.workspace.openTextDocument({
                                content: `Validation Errors:\n\n${validation.errors?.join('\n')}`,
                                language: 'text'
                            });
                            await vscode.window.showTextDocument(errorDoc);
                        }
                        return;
                    }
                    
                    config = validation.content;
                } else if (options.useDefaults) {
                    config = extractSchemaDefaults(schema);
                } else {
                    config = await this.fetchConfig();
                }

                fs.writeFileSync(
                    this.tempFilePath, 
                    JSON.stringify(config, null, 2),
                    'utf-8'
                );

                const uri = vscode.Uri.file(this.tempFilePath);
                const document = await vscode.workspace.openTextDocument(uri);
                this.trackedEditor = await vscode.window.showTextDocument(document);

                await this.setJsonSchema(uri, schema);

                this.closeSubscription = vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
                    if (this.trackedEditor && !editors.some(e => e.document.uri.fsPath === this.tempFilePath)) {
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
                const submit = await vscode.window.showInformationMessage(
                    'Do you want to submit this configuration?',
                    'Yes',
                    'No'
                );

                if (submit === 'Yes') {
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

                const saveAs = await vscode.window.showInformationMessage(
                    'Do you want to store this configuration for future use?',
                    'Yes',
                    'No'
                );

                if (saveAs === 'Yes') {
                    // Show save file dialog
                    const uri = await vscode.window.showSaveDialog({
                        filters: {
                            'JSON files': ['json']
                        },
                        title: 'Save Configuration File',
                        saveLabel: 'Save Configuration',
                        defaultUri: vscode.Uri.file('config.json')
                    });

                    if (uri) {
                        try {
                            // Convert the configuration to a pretty-printed JSON string
                            const jsonString = JSON.stringify(jsonContent, null, 2);
                            
                            // Write the file using VS Code's workspace API
                            await vscode.workspace.fs.writeFile(
                                uri,
                                Buffer.from(jsonString, 'utf8')
                            );
                            
                            vscode.window.showInformationMessage('Configuration file saved successfully');
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                            vscode.window.showErrorMessage(`Failed to save configuration file: ${errorMessage}`);
                        }
                    }
                }   
            } else {
                const errors = validate.errors?.map(error => 
                    `${error.instancePath} ${error.message}`
                ).join('\n');
                
                const viewDetails = 'View Details';
                const response = await vscode.window.showErrorMessage(
                    'Configuration has validation errors. \n Changes were not saved.',
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

interface JSONSchemaDefinition {
    $schema?: string;
    type?: string;
    properties?: Record<string, JSONSchemaDefinition>;
    items?: JSONSchemaDefinition;
    default?: any;
    enum?: any[];
    description?: string;
    minimum?: number;
    maximum?: number;
    required?: string[];
}

type DefaultValue = string | number | boolean | null | Record<string, any> | any[];

/**
 * Extracts default values from a JSON Schema and creates a default configuration object
 * @param {JSONSchemaDefinition} schema - The JSON Schema object
 * @param {DefaultValue} [undefinedValue=null] - Value to use when no default is specified
 * @returns {DefaultValue} Object containing the default values
 */
function extractSchemaDefaults(
    schema: JSONSchemaDefinition,
    undefinedValue: DefaultValue = null
): DefaultValue {
    // Handle non-object schemas
    if (!schema || typeof schema !== 'object') {
        return undefinedValue;
    }

    // Handle arrays
    if (schema.type === 'array' && schema.items) {
        return Array.isArray(schema.default) ? schema.default : undefinedValue;
    }

    // Handle primitive types
    if (schema.type && schema.type !== 'object') {
        return schema.default !== undefined ? schema.default : undefinedValue;
    }

    // Handle objects
    if (schema.properties) {
        const defaults: Record<string, DefaultValue> = {};
        
        for (const [key, value] of Object.entries(schema.properties)) {
            // Recursively process nested objects
            defaults[key] = extractSchemaDefaults(value, undefinedValue);
        }
        
        // If the schema itself has a default, use it instead
        return schema.default !== undefined ? schema.default : defaults;
    }

    return schema.default !== undefined ? schema.default : undefinedValue;
}
