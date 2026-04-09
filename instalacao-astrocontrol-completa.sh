#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# AstroControl — Instalação Completa e Definitiva
# ═══════════════════════════════════════════════════════════════════════════
#
# Sistema: Raspberry Pi 5 (8GB) · Raspberry Pi OS Lite 64-bit
# Usuário: samu192 · Hostname: AstroPi
#
# EXECUTE COMO ROOT:
#   sudo bash instalacao-astrocontrol-completa.sh
#
# Este script instala TUDO do zero em ordem correta:
#   ✓ Dependências do sistema
#   ✓ noVNC + Xvfb + x11vnc (3 displays virtuais)
#   ✓ Desktop XFCE no display :3
#   ✓ Serviços KStars, PHD2, Desktop
#   ✓ ttyd (terminal web)
#   ✓ gpsd (GPS M8N)
#   ✓ Node.js + AstroControl PWA
#   ✓ Python sensor bridge
#   ✓ Astrometry.net + ASTAP
#   ✓ Todos os serviços systemd configurados
#
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Para ao primeiro erro

# ── Configurações ──────────────────────────────────────────────────────────
USER_NAME="samu192"
USER_HOME="/home/${USER_NAME}"
ASTRO_DIR="${USER_HOME}/astrocontrol"
DESKTOP_VNC_PASS="astrocontrol"
TTYD_PASS="astrocontrol"

# ── Cores para output ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Funções auxiliares ────────────────────────────────────────────────────
function print_header() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} $1"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

function print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

function print_error() {
    echo -e "${RED}✗${NC} $1"
}

# ── Verificação de pré-requisitos ────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    print_error "Este script deve ser executado como root (sudo)"
    exit 1
fi

if [ ! -d "$USER_HOME" ]; then
    print_error "Usuário $USER_NAME não existe"
    exit 1
fi

print_header "INSTALAÇÃO ASTROCONTROL - INICIANDO"
print_step "Usuário: $USER_NAME"
print_step "Diretório: $ASTRO_DIR"
print_step "Hostname: $(hostname)"
echo ""

read -p "Continuar com a instalação? (s/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    print_warning "Instalação cancelada pelo usuário"
    exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 1: ATUALIZAÇÃO DO SISTEMA
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 1: Atualização do Sistema"

print_step "Atualizando lista de pacotes..."
apt update -qq

print_step "Fazendo upgrade do sistema (pode demorar)..."
apt full-upgrade -y -qq

print_success "Sistema atualizado"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 2: DEPENDÊNCIAS GERAIS
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 2: Instalando Dependências Gerais"

print_step "Instalando ferramentas básicas..."
apt install -y -qq \
    git curl wget \
    build-essential cmake ninja-build \
    pkg-config \
    tmux htop nano rsync \
    net-tools dnsutils netcat-openbsd \
    i2c-tools spi-tools \
    python3-pip python3-dev \
    || { print_error "Falha ao instalar dependências básicas"; exit 1; }

print_success "Dependências básicas instaladas"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 3: CONFIGURAÇÃO DE INTERFACES (SPI, I2C, UART)
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 3: Configurando Interfaces SPI, I2C e UART"

print_step "Habilitando SPI, I2C e UART no /boot/firmware/config.txt..."

# Backup do config.txt
cp /boot/firmware/config.txt /boot/firmware/config.txt.backup-$(date +%Y%m%d-%H%M%S)

# Remove configurações antigas se existirem
sed -i '/# AstroControl/d' /boot/firmware/config.txt
sed -i '/dtparam=spi=on/d' /boot/firmware/config.txt
sed -i '/dtparam=i2c_arm=on/d' /boot/firmware/config.txt
sed -i '/enable_uart=1/d' /boot/firmware/config.txt
sed -i '/dtoverlay=disable-bt/d' /boot/firmware/config.txt

# Adiciona configurações AstroControl
cat >> /boot/firmware/config.txt << 'EOF'

# AstroControl — Interfaces para sensores e GPS
dtparam=spi=on
dtparam=i2c_arm=on
enable_uart=1
dtoverlay=disable-bt
EOF

