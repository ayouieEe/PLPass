import zipfile

for fname in ["autofilter_obj.xlsx", "autofilter_str.xlsx"]:
    print("=== " + fname + " ===")
    with zipfile.ZipFile(fname, "r") as z:
        for name in z.namelist():
            if "sheet" in name:
                content = z.read(name).decode("utf-8")
                print(content[content.find("<autoFilter"):content.find("/>", content.find("<autoFilter"))+2] if "<autoFilter" in content else "NO AUTOFILTER")
