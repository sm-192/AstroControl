#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# AstroControl — Script de Correção de Problemas
# ═══════════════════════════════════════════════════════════════════════════
#
# Corrige:
#   ✓ Desktop vazio (falta pcmanfm/lxpanel)
#   ✓ KStars/PHD2 com tela preta (falta variáveis de ambiente)
#   ✓ Terminal desconectado (ttyd mal configurado)
#
# Execute como root: sudo bash correcoes-astrocontrol.sh
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

USER_NAME="samu192"
USER_HOME="/home/${USER_NAME}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗${NC} Execute como root: sudo bash $0"
    exit 1
fi

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              CORREÇÕES ASTROCONTROL                                       ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# CORREÇÃO 1: Desktop Openbox Vazio
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${CYAN}[1/5]${NC} Corrigindo Desktop Openbox..."

# Para o serviço atual
systemctl stop openbox-desktop 2>/dev/null || true

# Instala componentes que faltam
apt install -y -qq lxpanel pcmanfm xterm lxterminal 2>/dev/null || true

# Cria autostart do Openbox com componentes gráficos
mkdir -p ${USER_HOME}/.config/openbox
cat > ${USER_HOME}/.config/openbox/autostart << 'EOF'
#!/bin/bash
# AstroControl — Openbox autostart

# Gerenciador de arquivos como desktop
pcmanfm --desktop &

# Painel na parte inferior
lxpanel &

# Papel de parede sólido
xsetroot -solid "#2b2b2b" &
EOF

chmod +x ${USER_HOME}/.config/openbox/autostart
chown -R ${USER_NAME}:${USER_NAME} ${USER_HOME}/.config

# Recria o serviço openbox-desktop com comando correto
cat > /etc/systemd/system/openbox-desktop.service << EOF
[Unit]
Description=Openbox desktop on virtual display :3
After=xvfb@3.service x11vnc-desktop.service
Requires=xvfb@3.service

[Service]
Type=simple
User=${USER_NAME}
Environment=DISPLAY=:3
Environment=HOME=${USER_HOME}
ExecStartPre=/bin/sleep 3
ExecStart=/usr/bin/openbox-session
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓${NC} Desktop Openbox corrigido"

# ═══════════════════════════════════════════════════════════════════════════
# CORREÇÃO 2: KStars com Tela Preta
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${CYAN}[2/5]${NC} Corrigindo KStars..."

systemctl stop kstars-display 2>/dev/null || true

# Recria serviço com mais variáveis de ambiente e logging
cat > /etc/systemd/system/kstars-display.service << EOF
[Unit]
Description=KStars on virtual display :1
After=xvfb@1.service x11vnc@1.service indiweb.service
Requires=xvfb@1.service

[Service]
Type=simple
User=${USER_NAME}
Environment=DISPLAY=:1
Environment=HOME=${USER_HOME}
Environment=QT_QPA_PLATFORM=xcb
Environment=QT_X11_NO_MITSHM=1
Environment=QT_DEBUG_PLUGINS=0
Environment=XDG_RUNTIME_DIR=/run/user/1000
ExecStartPre=/bin/sleep 5
ExecStart=/usr/bin/kstars
Restart=on-failure
RestartSec=15
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Verifica se KStars existe
if [ ! -f /usr/bin/kstars ]; then
    echo -e "${YELLOW}⚠${NC} KStars não encontrado em /usr/bin/kstars"
    echo -e "${YELLOW}⚠${NC} Procurando em outros locais..."
    KSTARS_PATH=$(which kstars 2>/dev/null || find /usr -name kstars -type f 2>/dev/null | head -1)
    if [ -n "$KSTARS_PATH" ]; then
        echo -e "${GREEN}✓${NC} KStars encontrado em: $KSTARS_PATH"
        sed -i "s|/usr/bin/kstars|${KSTARS_PATH}|g" /etc/systemd/system/kstars-display.service
    else
        echo -e "${RED}✗${NC} KStars não encontrado no sistema!"
        echo -e "${YELLOW}ℹ${NC} Pule este serviço ou instale o KStars primeiro"
    fi
