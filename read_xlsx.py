import zipfile
import xml.etree.ElementTree as ET

def read_xlsx(file_path):
    with zipfile.ZipFile(file_path, 'r') as z:
        # Load shared strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_data = z.read('xl/sharedStrings.xml')
            root = ET.fromstring(ss_data)
            # Namespace helper
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in root.findall('ns:si', ns):
                t_elem = si.find('ns:t', ns)
                if t_elem is not None:
                    shared_strings.append(t_elem.text)
                else:
                    # Sometimes there are multiple text elements or rich text runs (r/t)
                    text_runs = []
                    for r in si.findall('ns:r', ns):
                        t = r.find('ns:t', ns)
                        if t is not None and t.text:
                            text_runs.append(t.text)
                    shared_strings.append("".join(text_runs) if text_runs else "")
        else:
            print("No shared strings found.")

        # Load sheet1
        sheet_data = []
        if 'xl/worksheets/sheet1.xml' in z.namelist():
            sheet_xml = z.read('xl/worksheets/sheet1.xml')
            root = ET.fromstring(sheet_xml)
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            
            rows = root.find('ns:sheetData', ns)
            for row in rows.findall('ns:row', ns):
                row_idx = row.get('r')
                row_data = {}
                for cell in row.findall('ns:c', ns):
                    r_ref = cell.get('r')
                    c_type = cell.get('t')
                    val_elem = cell.find('ns:v', ns)
                    val = None
                    if val_elem is not None:
                        val = val_elem.text
                    
                    if val is not None:
                        if c_type == 's':
                            # Shared string
                            str_val = shared_strings[int(val)]
                            row_data[r_ref] = str_val
                        else:
                            row_data[r_ref] = val
                if row_data:
                    sheet_data.append((row_idx, row_data))
        else:
            print("No sheet1.xml found.")
            
        return sheet_data, shared_strings

data, s_strings = read_xlsx('/home/ian/Desktop/Aquapin/NexusHome_GanttChart_June9.xlsx')
for idx, r in data[:100]:  # print first 100 rows
    print(f"Row {idx}: {r}")
