import zipfile
import xml.etree.ElementTree as ET

def read_excel_no_deps(file_path):
    try:
        with zipfile.ZipFile(file_path, 'r') as z:
            # Read shared strings
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                ss_xml = z.read('xl/sharedStrings.xml')
                root = ET.fromstring(ss_xml)
                for si in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'):
                    shared_strings.append(si.text)
            
            # Read sheet 1
            sheet_xml = z.read('xl/worksheets/sheet1.xml')
            root = ET.fromstring(sheet_xml)
            
            rows = []
            for row in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                row_data = []
                for c in row.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    val = c.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    if val is not None:
                        if c.get('t') == 's':
                            row_data.append(shared_strings[int(val.text)])
                        else:
                            row_data.append(val.text)
                    else:
                        row_data.append("")
                rows.append(row_data)
            
            print("Headers:", rows[0] if rows else [])
            print("First row:", rows[1] if len(rows) > 1 else [])
    except Exception as e:
        print("Error:", str(e))

read_excel_no_deps("C:\\Users\\WINDOWS\\Downloads\\testug.xlsx")
