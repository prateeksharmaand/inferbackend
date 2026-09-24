"""Checks app-store-listing.md fields against App Store Connect limits."""
import re, pathlib

text = pathlib.Path(__file__).with_name('app-store-listing.md').read_text()

def block(heading):
    m = re.search(re.escape(heading) + r'.*?```\n(.*?)\n```', text, re.S)
    return m.group(1)

def cell(label):
    return re.search(r'\| ' + re.escape(label) + r' \| `([^`]*)`', text).group(1)

checks = [
    ('Name', cell('Name (30)'), 30),
    ('Subtitle', cell('Subtitle (30)'), 30),
    ('Promotional text', block('Promotional Text (170)'), 170),
    ('Description', block('## Description (4000)'), 4000),
    ('Keywords (bytes)', block('## Keywords (100)').encode(), 100),
    ("What's New", block("## What's New in This Version (4000)"), 4000),
    ('Review notes', block('**Notes (4000):**'), 4000),
]
ok = True
for name, value, limit in checks:
    n = len(value)
    flag = 'OK ' if n <= limit else 'TOO LONG'
    ok &= n <= limit
    print(f'{flag:8} {name:18} {n:5} / {limit}')
kw = block('## Keywords (100)')
assert ', ' not in kw, 'Keywords must not have spaces after commas'
print('All fields within limits' if ok else 'Fix fields marked TOO LONG')