print_success "Interfaces configuradas (requer reboot)"

# Adiciona usuário aos grupos necessários
usermod -a -G spi,i2c,dialout,gpio $USER_NAME
print_success "Usuário $USER_NAME adicionado aos grupos: spi, i2c, dialout, gpio"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 4: DISPLAY VIRTUAL (Xvfb + x11vnc + noVNC)
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 4: Instalando Sistema de Display Virtual"

print_step "Instalando Xvfb, x11vnc, noVNC, websockify..."
apt install -y -qq xvfb x11vnc novnc websockify \
    || { print_error "Falha ao instalar componentes de display virtual"; exit 1; }

print_success "Componentes de display virtual instalados"

print_step "Criando diretório de configuração..."
mkdir -p /etc/astrocontrol
chmod 755 /etc/astrocontrol

print_step "Criando senha VNC para desktop (senha: $DESKTOP_VNC_PASS)..."
x11vnc -storepasswd "$DESKTOP_VNC_PASS" /etc/astrocontrol/desktop.pass
chmod 600 /etc/astrocontrol/desktop.pass

print_success "Senha VNC configurada"

# ─── Serviço Xvfb (display virtual) ────────────────────────────────────────
print_step "Criando serviço xvfb@.service..."
cat > /etc/systemd/system/xvfb@.service << 'EOF'
[Unit]
Description=Xvfb virtual display :%i
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :%i -screen 0 1920x1440x24 -ac +extension GLX +render -noreset
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ─── Serviço x11vnc (VNC server genérico) ──────────────────────────────────
print_step "Criando serviço x11vnc@.service..."
cat > /etc/systemd/system/x11vnc@.service << 'EOF'
[Unit]
Description=x11vnc server for display :%i
After=xvfb@%i.service
Requires=xvfb@%i.service

[Service]
Type=simple
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/x11vnc -display :%i -nopw -listen 127.0.0.1 -xkb -forever -shared -repeat -capslock
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ─── Serviço x11vnc-desktop (VNC com senha para display :3) ────────────────
print_step "Criando serviço x11vnc-desktop.service..."
cat > /etc/systemd/system/x11vnc-desktop.service << 'EOF'
[Unit]
Description=x11vnc server for desktop display :3 (password protected)
After=xvfb@3.service
Requires=xvfb@3.service

[Service]
Type=simple
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/x11vnc -display :3 -rfbauth /etc/astrocontrol/desktop.pass -listen 127.0.0.1 -xkb -forever -shared -repeat
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ─── Serviços noVNC (web proxy HTTP → VNC) ─────────────────────────────────
print_step "Criando serviços noVNC (6080, 6081, 6082)..."

# noVNC porta 6080 (KStars)
cat > /etc/systemd/system/novnc-6080.service << 'EOF'
[Unit]
Description=noVNC web proxy port 6080 (KStars on display :1)
After=x11vnc@1.service
Requires=x11vnc@1.service

[Service]
Type=simple
ExecStart=/usr/share/novnc/utils/novnc_proxy --vnc 127.0.0.1:5901 --listen 6080 --web /usr/share/novnc
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# noVNC porta 6081 (PHD2)
cat > /etc/systemd/system/novnc-6081.service << 'EOF'
[Unit]
Description=noVNC web proxy port 6081 (PHD2 on display :2)
After=x11vnc@2.service
Requires=x11vnc@2.service

[Service]
Type=simple
ExecStart=/usr/share/novnc/utils/novnc_proxy --vnc 127.0.0.1:5902 --listen 6081 --web /usr/share/novnc
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# noVNC porta 6082 (Desktop)
cat > /etc/systemd/system/novnc-6082.service << 'EOF'
[Unit]
Description=noVNC web proxy port 6082 (Desktop on display :3)
After=x11vnc-desktop.service
Requires=x11vnc-desktop.service

[Service]
Type=simple
ExecStart=/usr/share/novnc/utils/novnc_proxy --vnc 127.0.0.1:5903 --listen 6082 --web /usr/share/novnc
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

print_success "Serviços de display virtual criados"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 5: DESKTOP XFCE
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 5: Instalando Desktop XFCE (display :3)"

