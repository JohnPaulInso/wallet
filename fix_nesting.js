const fs = require('fs');
const path = require('path');

const targetFile = 'c:\\Users\\Lenovo\\Desktop\\wallet app\\index.html';

try {
    let content = fs.readFileSync(targetFile, 'utf8');

    // Regex to find the broken block between our specific cleanup comments
    // It will remove everything between the tags, including the stray </div> at line 1299
    // Using a more flexible regex for whitespaces
    const pattern = /<!--\s+\[CLEANUP START - 2026-04-02\]\s+-->[\s\S]*?<!--\s+\[CLEANUP END - 2026-04-02\]\s+-->/g;
    const replacement = '<!-- [FIX: Restored SPA Viewport Nesting by removing stray </div> and garbage lines - 2026-04-02] -->';

    const newContent = content.replace(pattern, replacement);

    if (newContent !== content) {
        fs.writeFileSync(targetFile, newContent, 'utf8');
        console.log("SUCCESS: Structural fix applied via Node.js.");
    } else {
        console.log("ERROR: Could not find the cleanup block in the file via Node.js.");
    }
} catch (err) {
    console.error("FAILED to read or write file:", err);
}
