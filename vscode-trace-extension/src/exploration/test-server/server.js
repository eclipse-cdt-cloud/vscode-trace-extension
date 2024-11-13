const express = require('express');
const cors = require('cors');
const { json } = require('body-parser');
const { writeFileSync, readFileSync, unlinkSync, existsSync } = require('fs');
const { join } = require('path');

const app = express();
const PORT = 3002;

// Enable CORS and JSON parsing
app.use(cors());
app.use(json());

// Initialize storage
const DATA_DIR = join(__dirname, 'data');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const SCHEMA_PATH = join(DATA_DIR, 'schema.json');

// Default schema
const defaultSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "serverUrl": {
            "enum": [
                "localhost:3000",
                "localhost:3002",
                "localhost:8080"
            ],
            "description": "The server URL for the application \n  Type: string \n [ 'localhost:3000' 'localhost:8080' ]",
            "default": "localhost:3000",
        },
        "maxConnections": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "Maximum number of concurrent connections",
            "default": 10
        },
        "timeout": {
            "type": "integer",
            "minimum": 0,
            "description": "Timeout in milliseconds",
            "default": 5000
        },
        "features": {
            "type": "object",
            "properties": {
                "enableLogging": {
                    "type": "boolean",
                    "description": "Enable detailed logging",
                    "default": false,
                },
                "enableCache": {
                    "type": "boolean",
                    "description": "Enable response caching",
                    "default": false
                }
            },
            "required": ["enableLogging", "enableCache"]
        },
        "wildcard": {
            "type": "string",
            "description": "Anything you want."
        }
    },
    "required": ["serverUrl", "maxConnections", "timeout", "features"]
};

// Default config
const defaultConfig = {
    "serverUrl": "localhost:3000",
    "maxConnections": 10,
    "timeout": 5000,
    "features": {
        "enableLogging": false,
        "enableCache": false
    }
};

// Delete existing files and reset them on startup
console.log('Resetting configuration files...');

// Delete existing files if they exist
if (existsSync(CONFIG_PATH)) {
    try {
        unlinkSync(CONFIG_PATH);
        console.log('Deleted existing config.json');
    } catch (error) {
        console.error('Error deleting config.json:', error);
    }
}

if (existsSync(SCHEMA_PATH)) {
    try {
        unlinkSync(SCHEMA_PATH);
        console.log('Deleted existing schema.json');
    } catch (error) {
        console.error('Error deleting schema.json:', error);
    }
}

// Write new files with default values
try {
    writeFileSync(SCHEMA_PATH, JSON.stringify(defaultSchema, null, 2));
    console.log('Created new schema.json with default values');
} catch (error) {
    console.error('Error creating schema.json:', error);
}

try {
    writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
    console.log('Created new config.json with default values');
} catch (error) {
    console.error('Error creating config.json:', error);
}

// Endpoints
app.get('/schema', (req, res) => {
    try {
        const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
        res.json(schema);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read schema' });
    }
});

app.get('/config', (req, res) => {
    try {
        const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read config' });
    }
});

app.post('/config', (req, res) => {
    try {
        // Optional: Add validation here if you want server-side validation
        console.log(req.body);
        writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2));
        res.json({ message: 'Config saved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save config' });
    }
});

// Add some debugging endpoints
app.post('/schema', (req, res) => {
    try {
        writeFileSync(SCHEMA_PATH, JSON.stringify(req.body, null, 2));
        res.json({ message: 'Schema updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update schema' });
    }
});

app.get('/reset', (req, res) => {
    try {
        writeFileSync(SCHEMA_PATH, JSON.stringify(defaultSchema, null, 2));
        writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
        res.json({ message: 'Reset successful' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Mock config server running at http://localhost:${PORT}`);
    console.log('\nAvailable endpoints:');
    console.log('  GET  /schema - Get JSON schema');
    console.log('  GET  /config - Get current config');
    console.log('  POST /config - Save new config');
    console.log('  POST /schema - Update schema (for testing)');
    console.log('  GET  /reset  - Reset to default values');
});