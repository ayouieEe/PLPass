$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $path = (Get-Item chart_test.xlsx).FullName
    $wb = $excel.Workbooks.Open($path)
    Write-Host "SUCCESS: Excel opened chart_test.xlsx!"
    $ws = $wb.Worksheets.Item(1)
    Write-Host "Shapes count in worksheet:" $ws.Shapes.Count
    $wb.Close($false)
} catch {
    Write-Host "EXCEL OPEN ERROR:" $_.Exception.Message
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
