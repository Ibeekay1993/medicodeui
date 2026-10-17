import openpyxl

wb = openpyxl.load_workbook(r'C:\Users\WINDOWS\Downloads\july ao.xlsx')
ws = wb.active

targets = ['indap', 'clopid', 'tamsulosin', 'daonil', 'tegretol', 'benx', 'chlorprom', 'neurovite']

for idx, row in enumerate(ws.iter_rows(values_only=True), 1):
    txt = str(row[6] or '')
    for t in targets:
        if t in txt.lower():
            print(f"Row {idx} | {row[2]} | {row[5]} | {txt}")
            break
