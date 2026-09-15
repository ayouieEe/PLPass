import zipfile
import os

with zipfile.ZipFile("test_export.xlsx", "r") as z:
    for name in z.namelist():
        print("FILE:", name)
        if "drawing" in name or "sheet" in name or "content" in name:
            content = z.read(name).decode("utf-8")
            print("--- CONTENT OF", name, "---")
            print(content[:2000])
            print("\n")
