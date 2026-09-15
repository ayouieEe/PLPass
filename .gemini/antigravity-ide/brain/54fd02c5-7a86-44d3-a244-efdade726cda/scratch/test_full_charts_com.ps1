$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $path = (Get-Item full_master_with_charts.xlsx).FullName
    $wb = $excel.Workbooks.Open($path)
    Write-Host "SUCCESS: Excel opened full_master_with_charts.xlsx!"
    $ws = $wb.Worksheets.Item(1)
    Write-Host "Worksheet name:" $ws.Name
    Write-Host "Shapes count in Overview tab:" $ws.Shapes.Count
    $wb.Close($false)
} catch {
    Write-Host "EXCEL OPEN ERROR:" $_.Exception.Message
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
