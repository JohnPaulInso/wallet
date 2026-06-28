const fs = require('fs');
const path = require('path');

// Map of corrupted sequences to correct Unicode characters
const encodingFixes = {
    // Emoji fixes
    '💾': '💾',  // floppy disk
    '⚡': '⚡',     // lightning bolt
    '🔄': '🔄',  // refresh
    '🔇': '🔇',  // muted speaker
    '🚫': '🚫',   // prohibited
    '🔰': '🔰',  // Japanese symbol
    '🧹': '🧹',   // broom
    '–': '–',    // en dash
    '—': '—',    // em dash
    '"': '—',      // em dash (variant)
    '·': '·',       // middle dot
    '✅': '✅',    // check mark
    '⏭️': '⏭️',  // next track
    '⚠️': '⚠️',  // warning
    '☀️': '☀️',  // sun
    'BANK': 'BANK', // BANK text corruption
    '…': '…',       // ellipsis
    
    // Common text fixes
    '"Å"': '"',    // left double quote
    '"': '"',     // right double quote  
    '"™': "'",     // right single quote
    '"˜': "'",     // left single quote
};

// Function to fix encoding in a file
function fixFileEncoding(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Apply all fixes
        for (const [corrupted, correct] of Object.entries(encodingFixes)) {
            if (content.includes(corrupted)) {
                const regex = new RegExp(corrupted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                content = content.replace(regex, correct);
                modified = true;
                console.log(`✓ Fixed "${corrupted}" → "${correct}" in ${filePath}`);
            }
        }
        
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Updated ${filePath}\n`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
        return false;
    }
}

// Recursively find files to fix
function findFilesToFix(dir, extensions = ['.js', '.html', '.css', '.txt', '.md']) {
    const files = [];
    const excludeDirs = ['node_modules', '.git', 'android', 'www', '.vscode', '.cursor'];
    
    function traverse(currentPath) {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                if (!excludeDirs.includes(item)) {
                    traverse(fullPath);
                }
            } else if (stat.isFile()) {
                const ext = path.extname(item);
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }
    
    traverse(dir);
    return files;
}

// Main execution
console.log('🔧 Starting encoding fix...\n');

const rootDir = __dirname;
const files = findFilesToFix(rootDir);

console.log(`Found ${files.length} files to check\n`);

let fixedCount = 0;
for (const file of files) {
    if (fixFileEncoding(file)) {
        fixedCount++;
    }
}

console.log(`\n✅ Complete! Fixed ${fixedCount} files.`);
