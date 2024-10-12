const fs = require('fs');
const path = require('path');
const { loadNuxtConfig } = require('@nuxt/config');

// Path to the project root
const projectRoot = process.cwd();  // Current working directory (project root)

// Paths to the configuration files
const configFilePathTs = path.join(projectRoot, 'nuxt.config.ts');
const configFilePathJs = path.join(projectRoot, 'nuxt.config.js');

// Check if the configuration file exists
if (!fs.existsSync(configFilePathTs) && !fs.existsSync(configFilePathJs)) {
    console.error('Error: Nuxt configuration file not found. Please make sure nuxt.config.ts or nuxt.config.js exists in the project root.');
    process.exit(1);  // Exit the script with an error code
}

// Function to load Nuxt configuration and return alias paths
async function getAliasesWithPaths() {
    try {
        const nuxtConfig = await loadNuxtConfig({ rootDir: projectRoot });
        const rootDir = nuxtConfig.rootDir || projectRoot;
        const srcDir = path.isAbsolute(nuxtConfig.srcDir) ? nuxtConfig.srcDir : path.resolve(rootDir, nuxtConfig.srcDir || 'src');

        // Default aliases
        const defaultAliases = {
            '~': srcDir,
            '@': srcDir,
            '~~': rootDir,
            '@@': rootDir,
            'assets': path.join(srcDir, 'assets'),
            'public': path.join(srcDir, 'public'),
        };

        // Combine default and user-defined aliases
        const userAliases = nuxtConfig.alias || {};
        return { ...defaultAliases, ...userAliases };
    } catch (error) {
        console.error('Error loading Nuxt configuration:', error);
        process.exit(1);
    }
}

// Get command-line arguments
const args = process.argv.slice(2);
const shouldReplaceAbsolutePaths = args.includes('--replace-absolute');

// Function to get all visible directories from a given path
function getVisibleDirectories(rootDir) {
    return fs.readdirSync(rootDir).filter((file) => {
        const filePath = path.join(rootDir, file);
        return fs.lstatSync(filePath).isDirectory() && !file.startsWith('.'); // Exclude hidden directories
    });
}

// Dynamically get known directories from the project root and src folder
function getKnownDirectories() {
    const projectRoot = process.cwd();
    const srcDir = path.resolve(projectRoot, 'src');

    // Get directories from the root
    const rootDirectories = getVisibleDirectories(projectRoot);

    // Get directories from the src folder if it exists
    let srcDirectories = [];
    if (fs.existsSync(srcDir)) {
        srcDirectories = getVisibleDirectories(srcDir);
    }

    // Combine and return unique directories from root and src
    return Array.from(new Set([...rootDirectories, ...srcDirectories]));
}

// Known directories dynamically determined from the project

const knownDirectories = shouldReplaceAbsolutePaths ? getKnownDirectories() : [];
if (shouldReplaceAbsolutePaths) {
    console.log('Will replace all absolute paths starting from any of these path segments: ', knownDirectories);
}

// Function to replace aliases in the code
async function replaceAliases(dir) {
    const aliases = await getAliasesWithPaths();

    // Log the directory and aliases as JSON
    // console.log(`Processing directory: ${dir}`);
    // console.log('Resolved aliases:', JSON.stringify(aliases, null, 2));

    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.lstatSync(filePath).isDirectory()) {
            replaceAliases(filePath); // Recursively process directories
        } else if (
            filePath.endsWith('.ts') ||
            filePath.endsWith('.vue') ||
            filePath.endsWith('.scss') ||
            filePath.endsWith('.js')
        ) {
            let content = fs.readFileSync(filePath, 'utf-8');

            // Replace each alias with the correct relative path
            const updatedContent = Object.entries(aliases).reduce(
                (updated, [alias, targetPath]) => {
                    // Define a regex to match paths starting with alias and not preceded by a slash (/)
                    const regex = new RegExp(`(?<!/)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.*?)(['"])`, 'g');
                    return updated.replace(regex, (_, aliasPath, quote) => {
                        // Resolve the alias to its full path
                        const absoluteAliasPath = path.join(targetPath, aliasPath);
                        // Calculate the correct relative path
                        const relativePath = path.relative(path.dirname(filePath), absoluteAliasPath);
                        return `${relativePath}${quote}`;
                    });
                },
                content
            );

            // Only replace absolute paths if the flag is enabled
            if (shouldReplaceAbsolutePaths) {
                // Determine the root directory based on file location
                const projectRoot = process.cwd();
                const srcDir = path.resolve(projectRoot, 'src');

                // Check if the file is inside the 'src' directory
                const isInSrc = filePath.startsWith(srcDir);

                // Use 'src' as the root if the file is inside 'src', otherwise use the project root
                const rootDir = isInSrc ? srcDir : projectRoot;

                // Replace any absolute path that starts with "/" inside quotes (single or double)
                const absolutePathRegex = /['"]\/(.*?)(['"])/g; // Match paths starting with "/" inside quotes (single or double)

                const finalContent = updatedContent.replace(absolutePathRegex, (match, absolutePath, quote) => {
                    // Check if the absolute path starts with a known directory
                    const firstSegment = absolutePath.split('/')[0];
                    if (knownDirectories.includes(firstSegment)) {
                        // Convert the root-relative path to a relative path
                        const absoluteFullPath = path.join(rootDir, absolutePath);
                        const relativeFullPath = path.relative(path.dirname(filePath), absoluteFullPath);
                        // Remove leading slash when converting to relative
                        return `${quote}${relativeFullPath}${quote}`;
                    }
                    return match; // Return the original match if not in a known directory
                });

                if (finalContent !== content) {
                    fs.writeFileSync(filePath, finalContent, 'utf-8');
                    console.log(`Updated imports in ${filePath}`);
                }
            } else {
                // If no changes are made and no absolute path replacement is needed
                if (updatedContent !== content) {
                    fs.writeFileSync(filePath, updatedContent, 'utf-8');
                    console.log(`Updated imports in ${filePath}`);
                }
            }
        }
    });
}

// Starting directory for file processing
const startDir = path.resolve(projectRoot, 'src'); // The 'src' directory to begin processing from

// Start the alias replacement process
replaceAliases(startDir);
