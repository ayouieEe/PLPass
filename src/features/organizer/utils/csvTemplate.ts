export function downloadStudentCsvTemplate() {
  const headers = [
    "Student Number",
    "Email",
    "First Name",
    "Middle Name",
    "Last Name",
    "Program Code",
    "Department Code",
    "Section Name",
    "Year Level"
  ];

  const exampleRow = [
    "23-00265",
    "jdelacruz@example.edu.ph",
    "Juan",
    "Perez",
    "Dela Cruz",
    "BSIT",
    "CCS",
    "A",
    "2"
  ];

  const csvContent = [headers.join(","), exampleRow.join(",")].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", "student_import_template.csv");
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
