import zipfile

for fname in ["wb1.xlsx", "wb2.xlsx"]:
    print("=== " + fname + " ===")
    with zipfile.ZipFile(fname, "r") as z:
        for name in z.namelist():
            if "sheet" in name:
                content = z.read(name).decode("utf-8")
                print(name)
                print(content[content.find("<pageSetup"):content.find("/>", content.find("<pageSetup"))+2])
