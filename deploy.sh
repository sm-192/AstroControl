#!/bin/bash
# =================================================
# AstroControl — deploy.sh
# Copia os arquivos para o Pi e configura o serviço
# Execute no seu computador:
#   chmod +x deploy.sh && ./deploy.sh
# =================================================

PI_USER="samu192"
PI_HOST="astropi.local"
PI_DIR="/home/samu192/astrocontrol"

echo ">>> Copiando arquivos para o Pi..."
rsync -avz --exclude 'node_modules' --exclude '.git' \
  ./ ${PI_USER}@${PI_HOST}:${PI_DIR}/

echo ">>> Instalando dependências Node.js..."
ssh ${PI_USER}@${PI_HOST} "cd ${PI_DIR} && npm install"

echo ">>> Configurando serviço systemd..."
ssh ${PI_USER}@${PI_HOST} "
  sudo cp ${PI_DIR}/astrocontrol.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable astrocontrol
  sudo systemctl restart astrocontrol
  sudo systemctl status astrocontrol --no-pager
"

echo ""
echo "✓ Deploy concluído!"
echo "  Acesse: http://astropi.local:3000"
