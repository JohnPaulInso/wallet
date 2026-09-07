const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match, i = 0, passed = 0;
while ((match = regex.exec(html)) !== null) {
    const code = match[1].trim();
    if (code && !match[0].includes('src=')) {
        try {
            if (match[0].includes('type="module"') || match[0].includes("type='module'")) {
                new vm.SourceTextModule(code);
            } else {
                new vm.Script(code);
            }
            passed++;
        } catch(err) {
            console.error('Script #' + i + ' failed:', err.message);
            process.exit(1);
        }
    }
    i++;
}
console.log('SUCCESS: All ' + passed + ' executable scripts passed syntax validation!');
