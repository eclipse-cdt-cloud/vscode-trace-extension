import * as vscode from 'vscode';
import Ajv from 'ajv/dist/2020';
import * as jsoncParser from 'jsonc-parser';
import {
    Schema,
    DefaultValue,
    ValidationResult,
    CustomizationSubmission
} from 'vscode-trace-common/lib/types/customization';

/**
 * Service for handling JSON schema operations
 */
export class SchemaService {
    private readonly ajv = new Ajv();

    /**
     * Gets a validator for a schema, handling ID conflicts
     * @param schema Schema to validate against
     * @returns Compiled validation function
     */
    public getValidator(schema: Schema): ReturnType<Ajv['compile']> {
        if (schema.$id && this.ajv.getSchema(schema.$id)) {
            this.ajv.removeSchema(schema.$id);
        }

        return this.ajv.compile(schema);
    }

    /**
     * Sets the JSON schema for the open text editor.
     * This enables IDE JSON schema support.
     * First clears all existing schemas, then adds the new one.
     * @param documentUri Document URI
     * @param schema Schema to set
     */
    public async setOpenFileSchema(documentUri: vscode.Uri, schema: Schema): Promise<void> {
        const config = vscode.workspace.getConfiguration('json');

        // Clear all existing schemas
        await config.update('schemas', [], vscode.ConfigurationTarget.Global);

        // Create schema configuration for this document
        const schemaConfig = {
            fileMatch: [documentUri.toString()],
            schema: schema
        };

        // Add the new schema
        const schemas = [schemaConfig];

        // Update configuration with the new schema
        await config.update('schemas', schemas, vscode.ConfigurationTarget.Global);
    }

    /**
     * Extracts default values from a JSON Schema.
     *
     * @param schema - The JSON Schema to process
     * @param undefinedValue - Value to use when no default is specified (defaults to null)
     * @returns Default values based on schema type
     */
    /* eslint-disable  no-null/no-null */
    public extractSchemaDefaults = (schema: Schema, undefinedValue: DefaultValue = null): DefaultValue => {
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
                defaults[key] = this.extractSchemaDefaults(value as Schema, undefinedValue);
            }

            // If the schema itself has a default, use it instead
            return schema.default !== undefined ? schema.default : defaults;
        }

        return schema.default !== undefined ? schema.default : undefinedValue;
    };

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
            const validator = this.getValidator(schema);
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
}
