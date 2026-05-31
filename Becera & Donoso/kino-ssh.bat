@echo off
REM SSH into the Kino production VPS.
REM Usage:
REM   kino-ssh                       interactive shell
REM   kino-ssh deploy                run deploy.sh on the VPS and exit
REM   kino-ssh logs                  tail backend logs and exit
REM   kino-ssh "any bash command"    run that command and exit

set "KEY=%USERPROFILE%\.ssh\lemmings.pem"
set "HOST=ubuntu@52.65.144.81"

if "%~1"=="" (
    ssh -i "%KEY%" %HOST%
) else if /I "%~1"=="deploy" (
    ssh -i "%KEY%" %HOST% "bash /var/www/kino/deploy.sh"
) else if /I "%~1"=="logs" (
    ssh -i "%KEY%" %HOST% "sudo journalctl -u kino-backend -n 80 --no-pager"
) else (
    ssh -i "%KEY%" %HOST% %*
)
