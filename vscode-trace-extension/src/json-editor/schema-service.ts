import * as vscode from 'vscode';
import Ajv from 'ajv/dist/2020';
import { Schema, DefaultValue } from 'vscode-trace-common/lib/types/customization';

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

        console.dir(schemaConfig);

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
}
