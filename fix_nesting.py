import re
import os

target_file = r'c:\Users\Lenovo\Desktop\wallet app\index.html'

with open(target_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Regex to find the broken block between our specific cleanup comments
# It will remove everything between the tags, including the stray </div> at line 1299
pattern = re.compile(r'<!--\s\[CLEANUP START - 2026-04-02\]\s-->.*?<!--\s\[CLEANUP END - 2026-04-02\]\s-->', re.DOTALL)
replacement = '<!-- [FIX: Restored SPA Viewport Nesting by removing stray </div> and garbage lines - 2026-04-02] -->'

new_content = pattern.sub(replacement, content)

if new_content != content:
    with open(target_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS: Structural fix applied.")
else:
    print("ERROR: Could not find the cleanup block in the file.")
