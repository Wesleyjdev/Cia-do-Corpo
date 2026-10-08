@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Juntando os arquivos .mov, aguarde...
echo.
copy /b /y "partes\sabadao_logo_animado_laranja_1500.mov.01"+"partes\sabadao_logo_animado_laranja_1500.mov.02"+"partes\sabadao_logo_animado_laranja_1500.mov.03"+"partes\sabadao_logo_animado_laranja_1500.mov.04" "sabadao_logo_animado_laranja_1500.mov" >nul
if exist "sabadao_logo_animado_laranja_1500.mov" (echo OK: sabadao_logo_animado_laranja_1500.mov) else (echo ERRO: sabadao_logo_animado_laranja_1500.mov)
copy /b /y "partes\sabadao_logo_animado_branco_1500.mov.01"+"partes\sabadao_logo_animado_branco_1500.mov.02"+"partes\sabadao_logo_animado_branco_1500.mov.03" "sabadao_logo_animado_branco_1500.mov" >nul
if exist "sabadao_logo_animado_branco_1500.mov" (echo OK: sabadao_logo_animado_branco_1500.mov) else (echo ERRO: sabadao_logo_animado_branco_1500.mov)
copy /b /y "partes\sabadao_folhas_rodape_1080x1920.mov.01"+"partes\sabadao_folhas_rodape_1080x1920.mov.02"+"partes\sabadao_folhas_rodape_1080x1920.mov.03"+"partes\sabadao_folhas_rodape_1080x1920.mov.04" "sabadao_folhas_rodape_1080x1920.mov" >nul
if exist "sabadao_folhas_rodape_1080x1920.mov" (echo OK: sabadao_folhas_rodape_1080x1920.mov) else (echo ERRO: sabadao_folhas_rodape_1080x1920.mov)
echo.
echo Pronto. Os 3 arquivos .mov estao nesta pasta.
pause
