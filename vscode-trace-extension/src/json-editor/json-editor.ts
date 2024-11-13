import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as jsoncParser from 'jsonc-parser';
import { Messenger } from 'vscode-messenger';
import { userCustomizedOutput } from 'vscode-trace-common/lib/messages/vscode-messages';
import {
    CustomizationConfigObject,
    CustomizationSubmission,
    Schema,
    SchemaPickerItem
} from 'vscode-trace-common/lib/types/customization';
import { SchemaService } from './schema-service';
import { FileService } from './file-service';

/**
 * Manages editing, validating, and submitting JSON configurations based on schemas
 */
export class JsonConfigEditor {
    private _tempFilePath: string = '';
    private isEditing: boolean = false;
    private availableConfigurations: CustomizationConfigObject[] = [];
    private userClickedSubmit: boolean = false;
    private trackedEditor?: vscode.TextEditor;
    private _selectedConfig?: CustomizationConfigObject;
    private closeSubscription?: vscode.Disposable;

    // Services
    private schemaService: SchemaService;
    private fileService: FileService;

    /**
     * Creates a new instance of the JSON Config Editor
     * @param _messenger The messenger instance for communicating with the extension host
     */
    constructor(private readonly _messenger: Messenger) {
        this.schemaService = new SchemaService();
        this.fileService = new FileService();

        this.registerMessageHandlers();
    }

