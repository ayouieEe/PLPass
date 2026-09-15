import openpyxl

try:
    wb = openpyxl.load_workbook("test_export.xlsx")
    print("openpyxl loaded test_export.xlsx successfully!")
    print("Sheets:", wb.sheetnames)
except Exception as e:
    print("openpyxl ERROR:", e)
