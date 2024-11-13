import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import Ajv from 'ajv/dist/2020';
import * as jsoncParser from 'jsonc-parser';
import { Messenger } from 'vscode-messenger';
import { userCustomizedOutput } from 'vscode-trace-common/lib/messages/vscode-messages';
import { QuickPickItem } from 'vscode';

// TODO - Change the file name so it doesn't look like a physical saveable file?
// TODO - somehow display View (being modified) and Schema being used

export interface JSONSchema { // TODO this needs to be more rigorous
    $schema: string;
    $id: string;
    title: string;
    description: string,
    type: string,
    properties: SchemaProperty;
    required: string[];
    oneOf: { required: string[] }[];
    additionalProperties: boolean;
}

export interface SchemaProperty {  // TODO is this right?
    type: string;
    description?: string;
    default?: any;
    items?: any;
    [key: string]: any; // To allow for additional property attributes
}

/**
 * Interface representing a JSON Schema
 */
export interface CustomizationSchema {
    id?: string;
    name?: string;
    description?: string;
    schema: JSONSchema
}

type DefaultValue = string | number | boolean | null | Record<string, any> | any[];

export class JsonConfigEditor {
    private readonly ajv = new Ajv();
    private tempFilePath: string = '';
    private isEditing: boolean = false;
    private userClickedSubmit: boolean = false;
    private trackedEditor?: vscode.TextEditor;
    private schema?: Object;
    private closeSubscription?: vscode.Disposable;

    constructor(private readonly _messenger: Messenger) {

        this._messenger.onRequest(userCustomizedOutput, async ({ schemas }) => {
            // TODO remove console.dirs
            console.dir(schemas);
            try {
                const selectedSchema = await this.promptUserSchemaSelection(schemas);
                if (!selectedSchema) {
                    return;
                }
                // @ts-ignore
                vscode.window.showInformationMessage(`Selected: ${selectedSchema.name}`)
                const userConfig = await this.openJsonEditor(selectedSchema);
                return { userConfig };
            } catch (error) {
                console.dir(error);
            }
        });

    }

    /**
     * Opens a JSON editor with the provided schema and configuration
     * @param schema JSON schema to use for validation
     * @param options Additional options for editing
     * @returns Promise resolving to the edited and validated JSON, or undefined if canceled
     */
    public async openJsonEditor(
        schemaObject: any,
        options: { sourceFile?: vscode.Uri } = {}
    ): Promise<Object | undefined> {

        this.schema = schemaObject;

        const { schema, name, id } = schemaObject.schema;

        if (this.isEditing) {
            vscode.window.showInformationMessage('A config editing session is already active');
            return undefined;
        }

        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBarItem.text = "$(loading~spin) Loading configuration...";
        statusBarItem.show();

        try {
            this.isEditing = true;
            this.tempFilePath = path.join(os.tmpdir(), schema.$id);
            this.schema = this.transformAndSetSchema(schema);

            // Create and write config to temp file
            const defaults = this.extractSchemaDefaults(this.schema);
            await this.loadJSONConfigFile(this.tempFileUri, defaults, { name, id });

            // Open the document
            const document = await vscode.workspace.openTextDocument(this.tempFileUri);
            // JSONC enables comments
            vscode.languages.setTextDocumentLanguage(document, "jsonc");

            this.trackedEditor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside });
            await this.setJsonSchema(this.tempFileUri, this.schema);

            statusBarItem.text = "$(edit) Editing configuration...";