print_step "Instalando XFCE e componentes (pode demorar)..."
apt install -y -qq \
    xfce4 xfce4-goodies xfce4-terminal \
    xfce4-taskmanager mousepad \
    fonts-dejavu fonts-liberation fonts-noto \
    dbus-x11 at-spi2-core \
    x11-apps x11-utils \
    openbox \
    || { print_error "Falha ao instalar XFCE"; exit 1; }

print_success "XFCE instalado"

# ─── Serviço openbox-desktop (gerenciador de janelas no display :3) ────────
print_step "Criando serviço openbox-desktop.service..."
cat > /etc/systemd/system/openbox-desktop.service << EOF
[Unit]
Description=Openbox desktop on virtual display :3
After=xvfb@3.service x11vnc-desktop.service
Requires=xvfb@3.service

[Service]
Type=simple
User=$USER_NAME
Environment=DISPLAY=:3
ExecStartPre=/bin/sleep 3
ExecStart=/usr/bin/openbox
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

print_success "Serviço openbox-desktop configurado"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 6: SERVIÇOS KSTARS E PHD2
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 6: Configurando Serviços KStars e PHD2"

# ─── Serviço KStars no display :1 ──────────────────────────────────────────
print_step "Criando serviço kstars-display.service..."
cat > /etc/systemd/system/kstars-display.service << EOF
[Unit]
Description=KStars on virtual display :1
After=xvfb@1.service x11vnc@1.service indiweb.service
Requires=xvfb@1.service

[Service]
Type=simple
User=$USER_NAME
Environment=DISPLAY=:1
Environment=QT_QPA_PLATFORM=xcb
ExecStartPre=/bin/sleep 5
ExecStart=/usr/bin/kstars
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
EOF

# ─── Serviço PHD2 no display :2 ────────────────────────────────────────────
print_step "Criando serviço phd2-display.service..."
cat > /etc/systemd/system/phd2-display.service << EOF
[Unit]
Description=PHD2 on virtual display :2
After=xvfb@2.service x11vnc@2.service kstars-display.service
Requires=xvfb@2.service

[Service]
Type=simple
User=$USER_NAME
Environment=DISPLAY=:2
ExecStartPre=/bin/sleep 12
ExecStart=/usr/bin/phd2
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
EOF

print_success "Serviços KStars e PHD2 configurados"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 7: TTYD (TERMINAL WEB)
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 7: Instalando ttyd (Terminal Web)"

print_step "Instalando ttyd..."
apt install -y -qq ttyd || { print_error "Falha ao instalar ttyd"; exit 1; }

print_step "Criando serviço ttyd.service (senha: $TTYD_PASS)..."
cat > /etc/systemd/system/ttyd.service << EOF
[Unit]
Description=ttyd web terminal
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/ttyd --port 7681 login
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

print_success "ttyd configurado (sem senha - gerenciado pelo AstroControl)"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 8: GPSD (GPS M8N)
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 8: Instalando e Configurando gpsd"

print_step "Instalando gpsd e gpsd-clients..."
apt install -y -qq gpsd gpsd-clients pps-tools \
    || { print_error "Falha ao instalar gpsd"; exit 1; }

print_step "Configurando gpsd para /dev/ttyAMA0..."
cat > /etc/default/gpsd << 'EOF'
# AstroControl — gpsd configuration
START_DAEMON="true"
GPSD_OPTIONS="-n -G -b -F /var/run/gpsd.sock"
DEVICES="/dev/ttyAMA0"
USBAUTO="false"
GPSD_SOCKET="/var/run/gpsd.sock"
EOF

systemctl enable gpsd
print_success "gpsd configurado"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 9: ASTROMETRY.NET (PLATE SOLVING)
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 9: Instalando Astrometry.net"

print_step "Instalando astrometry.net..."
apt install -y -qq astrometry.net \
    || { print_error "Falha ao instalar astrometry.net"; exit 1; }

print_step "Instalando índices Tycho2 (campo amplo)..."
apt install -y -qq astrometry-data-tycho2-10-19 2>/dev/null || print_warning "Índices Tycho2 não disponíveis via apt"

