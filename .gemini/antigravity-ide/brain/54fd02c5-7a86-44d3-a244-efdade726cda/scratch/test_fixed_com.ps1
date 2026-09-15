$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $path = (Get-Item fixed_master_report.xlsx).FullName
    $wb = $excel.Workbooks.Open($path)
    Write-Host "SUCCESS: Excel opened fixed_master_report.xlsx!"
    $wb.Close($false)
} catch {
    Write-Host "EXCEL OPEN ERROR:" $_.Exception.Message
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