            // Return a promise that resolves when the editor is closed
            return new Promise<Object>((resolve, reject) => {
                this.closeSubscription = vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
                    if (this.trackedEditor && !editors.some(e => e.document.uri.fsPath === this.tempFilePath)) {
                        if (this.closeSubscription) {
                            this.closeSubscription.dispose();
                        }

                        try {
                            const result = await this.handleDocumentClose();
                            if (result) {
                                resolve(result);
                            } else {
                                reject(new Error("Failed to process edited configuration"));
                            }
                        } catch (error) {
                            reject(error);
                        } finally {
                            this.trackedEditor = undefined;
                            this.isEditing = false;
                        }
                    }
                });
            });
        } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            return undefined;
        } finally {
            statusBarItem.dispose();
        }
    }

    /**
     * Checks if the current configuration is valid.
     * If it is, closes the file and handles submit
     * If not, inform user and keep config open.
     */
    public async closeIfValid() {
        if (!this.isEditing || !this.trackedEditor) {
            throw Error("Trying to close editor while there are none active");
        }

        const { isValid, errors } = this.validateJsonFile(this.tempFilePath, this.schema);

        if (!isValid && errors) {
            this.displayValidationErrorDialogue(
                `JSON Error - your config was not submitted because it contained validation errors.`,
                errors
            )
        }
        this.userClickedSubmit = true;
        await vscode.window.showTextDocument(this.trackedEditor.document);
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }

    /**
     * Displays the dialogue for saving a config file.
     * If the config is not valid it informs the user.
     * 
     * Resolves when the user finishes all dialogue.
     */
    public async saveDocumentIfValid() {
        if (!this.isEditing || !this.trackedEditor) {
            throw Error("Trying to save editor while there are none active");
        }

        const { isValid, errors, content } = this.validateJsonFile(this.tempFilePath, this.schema);

        if (!isValid && errors) {
            await this.displayValidationErrorDialogue(
                'JSON Error - please ensure the schema is valid before saving',
                errors,
            );
            return;
        }

        const uri = await vscode.window.showSaveDialog({
            filters: {
                'JSON files': ['json']
            },
            title: 'Save Configuration File',
            saveLabel: 'Save Configuration',
            defaultUri: vscode.Uri.file(`${os.homedir()}/my-trace-config.json`)
        });

        if (uri) {
            try {

                await vscode.workspace.fs.writeFile(
                    uri,
                    Buffer.from(JSON.stringify(content, null, 2), 'utf8')
                );

                vscode.window.showInformationMessage('Configuration file saved successfully');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                vscode.window.showErrorMessage(`Failed to save configuration file: ${errorMessage}`);
            }
        }
    }

    /**
     * Displays the dialogue for loading a config file.
     * If the config is not valid it informs the user and allows
     * them to load the invalid file.
     * 
     * Resolves when the user finishes all dialogue.
     */
    public async loadExistingConfig() {
        const result = await vscode.window.showOpenDialog({
            filters: {
                'JSON files': ['json']
            },
            openLabel: 'Load Existing Configuration',
            defaultUri: vscode.Uri.parse(os.homedir()),
            canSelectMany: false,
            canSelectFolders: false,
        });

        if (!result) {
            return;
        }

        const uri = result[0];
        const { isValid, content } = this.validateJsonFile(uri.fsPath, this.schema);
        const fileName = path.basename(uri.fsPath);

        if (isValid) {
            await this.loadJSONConfigFile(this.tempFileUri, content);
            vscode.window.showInformationMessage(`Successfully loaded ${fileName}`);
        } else {

            try {
                const invalidFileResponse = await vscode.window.showErrorMessage(
                    `${fileName} has schema errors.  Would you like to load it anyway?`,
                    'Yes',
                    'No'
                );

                if (invalidFileResponse === 'No') {
                    return;
                }

                // Check if it's even valid JSON.
                const unit8FileContent = await vscode.workspace.fs.readFile(uri);
                const text = new TextDecoder().decode(unit8FileContent);
                const stripped = jsoncParser.stripComments(text);
                const json = JSON.parse(stripped);

                await this.loadJSONConfigFile(this.tempFileUri, json);
            } catch (error) {
                vscode.window.showErrorMessage(error instanceof Error ? error.message : `Unable to load ${fileName} - please ensure the file is valid`);
            }

        }
    }

    private async promptUserSchemaSelection(options: any[]): Promise<object | undefined> {

        const schemaOptions = options.map(option => ({
            label: option.name,
            detail: option.description,
            description: option.id
        })) as QuickPickItem[];

        const selectedSchema = await vscode.window.showQuickPick(schemaOptions, {
            placeHolder: 'Select a schema',
        });

        if (selectedSchema) {
            return options.find(option => option.id === selectedSchema.description);
        }
    }

    private async handleDocumentClose(): Promise<any | undefined> {
        const document = this.trackedEditor?.document;
        const schema = this.schema;
        if (!document || !schema) {
            throw Error("Missing something TODO clean this up");
        }
        try {

            // Write content to temp file for validation
            fs.writeFileSync(this.tempFilePath, document.getText(), 'utf8'); // TODO is this needed?

            // Use existing validateJsonFile method
            const { isValid, errors, content } = this.validateJsonFile(this.tempFilePath, schema);

            if (isValid) {
                const submit = this.userClickedSubmit ? 'Yes' : await vscode.window.showInformationMessage(
                    'Do you want to submit this configuration?',
                    'Yes',
                    'No'
                );

                if (submit === 'Yes') {
                    vscode.window.showInformationMessage('Configuration submitted successfully');
                    return content;
                }

                return undefined; // User chose not to submit
            } else if (errors) {
                await this.displayValidationErrorDialogue(
                    `Your configuration was not submitted because it had errors`,
                    errors
                );
                return;
            }
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(error.message);
            }
            return undefined;
        } finally {
            // Clean up
            if (fs.existsSync(this.tempFilePath)) {
                fs.unlinkSync(this.tempFilePath);
            }
            this.userClickedSubmit = false;
            this.isEditing = false;
            if (this.closeSubscription) {
                this.closeSubscription.dispose();
            }
        }
    }

    /**
     * Get a validator for a schema, handling ID conflicts
     * @param schema Schema to validate against
     * @returns Compiled validation function
     */
    private getValidator(schema: any): ReturnType<typeof this.ajv.compile> {
        if (schema.$id) {
            if (this.ajv.getSchema(schema.$id)) {
                this.ajv.removeSchema(schema.$id);
            }
        }
        return this.ajv.compile(schema);
    }

    /**
     * Sets the JSON schema for the open text editor.
     * This enables IDE JSON schema support.
     * @param documentUri Document URI
     * @param schema Schema to set
     */
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

    /**
     * Extracts default values from a JSON Schema.
     * 
     * @param schema - The JSON Schema to process
     * @param undefinedValue - Value to use when no default is specified (defaults to null)
     * @returns Default values based on schema type:
     *          - primitives: schema.default or undefinedValue
     *          - arrays: schema.default or []
     *          - objects: object with recursively extracted property defaults
     * @private
     */
    private extractSchemaDefaults = (
        schema: JSONSchemaDefinition,
        undefinedValue: DefaultValue = null
    ): DefaultValue => {
        if (!schema || typeof schema !== 'object') {
            return undefinedValue;
        }

        if (schema.type === 'array' && schema.items) {
            return Array.isArray(schema.default) ? schema.default : [];
        }

        if (schema.type && schema.type !== 'object') {
            return schema.default !== undefined ? schema.default : undefinedValue;
        }

        if (schema.properties) {
            const defaults: Record<string, DefaultValue> = {};

            for (const [key, value] of Object.entries(schema.properties)) {
                // Recursively process nested objects
                defaults[key] = this.extractSchemaDefaults(value, undefinedValue);
            }

            // If the schema itself has a default, use it instead
            return schema.default !== undefined ? schema.default : defaults;
        }

        return schema.default !== undefined ? schema.default : undefinedValue;
    }

    /**
     * Creates a configuration file from the provided config object
     * 
     * This is the physical file that is displayed in the editor
     * @param filePath The file path to write over or create the temp config file
     * @param config The json object to add to the file
     */
    private async loadJSONConfigFile(filePath: vscode.Uri, json: any, meta: { name: string, id: string }): Promise<void> {
        const fileContent = [
            '/**',
            '* A toolbar is located in the top-right',
            '* • Submit the current config',
            '* • Save this config for future use',
            '* • Load an existing config file',
            '*',
            '* You can also submit by simply closing the file',
            '*',
            '*',
            '* Selected Schema:',
            `*   name: ${meta.name}`,
            `*   id: ${meta.id}`,
            '*/',
            JSON.stringify(json, null, 2)
        ].join('\n');

        await vscode.workspace.fs.writeFile(filePath, Buffer.from(fileContent, 'utf-8'));
    }

    /**
     * Validates a JSON file against a schema
     * @param filePath Path to the JSON file
     * @param schema JSON schema to validate against
     * @returns Object with validation results
     */
    public validateJsonFile(filePath: string, schema: any): { isValid: boolean; content?: any; errors?: string[] } {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');

            // Strip comments and parse the JSONC content
            const strippedContent = jsoncParser.stripComments(fileContent);
            const jsonContent = JSON.parse(strippedContent);

            // Create a new validator for this schema to avoid ID conflicts
            const validator = this.getValidator(schema);
            if (validator(jsonContent)) {
                return { isValid: true, content: jsonContent };
            } else {
                const errors = validator.errors?.map(error =>
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

    /**
     * Transforms a JSON schema by moving its properties into an "options" object
     * and adding name and description fields at the top level.
     * 
     * @param {Object} inputSchema - The original JSON schema
     * @return {Object} - The transformed JSON schema
     */
    private transformAndSetSchema(inputSchema: JSONSchema): JSONSchema {
        // Create a new schema with the transformed structure
        const newSchema: JSONSchema = {
            // Copy over the schema metadata
            $schema: inputSchema.$schema,
            $id: inputSchema.$id,
            title: inputSchema.title,
            description: inputSchema.description,
            type: "object",
            // Create the new properties structure
            properties: {
                name: {
                    type: "string",
                    description: "The name for this custom analysis",
                    default: "My Custom Analysis"
                },
                description: {
                    type: "string",
                    description: "Provide a description for how the analysis is modified",
                    default: "A custom analysis!"
                },
                options: {
                    type: "object",
                    // Copy all the original properties
                    properties: inputSchema.properties || {},
                    // Move the validation rules to the options object
                    oneOf: inputSchema.oneOf,
                    additionalProperties: inputSchema.additionalProperties
                }
            },
            // Make name required at the top level
            required: ["name"]
        };

        // Copy over any other top-level properties that might be relevant
        // const skipProperties: string[] = ["$schema", "$id", "title", "description", "type",
        //     "properties", "required", "oneOf", "additionalProperties"];

        // for (const key in inputSchema) {
        //     if (!skipProperties.includes(key)) {
        //         newSchema[key] = inputSchema[key];
        //     }
        // }

        this.schema = newSchema;
        return newSchema;
    }

    /**
     * Shows a dialog that informs the user of validation errors.
     * Allows the user to view the errors if desired.
     * 
     * Resolves when the user closes all dialogue options.
     * 
     * @param message message that is displayed
     * @param errors list of validation errors
     * 
     */
    private async displayValidationErrorDialogue(message: string, errors: string[]) {
        const viewDetails = 'View Details';
        const response = await vscode.window.showErrorMessage(
            message,
            viewDetails
        );
        if (response === viewDetails) {
            // Show errors in new document
            const errorDoc = await vscode.workspace.openTextDocument({
                content: `Validation Errors:\n\n${errors.join('\n')}`,
                language: 'text'
            });
            await vscode.window.showTextDocument(errorDoc, { viewColumn: vscode.ViewColumn.Beside });
        }
    }

    // TODO fix this maybe idk im tired
    get tempFileUri(): vscode.Uri {
        return vscode.Uri.file(this.tempFilePath);
    }
}
