$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $path = (Get-Item multi_tab_master_report.xlsx).FullName
    $wb = $excel.Workbooks.Open($path)
    Write-Host "SUCCESS: Excel opened multi_tab_master_report.xlsx!"
    Write-Host "Worksheets count:" $wb.Worksheets.Count
    foreach ($ws in $wb.Worksheets) {
        Write-Host "  - Sheet:" $ws.Name
    }
    $wb.Close($false)
} catch {
    Write-Host "EXCEL OPEN ERROR:" $_.Exception.Message
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
