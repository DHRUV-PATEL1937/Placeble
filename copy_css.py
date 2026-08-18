import os

src = os.path.join("frontend", "app", "globals.css")
dst = os.path.join("frontend", "src", "index.css")

with open(src, "r", encoding="utf-8") as f:
    content = f.read()

# Remove the Tailwind import line (with or without CRLF) and following blank line
tailwind_import_crlf = '@import "tailwindcss";\r\n\r\n'
tailwind_import_lf = '@import "tailwindcss";\n\n'
tailwind_import_crlf_nb = '@import "tailwindcss";\r\n'
tailwind_import_lf_nb = '@import "tailwindcss";\n'

content = content.replace(tailwind_import_crlf, "")
content = content.replace(tailwind_import_lf, "")
content = content.replace(tailwind_import_crlf_nb, "")
content = content.replace(tailwind_import_lf_nb, "")

os.makedirs(os.path.dirname(dst), exist_ok=True)
with open(dst, "w", encoding="utf-8") as f:
    f.write(content)

print(f"index.css written: {len(content)} bytes, {content.count(chr(10))} lines")
# Verify first few chars are not @import
print("First 60 chars:", repr(content[:60]))
