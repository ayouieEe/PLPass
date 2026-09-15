$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$filePath = Join-Path (Get-Location) ".gemini\antigravity-ide\brain\54fd02c5-7a86-44d3-a244-efdade726cda\scratch\test_chart_callouts.xlsx"

try {
    $wb = $excel.Workbooks.Open($filePath)
    Write-Host "EXCEL_OPEN_SUCCESS: Workbook opened cleanly with $($wb.Worksheets.Count) sheet(s)."
    foreach ($sheet in $wb.Worksheets) {
        Write-Host "Sheet Name: $($sheet.Name), Shapes Count: $($sheet.Shapes.Count)"
    }
    $wb.Close($false)
} catch {
    Write-Host "EXCEL_OPEN_ERROR: $($_.Exception.Message)"
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
