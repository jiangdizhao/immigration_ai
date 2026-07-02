from pathlib import Path

path = Path('chatbot/app/api/widget-chat/route.ts')
text = path.read_text(encoding='utf-8')
old = '\n\n\ntype LegalServiceJsonResult ='
new = '\n\ntype LegalServiceJsonResult ='
if old not in text:
    # tolerate repeated application
    print('No triple-blank LegalServiceJsonResult block found; nothing to change.')
else:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'Fixed Biome blank-line formatting in {path}')