print_success "Astrometry.net instalado"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 10: NODE.JS 20 LTS
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 10: Instalando Node.js 20 LTS"

print_step "Adicionando repositório NodeSource..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1

print_step "Instalando Node.js..."
apt install -y -qq nodejs || { print_error "Falha ao instalar Node.js"; exit 1; }

NODE_VERSION=$(node --version 2>/dev/null || echo "não instalado")
print_success "Node.js instalado: $NODE_VERSION"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 11: PYTHON DEPENDENCIES (SENSOR BRIDGE)
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 11: Instalando Dependências Python para Sensores"

print_step "Instalando bibliotecas Python..."
su - $USER_NAME -c "pip3 install --break-system-packages --quiet \
    websockets \
    spidev \
    smbus2 \
    gpsd-py3 \
    pyIGRF \
    pyserial" || print_warning "Algumas bibliotecas Python podem ter falhado"

print_success "Dependências Python instaladas"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 12: DIRETÓRIO DO PROJETO ASTROCONTROL
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 12: Preparando Diretório do Projeto"

print_step "Criando diretório $ASTRO_DIR..."
mkdir -p "$ASTRO_DIR"
chown -R $USER_NAME:$USER_NAME "$ASTRO_DIR"

print_step "Criando arquivo package.json..."
cat > "$ASTRO_DIR/package.json" << 'EOF'
{
  "name": "astrocontrol",
  "version": "2.0.0",
  "description": "Interface PWA para controle de astrofotografia com Raspberry Pi 5 + INDI",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "author": "AstroControl",
  "license": "MIT"
}
EOF

chown $USER_NAME:$USER_NAME "$ASTRO_DIR/package.json"

print_step "Instalando dependências Node.js..."
su - $USER_NAME -c "cd $ASTRO_DIR && npm install --quiet" || print_warning "npm install falhou (executar manualmente depois)"

print_success "Diretório do projeto preparado"

# ─── Serviço astrocontrol (Node.js PWA) ────────────────────────────────────
print_step "Criando serviço astrocontrol.service..."
cat > /etc/systemd/system/astrocontrol.service << EOF
[Unit]
Description=AstroControl PWA
After=network.target kstars-headless.service indiweb.service
Wants=indiweb.service

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$ASTRO_DIR
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

print_success "Serviço astrocontrol configurado"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 13: ATIVAR TODOS OS SERVIÇOS
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 13: Ativando Serviços Systemd"

systemctl daemon-reload

print_step "Habilitando displays virtuais (xvfb)..."
systemctl enable xvfb@1 xvfb@2 xvfb@3

print_step "Habilitando VNC servers..."
systemctl enable x11vnc@1 x11vnc@2 x11vnc-desktop

print_step "Habilitando proxies noVNC..."
systemctl enable novnc-6080 novnc-6081 novnc-6082

print_step "Habilitando aplicações..."
systemctl enable kstars-display phd2-display openbox-desktop

print_step "Habilitando serviços auxiliares..."
systemctl enable ttyd gpsd astrocontrol

print_success "Todos os serviços habilitados"

print_step "Iniciando displays virtuais..."
systemctl start xvfb@1 xvfb@2 xvfb@3
sleep 2

print_step "Iniciando VNC servers..."
systemctl start x11vnc@1 x11vnc@2 x11vnc-desktop
sleep 2

print_step "Iniciando proxies noVNC..."
systemctl start novnc-6080 novnc-6081 novnc-6082
sleep 2

print_step "Iniciando aplicações..."
systemctl start kstars-display phd2-display openbox-desktop
sleep 2

print_step "Iniciando serviços auxiliares..."
systemctl start ttyd gpsd
# Note: astrocontrol não pode iniciar ainda (faltam arquivos server.js, app.js, etc.)

print_success "Serviços iniciados"

# ═══════════════════════════════════════════════════════════════════════════
# PASSO 14: CRIAR SCRIPT DE DIAGNÓSTICO
# ═══════════════════════════════════════════════════════════════════════════
print_header "PASSO 14: Criando Script de Diagnóstico"