fi

echo -e "${GREEN}✓${NC} KStars corrigido"

# ═══════════════════════════════════════════════════════════════════════════
# CORREÇÃO 3: PHD2 com Tela Preta
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${CYAN}[3/5]${NC} Corrigindo PHD2..."

systemctl stop phd2-display 2>/dev/null || true

cat > /etc/systemd/system/phd2-display.service << EOF
[Unit]
Description=PHD2 on virtual display :2
After=xvfb@2.service x11vnc@2.service kstars-display.service
Requires=xvfb@2.service

[Service]
Type=simple
User=${USER_NAME}
Environment=DISPLAY=:2
Environment=HOME=${USER_HOME}
Environment=XDG_RUNTIME_DIR=/run/user/1000
ExecStartPre=/bin/sleep 12
ExecStart=/usr/bin/phd2
Restart=on-failure
RestartSec=15
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Verifica se PHD2 existe
if [ ! -f /usr/bin/phd2 ]; then
    echo -e "${YELLOW}⚠${NC} PHD2 não encontrado em /usr/bin/phd2"
    PHD2_PATH=$(which phd2 2>/dev/null || find /usr -name phd2 -type f 2>/dev/null | head -1)
    if [ -n "$PHD2_PATH" ]; then
        echo -e "${GREEN}✓${NC} PHD2 encontrado em: $PHD2_PATH"
        sed -i "s|/usr/bin/phd2|${PHD2_PATH}|g" /etc/systemd/system/phd2-display.service
    else
        echo -e "${RED}✗${NC} PHD2 não encontrado no sistema!"
    fi
fi

echo -e "${GREEN}✓${NC} PHD2 corrigido"

# ═══════════════════════════════════════════════════════════════════════════
# CORREÇÃO 4: Terminal (ttyd) Desconectado
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${CYAN}[4/5]${NC} Corrigindo Terminal (ttyd)..."

systemctl stop ttyd 2>/dev/null || true

# Recria serviço ttyd com configuração correta
cat > /etc/systemd/system/ttyd.service << 'EOF'
[Unit]
Description=ttyd web terminal
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/ttyd -p 7681 -i lo -t fontSize=16 -t theme='{"background":"#1e1e1e","foreground":"#d4d4d4"}' bash
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓${NC} Terminal (ttyd) corrigido"

# ═══════════════════════════════════════════════════════════════════════════
# CORREÇÃO 5: Permissões e XDG Runtime
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${CYAN}[5/5]${NC} Corrigindo permissões e XDG Runtime..."

# Cria diretório XDG_RUNTIME_DIR se não existir
mkdir -p /run/user/1000
chown ${USER_NAME}:${USER_NAME} /run/user/1000
chmod 700 /run/user/1000

# Adiciona ao login do usuário
if ! grep -q "XDG_RUNTIME_DIR" ${USER_HOME}/.bashrc 2>/dev/null; then
    cat >> ${USER_HOME}/.bashrc << 'EOF'

# AstroControl — XDG Runtime
export XDG_RUNTIME_DIR=/run/user/1000
EOF
    chown ${USER_NAME}:${USER_NAME} ${USER_HOME}/.bashrc
fi

echo -e "${GREEN}✓${NC} Permissões corrigidas"

# ═══════════════════════════════════════════════════════════════════════════
# RECARREGAR E REINICIAR SERVIÇOS
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}Recarregando systemd e reiniciando serviços...${NC}"

systemctl daemon-reload

echo -e "${CYAN}→${NC} Reiniciando displays virtuais..."
systemctl restart xvfb@1 xvfb@2 xvfb@3
sleep 2

echo -e "${CYAN}→${NC} Reiniciando VNC servers..."
systemctl restart x11vnc@1 x11vnc@2 x11vnc-desktop
sleep 2

