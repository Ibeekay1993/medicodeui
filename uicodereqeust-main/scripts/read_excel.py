import pandas as pd
import json

file_path = "C:\\Users\\WINDOWS\\Downloads\\testug.xlsx"
try:
    df = pd.read_excel(file_path)
    print("Columns:", list(df.columns))
    print("\nFirst 3 rows:")
    print(df.head(3).to_string())
except Exception as e:
    print("Error reading file:", str(e))
