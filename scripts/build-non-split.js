#!/usr/bin/env node

// Disables code splitting into chunks
// See https://github.com/facebook/create-react-app/issues/5306#issuecomment-433425838
console.log("env", JSON.stringify(process.env));
const rewire = require("rewire");
const defaults = rewire("react-scripts/scripts/build.js");
let config = defaults.__get__("config");
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = "development";

config.optimization.splitChunks = {
  cacheGroups: {
    default: false
  }
};

config.optimization.runtimeChunk = false;
