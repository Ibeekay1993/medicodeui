import sys
import re

path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportDetailsSidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Header tweaks
content = content.replace(
    'className="text-xs font-black text-slate-900 tracking-wider uppercase"',
    'className="text-xs font-black text-slate-900 tracking-wider uppercase"'
)
content = content.replace(
    'className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5"',
    'className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"'
)
content = content.replace(
    'className="p-4 border-b border-slate-150 flex items-center justify-between bg-white shrink-0"',
    'className="p-3 border-b border-slate-150 flex items-center justify-between bg-white shrink-0"'
)

# 2. Container spacing
content = content.replace('p-4 flex-1 space-y-5', 'p-3 flex-1 space-y-3')
content = content.replace('p-3.5 shadow-sm space-y-3', 'p-3 shadow-sm space-y-2')
content = content.replace('space-y-2 text-xs', 'flex flex-col gap-1.5 text-xs')
content = content.replace('space-y-4 animate-in fade-in', 'space-y-3 animate-in fade-in')

# 3. Label spacing (Regex replace)
content = re.sub(
    r'<div>\s*<span className="text-xs font-bold text-slate-400 uppercase tracking-wide block">',
    r'<div className="flex flex-col gap-0.5">\n                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">',
    content
)

# Also fix the block on values so they don't have large line-heights
content = re.sub(
    r' leading-snug block">',
    r' leading-tight">',
    content
)

content = re.sub(
    r' text-xs">\n',
    r' text-xs leading-none">\n',
    content
)

# And remove 'block' from the remaining ones
content = content.replace('block">', '">')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
