const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
// Sobe duas pastas (mobile -> apps -> FINANCE-APP)
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Faz o Metro enxergar a raiz do monorepo
config.watchFolders = [workspaceRoot];

// Ensina o Metro onde buscar os pacotes (ex: expo-router)
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];

// Configuração essencial para monorepos
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