    /**
     * Registers message handlers for activating JSON editor
     */
    private registerMessageHandlers(): void {
        this._messenger.onRequest(userCustomizedOutput, async ({ configs }) => {
            try {
                this.availableConfigurations = configs;
                const selectedConfig = await this.promptUserSchemaSelection(configs);
                if (!selectedConfig) {
                    return;
                }

                vscode.window.showInformationMessage(`Selected: ${selectedConfig.name || 'Unnamed schema'}`);
                const userConfig = await this.openJsonEditor(selectedConfig);
                return { userConfig };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Error processing schema: ${errorMessage}`);
                console.error(error);
                return undefined;
            }
        });
    }

    /**
     * Opens a JSON editor with the provided schema and configuration
     * @param configObject Configuration object containing the schema
     * @param options Additional options for editing
     * @returns Promise resolving to the edited and validated JSON
     * @throws Error if a config editing session is already active or if the schema is invalid
     */
    public async openJsonEditor(
        configObject: CustomizationConfigObject,
        options: { sourceFile?: vscode.Uri } = {}
    ): Promise<CustomizationSubmission> {
        if (this.isEditing) {
            let errorMsg = 'A config editing session is already active';
            vscode.window.showInformationMessage(errorMsg);
            return Promise.reject(new Error(errorMsg));
        }

        this.selectedConfig = configObject;

        if (!this.selectedConfig || !this.selectedConfig.schema) {
            let errorMsg = 'Invalid configuration schema';
            vscode.window.showErrorMessage(errorMsg);
            return Promise.reject(new Error(errorMsg));
        }

        try {
            this.isEditing = true;
            this.tempFilePath = path.join(os.tmpdir(), this.selectedConfig.id);

            // Create and write config to temp file
            const defaults = this.schemaService.extractSchemaDefaults(this.schema);
            await this.fileService.loadJSONConfigFile(this.tempFileUri, defaults);

            // Open the document
            const document = await vscode.workspace.openTextDocument(this.tempFileUri);
            // JSONC enables comments
            vscode.languages.setTextDocumentLanguage(document, 'jsonc');

            this.trackedEditor = await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Beside
            });
            await this.schemaService.setOpenFileSchema(this.tempFileUri, this.schema);

            // Return a promise that resolves when the editor is closed
            return new Promise<CustomizationSubmission>((resolve, reject) => {
                this.closeSubscription = vscode.window.onDidChangeVisibleTextEditors(async editors => {
                    if (this.trackedEditor && !editors.some(e => e.document.uri.fsPath === this.tempFilePath)) {
                        if (this.closeSubscription) {
                            this.closeSubscription.dispose();
                        }

                        try {
                            const result = await this.handleDocumentClose();
                            if (result) {
                                resolve(result);
                            } else {
                                reject(new Error('Configuration was not submitted'));
                            }
                        } catch (error) {
                            reject(error);
                        } finally {
                            this.trackedEditor = undefined;
                            this.isEditing = false;
                            this.fileService.cleanupTempFile(this.tempFilePath);
                            this.tempFilePath = '';
                        }
                    }
                });
            });
        } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            return Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Validates current configuration and closes the editor if valid
     */
    public async closeIfValid(): Promise<void> {
        if (!this.isEditing || !this.trackedEditor) {
            throw new Error('No active editor to close');
        }

        const validation = await this.fileService.validateJsonFile(this.tempFileUri, this.selectedConfig.schema);

        if (!validation.isValid && validation.errors) {
            await this.displayValidationErrorDialogue(
                `JSON Error - your config was not submitted because it contained validation errors.`,
                validation.errors
            );
            return;
        }

        this.userClickedSubmit = true;
        await vscode.window.showTextDocument(this.trackedEditor.document);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }

    /**
     * Saves the configuration to a user-selected file if it's valid
     * @returns Promise resolving to whether the save was successful
     */
    public async saveDocumentIfValid(): Promise<boolean> {
        if (!this.isEditing || !this.trackedEditor) {
            throw new Error('No active editor to save');
        }

        const validation = await this.fileService.validateJsonFile(this.tempFileUri, this.selectedConfig.schema);

        if (!validation.isValid && validation.errors) {
            await this.displayValidationErrorDialogue(
                'JSON Error - please ensure the schema is valid before saving',
                validation.errors
            );
            return false;
        }

        const uri = await vscode.window.showSaveDialog({
            filters: {
                'JSON files': ['json']
            },
            title: 'Save Configuration File',
            saveLabel: 'Save Configuration',
            defaultUri: vscode.Uri.file(path.join(os.homedir(), 'my-trace-config.json'))
        });

        if (!uri) {
            return false;
        }

        try {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(validation.content, null, 2), 'utf8'));

            vscode.window.showInformationMessage('Configuration file saved successfully');
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            vscode.window.showErrorMessage(`Failed to save configuration file: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Loads an existing configuration file chosen by the user
     */
    public async loadExistingConfig(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            filters: {
                'JSON files': ['json']
            },
            openLabel: 'Load Existing Configuration',
            defaultUri: vscode.Uri.parse(os.homedir()),
            canSelectMany: false,
            canSelectFolders: false
        });

        if (!result) {
            return;
        }

        const uri = result[0];
        const fileName = path.basename(uri.fsPath);

        try {
            // Check if it's valid JSON
            const fileContent = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(fileContent);
            const stripped = jsoncParser.stripComments(text);
            const json = JSON.parse(stripped);

            // Check if it has a valid id
            let matchingConfig = this.availableConfigurations.find(hi => hi.id === json.id);
            if (matchingConfig && matchingConfig.id !== this.selectedConfig.id) {
                this.selectedConfig = matchingConfig;
            }

            const validation = await this.fileService.validateJsonFile(uri, this.selectedConfig.schema);

            if (validation.isValid && validation.content) {
                await this.fileService.loadJSONConfigFile(this.tempFileUri, validation.content);
                vscode.window.showInformationMessage(`Successfully loaded ${fileName}`);
                return;
            }

            const invalidFileResponse = await vscode.window.showErrorMessage(
                `${fileName} has schema errors. Would you like to load it anyway?`,
                'Yes',
                'No'
            );

            if (invalidFileResponse !== 'Yes') {
                return;
            }

            await this.fileService.loadJSONConfigFile(this.tempFileUri, json);
        } catch (error) {
            vscode.window.showErrorMessage(
                error instanceof Error
                    ? error.message
                    : `Unable to load ${fileName} - please ensure the file is valid JSON`
            );
        }
    }

    /**
     * Handles the document close event, validating and possibly submitting the configuration
     * @returns Promise resolving to the configuration content or undefined if not submitted
     */
    private async handleDocumentClose(): Promise<CustomizationSubmission | undefined> {
        const document = this.trackedEditor?.document;
        const schema = this.selectedConfig.schema;

        if (!document || !schema) {
            throw new Error('Missing document or schema during close');
        }

        try {
            // Write content to temp file for validation
            if (fs.existsSync(this.tempFilePath)) {
                fs.writeFileSync(this.tempFilePath, document.getText(), 'utf8');
            } else {
                throw new Error('Temporary file not found');
            }

            const validation = await this.fileService.validateJsonFile(this.tempFileUri, schema);

            if (validation.isValid && validation.content) {
                const submit = this.userClickedSubmit
                    ? 'Yes'
                    : await vscode.window.showInformationMessage(
                          'Do you want to submit this configuration?',
                          'Yes',
                          'No'
                      );

                if (submit === 'Yes') {
                    vscode.window.showInformationMessage('Configuration submitted successfully');
                    return validation.content;
                }

                return undefined; // User chose not to submit
            } else if (validation.errors) {
                await this.displayValidationErrorDialogue(
                    `Your configuration was not submitted because it had errors`,
                    validation.errors
                );
                return undefined;
            }
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Error processing configuration: ${error.message}`);
            }
            return undefined;
        } finally {
            this.fileService.cleanupTempFile(this.tempFilePath);
            this.userClickedSubmit = false;
            this.isEditing = false;
            this.tempFilePath = '';
            if (this.closeSubscription) {
                this.closeSubscription.dispose();
            }
        }
    }

    private async displayValidationErrorDialogue(message: string, errors: string[]): Promise<void> {
        const viewDetails = 'View Details';
        const response = await vscode.window.showErrorMessage(message, viewDetails);

        if (response === viewDetails) {
            // Show errors in new document
            const errorDoc = await vscode.workspace.openTextDocument({
                content: `Validation Errors:\n\n${errors.join('\n')}`,
                language: 'text'
            });
            await vscode.window.showTextDocument(errorDoc, { viewColumn: vscode.ViewColumn.Beside });
        }
    }

    /**
     * Prompts the user to select a schema from a list of options
     * @param options Available configuration schema options
     * @returns Promise resolving to the selected configuration or undefined if cancelled
     */
    private async promptUserSchemaSelection(
        options: CustomizationConfigObject[]
    ): Promise<CustomizationConfigObject | undefined> {
        const schemaOptions = options.map(option => ({
            label: option.name || 'Unnamed schema',
            detail: option.description || '',
            description: option.id || '',
            schemaId: option.id || ''
        })) as SchemaPickerItem[];

        const selectedConfig = await vscode.window.showQuickPick(schemaOptions, {
            placeHolder: 'Select a schema'
        });

        if (selectedConfig) {
            return options.find(option => option.id === selectedConfig.schemaId);
        }

        return undefined;
    }

    set tempFilePath(val: string) {
        // For some reason you can't compare strings but you can search arrays
        // In "when" clause for vscode menu contributions...
        vscode.commands.executeCommand('setContext', 'traceViewer.customization.configPath', [val]);
        this._tempFilePath = val;
    }

    get tempFilePath(): string {
        return this._tempFilePath;
    }

    get tempFileUri(): vscode.Uri {
        return vscode.Uri.file(this.tempFilePath);
    }

    /**
     * Transforms a JSON schema by moving its properties into an "options" object
     * and adding name and description fields at the top level.
     *
     * @param configObject The configuration object containing the schema to transform
     */
    set selectedConfig(configObject: CustomizationConfigObject) {
        // this._selectedConfig = this.transformSchema(config);
        const inputSchema = configObject.schema;
        // Create a new schema with the transformed structure
        const newSchema: Schema = {
            // Copy over the schema metadata
            $schema: inputSchema.$schema,
            $id: inputSchema.$id,
            title: inputSchema.title,
            description: inputSchema.description,
            type: 'object',
            // Create the new properties structure
            properties: {
                id: {
                    const: configObject.id,
                    description: 'The configuration type.  This determines the schema that is used.',
                    default: configObject.id
                },
                name: {
                    type: 'string',
                    description: 'The name for this custom analysis',
                    default: configObject.name
                },
                description: {
                    type: 'string',
                    description: 'Provide a description for how the analysis is modified',
                    default: configObject.description
                },
                options: {
                    type: 'object',
                    description: 'Configuration options',
                    // Copy all the original properties
                    properties: inputSchema.properties || {},
                    // Move the validation rules to the options object
                    oneOf: inputSchema.oneOf,
                    additionalProperties: inputSchema.additionalProperties,
                    required: inputSchema.required
                }
            },
            // Make name required at the top level
            required: ['name', 'id']
        };

        const transformedConfig = { ...configObject };
        transformedConfig.schema = newSchema;
        this._selectedConfig = transformedConfig;
    }

    get selectedConfig(): CustomizationConfigObject {
        return this._selectedConfig as CustomizationConfigObject;
    }

    get schema(): Schema {
        return this.selectedConfig.schema;
    }
}
