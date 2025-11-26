# Script:	Get-Free_Ports_FDB.ps1
# Purpose:  This script scans HDB results and brings back ports not listed to show ports to be unpatched.
# Author:   Bhups
# Email:	
# Date:     22/06/2018
# Comments: Updated 2025-11-26
# Notes:    
#

function Get-Free_Ports_FDB {
    $cred = Get-Credential
    $fdb_stack = Read-Host -Prompt 'type name of stack'
    while ($fdb_stack)
    {
        $fdb_body = @{
        id = '1'
        method = 'fdb'
        params = 
                @{
                    mac = $fdb_stack
                    period = '180'
                }
        }

        $fdbdata = Invoke-RestMethod -Method Post -Uri "https://arpfdb.net.ic.ac.uk/json" -Body ($fdb_body|ConvertTo-Json) -ContentType "application/json" -Credential $cred
        $fdbresults = $fdbdata.result
        $filteredList = @()

        $x = 0
        do {
            if ( $fdbresults[$x][1] -like 'ge*' ){
                $filteredList += $fdbresults[$x][1]
            }
            $x++
        } until ($x -ge $fdbresults.Count)

        $filteredList = $filteredList | Select-Object -Unique
        $laststack = ((($filteredList[-1] -split '/')[0]) -replace '^...')
        $fullstackportList = @()
        for ($stack=0; $stack -le $laststack; $stack++)
        {
            for ($port=0; $port -le 47; $port++)
            {
                    $fullstackportList += 'ge-'+$stack+'/0/'+$port+'.0'
            }
        }

        $fdbportsunseen = $fullstackportList | Where-Object {$filteredList -notcontains $_}
        Write-host 'You should be able to unpatch ports listed below'
        $fdbportsunseen

        $fdb_stack = Read-Host -Prompt 'type name of stack'
    }
}