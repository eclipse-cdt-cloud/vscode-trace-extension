/* eslint-disable  @typescript-eslint/no-explicit-any */
import { QuickPickItem } from 'vscode';

/**
 * Top level object as it comes in from the server
 */
export interface CustomizationConfigObject {
    id: string;
    name: string;
    description: string;
    schema: Schema;
}

/**
 * Top level schema with id and name
 */
export interface Schema {
    $schema: string;
    $id: string;
    type?: string;
    title?: string;
    description: string;
    default?: any;
    items?: { type: string };
    oneOf?: { required: string[] }[];
    properties?: { [key: string]: SchemaProperty };
    required?: string[];
    additionalProperties?: boolean;
}

/**
 * Type for schema objects (and nested schema objects)
 */
export interface SchemaProperty {
    type?: string;
    title?: string;
    description: string;
    default?: any;
    items?: { type: string };
    oneOf?: { required: string[] }[];
    properties?: { [key: string]: SchemaProperty };
    required?: string[];
    additionalProperties?: boolean;
    const?: any;
    errorMessage?: any;
}

/**
 * Types of values that can be used as defaults in schema
 */
export type DefaultValue = string | number | boolean | null | Record<string, any> | any[];

/**
 * Result of validating a JSON file against a schema
 */
export interface ValidationResult {
    isValid: boolean;
    content?: CustomizationSubmission;
    errors?: string[];
}

export interface CustomizationSubmission {
    name: string;
    sourceTypeId: string;
    description: string;
    parameters: {
        [key: string]: any;
    };
}

/**
 * Configuration for schema selection picker
 */
export interface SchemaPickerItem extends QuickPickItem {
    schemaId: string;
}
