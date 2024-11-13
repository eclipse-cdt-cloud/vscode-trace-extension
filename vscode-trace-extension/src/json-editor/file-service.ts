import * as vscode from 'vscode';
import * as fs from 'fs';
import * as jsoncParser from 'jsonc-parser';
import { Schema, ValidationResult } from 'vscode-trace-common/lib/types/customization';
import { SchemaService } from './schema-service';

/**
 * Service for handling file operations related to JSON configurations
 */
export class FileService {
    private schemaService: SchemaService;

    constructor() {
        this.schemaService = new SchemaService();
    }

    /**
     * Creates a configuration file from the provided config object
     *
     * This is the physical file that is displayed in the editor
     * @param filePath The file path to write over or create the temp config file
     * @param json The json object to add to the file
     * @param meta Optional metadata for the file header
     */
    public async loadJSONConfigFile(filePath: vscode.Uri, json: any): Promise<void> {
        const fileContent = [
            '/**',
            '* A toolbar is located in the top-right',
            '* • Submit the current config',
            '* • Save this config for future use',
            '* • Load an existing config file',
            '*',
            '* You can also submit by simply closing the file',
            '*/',
            JSON.stringify(json, null, 2)
        ].join('\n');

        await vscode.workspace.fs.writeFile(filePath, Buffer.from(fileContent, 'utf-8'));
    }

    /**
     * Validates a JSON file against a schema
     * @param filePath Path to the JSON file
     * @param schema JSON schema to validate against
     * @returns Validation result object
     */
    public async validateJsonFile(fileUri: vscode.Uri, schema: Schema): Promise<ValidationResult> {
        try {
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const text = new TextDecoder().decode(fileContent);

            // Strip comments and parse the JSONC content
            const strippedContent = jsoncParser.stripComments(text);
            const jsonContent = JSON.parse(strippedContent);

            // Create a new validator for this schema to avoid ID conflicts
            const validator = this.schemaService.getValidator(schema);
            if (validator(jsonContent)) {
                return { isValid: true, content: jsonContent };
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
     * Cleans up the temporary file
     * @param filePath Path to the temporary file
     */
    public cleanupTempFile(filePath: string): void {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (error) {
                console.error('Failed to delete temporary file:', error);
            }
        }
    }
}