echo -e "${CYAN}→${NC} Reiniciando noVNC proxies..."
systemctl restart novnc-6080 novnc-6081 novnc-6082
sleep 2

echo -e "${CYAN}→${NC} Reiniciando aplicações..."
systemctl restart openbox-desktop
sleep 3
systemctl restart kstars-display 2>/dev/null || echo -e "${YELLOW}⚠${NC} KStars não iniciado (verificar se está instalado)"
sleep 3
systemctl restart phd2-display 2>/dev/null || echo -e "${YELLOW}⚠${NC} PHD2 não iniciado (verificar se está instalado)"

echo -e "${CYAN}→${NC} Reiniciando ttyd..."
systemctl restart ttyd

# ═══════════════════════════════════════════════════════════════════════════
# VERIFICAÇÃO
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    VERIFICAÇÃO DE STATUS                                  ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

for svc in xvfb@1 xvfb@2 xvfb@3 x11vnc@1 x11vnc@2 x11vnc-desktop \
           novnc-6080 novnc-6081 novnc-6082 \
           openbox-desktop kstars-display phd2-display ttyd; do
    if systemctl is-active --quiet $svc 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $svc"
    else
        echo -e "  ${RED}✗${NC} $svc ${YELLOW}(verificar logs: journalctl -u $svc -n 20)${NC}"
    fi
done

echo ""
echo -e "${CYAN}Displays virtuais:${NC}"
for disp in 1 2 3; do
    if DISPLAY=:$disp xdpyinfo >/dev/null 2>&1; then
        res=$(DISPLAY=:$disp xdpyinfo 2>/dev/null | grep dimensions | awk '{print $2}')
        echo -e "  ${GREEN}✓${NC} Display :$disp → $res"
    else
        echo -e "  ${RED}✗${NC} Display :$disp não disponível"
    fi
done

# ═══════════════════════════════════════════════════════════════════════════
# LOGS ÚTEIS
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    LOGS DE DIAGNÓSTICO                                    ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if ! systemctl is-active --quiet kstars-display; then
    echo -e "${YELLOW}KStars Logs (últimas 10 linhas):${NC}"
    journalctl -u kstars-display -n 10 --no-pager 2>/dev/null || echo "  Sem logs disponíveis"
    echo ""
fi

if ! systemctl is-active --quiet phd2-display; then
    echo -e "${YELLOW}PHD2 Logs (últimas 10 linhas):${NC}"
    journalctl -u phd2-display -n 10 --no-pager 2>/dev/null || echo "  Sem logs disponíveis"
    echo ""
fi

if ! systemctl is-active --quiet openbox-desktop; then
    echo -e "${YELLOW}Openbox Logs (últimas 10 linhas):${NC}"
    journalctl -u openbox-desktop -n 10 --no-pager 2>/dev/null || echo "  Sem logs disponíveis"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════
# FINALIZAÇÃO
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    CORREÇÕES APLICADAS!                                   ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📱 Teste novamente:${NC}"
echo "   Desktop: http://astropi.local:6082 (deve mostrar painel e ícones)"
echo "   KStars:  http://astropi.local:6080 (deve carregar a interface)"
echo "   PHD2:    http://astropi.local:6081 (deve carregar a interface)"
echo "   Terminal: http://astropi.local:7681 (deve abrir bash)"
echo ""
echo -e "${CYAN}🔧 Se ainda houver problemas:${NC}"
echo "   1. Verificar se KStars e PHD2 estão instalados:"
echo "      which kstars"
echo "      which phd2"
echo ""
echo "   2. Testar aplicações manualmente:"
echo "      DISPLAY=:1 kstars"
echo "      DISPLAY=:2 phd2"
echo ""
echo "   3. Ver logs completos:"
echo "      journalctl -u kstars-display -n 50"
echo "      journalctl -u phd2-display -n 50"
echo "      journalctl -u openbox-desktop -n 50"
echo ""