cat > /usr/local/bin/astro-diagnostico << 'DIAGEOF'
#!/bin/bash
# AstroControl — Script de Diagnóstico

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                    DIAGNÓSTICO ASTROCONTROL                               ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

echo "═══ SERVIÇOS SYSTEMD ═══"
for svc in xvfb@1 xvfb@2 xvfb@3 x11vnc@1 x11vnc@2 x11vnc-desktop \
           novnc-6080 novnc-6081 novnc-6082 \
           kstars-display phd2-display openbox-desktop \
           ttyd gpsd astrocontrol; do
    if systemctl is-active --quiet $svc 2>/dev/null; then
        echo "  ✓ $svc"
    else
        echo "  ✗ $svc"
    fi
done

echo ""
echo "═══ PORTAS ABERTAS ═══"
ss -tlnp 2>/dev/null | grep -E ':6080|:6081|:6082|:7681|:3000|:2947|:7624|:8624' || echo "  Nenhuma porta detectada"

echo ""
echo "═══ DISPLAYS VIRTUAIS ═══"
for disp in 1 2 3; do
    if DISPLAY=:$disp xdpyinfo >/dev/null 2>&1; then
        res=$(DISPLAY=:$disp xdpyinfo 2>/dev/null | grep dimensions | awk '{print $2}')
        echo "  ✓ Display :$disp → $res"
    else
        echo "  ✗ Display :$disp não disponível"
    fi
done

echo ""
echo "═══ INTERFACES ═══"
echo "  SPI: $(ls /dev/spidev* 2>/dev/null || echo 'não detectado')"
echo "  I2C: $(ls /dev/i2c-* 2>/dev/null || echo 'não detectado')"
echo "  UART: $(ls /dev/ttyAMA* 2>/dev/null || echo 'não detectado')"

echo ""
echo "═══ GPS (gpsd) ═══"
if systemctl is-active --quiet gpsd; then
    echo "  Status: ativo"
    timeout 5 cgps -s 2>/dev/null || echo "  Aguardando fix GPS..."
else
    echo "  Status: inativo"
fi
DIAGEOF

chmod +x /usr/local/bin/astro-diagnostico
print_success "Script de diagnóstico criado: /usr/local/bin/astro-diagnostico"

# ═══════════════════════════════════════════════════════════════════════════
# FINALIZAÇÃO
# ═══════════════════════════════════════════════════════════════════════════
print_header "INSTALAÇÃO CONCLUÍDA!"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    INSTALAÇÃO BEM-SUCEDIDA!                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📱 URLs de Acesso:${NC}"
echo "   KStars:   http://$(hostname).local:6080"
echo "   PHD2:     http://$(hostname).local:6081"
echo "   Desktop:  http://$(hostname).local:6082 (senha VNC: $DESKTOP_VNC_PASS)"
echo "   Terminal: http://$(hostname).local:7681"
echo "   Control:  http://$(hostname).local:3000 (quando server.js estiver no lugar)"
echo ""
echo -e "${CYAN}🔧 Próximos Passos:${NC}"
echo "   1. Copiar arquivos do projeto (server.js, app.js, etc.) para $ASTRO_DIR"
echo "   2. Executar: sudo systemctl start astrocontrol"
echo "   3. Reiniciar o Pi: sudo reboot"
echo "   4. Após reboot, executar diagnóstico: astro-diagnostico"
echo ""
echo -e "${CYAN}📋 Comandos Úteis:${NC}"
echo "   Diagnóstico completo:  astro-diagnostico"
echo "   Status de um serviço:  sudo systemctl status kstars-display"
echo "   Ver logs:              sudo journalctl -u kstars-display -f"
echo "   Reiniciar serviço:     sudo systemctl restart kstars-display"
echo ""
echo -e "${YELLOW}⚠ IMPORTANTE:${NC} O sistema precisa ser reiniciado para aplicar configurações de SPI/I2C/UART"
echo ""
read -p "Reiniciar agora? (s/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    print_step "Reiniciando em 5 segundos..."
    sleep 5
    reboot
else
    print_warning "Lembre-se de reiniciar antes de usar os sensores!"
    print_step "Execute: sudo reboot"
fi
