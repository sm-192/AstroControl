#!/bin/bash
# =================================================
# AstroControl — setup-novnc.sh
# Instala e configura Xvfb + x11vnc + noVNC
# Execute no Pi com: sudo bash setup-novnc.sh
# =================================================

set -e

USER_NAME="samu192"
DESKTOP_VNC_PASS="ls100619"  # altere aqui

echo ">>> Instalando dependências..."
apt install -y xvfb x11vnc novnc openbox pcmanfm

echo ">>> Criando senha VNC para o desktop..."
mkdir -p /etc/astrocontrol
x11vnc -storepasswd "${DESKTOP_VNC_PASS}" /etc/astrocontrol/desktop.pass
chmod 600 /etc/astrocontrol/desktop.pass

echo ">>> Criando serviço xvfb@..."
cat > /etc/systemd/system/xvfb@.service << 'EOF'
[Unit]
Description=Xvfb display :%i
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :%i -screen 0 1280x800x24 -ac +extension GLX +render -noreset
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo ">>> Criando serviço x11vnc@ (sem senha)..."
cat > /etc/systemd/system/x11vnc@.service << 'EOF'
[Unit]
Description=x11vnc display :%i
After=xvfb@%i.service
Requires=xvfb@%i.service

[Service]
Type=simple
ExecStartPre=/bin/sleep 1
ExecStart=/usr/bin/x11vnc -display :%i -nopw -listen 127.0.0.1 -xkb -forever -shared -repeat -capslock
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo ">>> Criando serviço x11vnc-desktop (com senha)..."
cat > /etc/systemd/system/x11vnc-desktop.service << EOF
[Unit]
Description=x11vnc desktop display :3 (com senha)
After=xvfb@3.service
Requires=xvfb@3.service

[Service]
Type=simple
ExecStartPre=/bin/sleep 1
ExecStart=/usr/bin/x11vnc -display :3 -rfbauth /etc/astrocontrol/desktop.pass -listen 127.0.0.1 -xkb -forever -shared -repeat
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo ">>> Criando serviços noVNC..."
for PORT in 6080 6081 6082; do
  case $PORT in
    6080) VNC_PORT=5901 ;;
    6081) VNC_PORT=5902 ;;
    6082) VNC_PORT=5903 ;;
  esac

  cat > /etc/systemd/system/novnc-${PORT}.service << EOF
[Unit]
Description=noVNC proxy :${PORT}
After=x11vnc@1.service x11vnc@2.service x11vnc-desktop.service

[Service]
Type=simple
ExecStart=/usr/share/novnc/utils/novnc_proxy --vnc 127.0.0.1:${VNC_PORT} --listen ${PORT} --web /usr/share/novnc
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
done

echo ">>> Criando serviço KStars no display :1..."
cat > /etc/systemd/system/kstars-display.service << EOF
[Unit]
Description=KStars display :1
After=xvfb@1.service x11vnc@1.service indiweb.service
Requires=xvfb@1.service

[Service]
Type=simple
User=${USER_NAME}
Environment=DISPLAY=:1
Environment=QT_QPA_PLATFORM=xcb
ExecStart=/usr/bin/kstars
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo ">>> Criando serviço PHD2 no display :2..."
cat > /etc/systemd/system/phd2-display.service << EOF
[Unit]
Description=PHD2 display :2
After=xvfb@2.service x11vnc@2.service kstars-headless.service
Requires=xvfb@2.service

[Service]
Type=simple
User=${USER_NAME}
Environment=DISPLAY=:2
ExecStart=/usr/bin/phd2
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo ">>> Criando desktop Openbox no display :3..."
cat > /etc/systemd/system/openbox-desktop.service << EOF
[Unit]
Description=Openbox desktop display :3
After=xvfb@3.service x11vnc-desktop.service
Requires=xvfb@3.service

[Service]
Type=simple
User=${USER_NAME}
Environment=DISPLAY=:3
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/openbox
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo ">>> Criando serviço ttyd..."
cat > /etc/systemd/system/ttyd.service << EOF
[Unit]
Description=ttyd terminal web
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/ttyd --credential ${USER_NAME}:ALTERE_A_SENHA --port 7681 login
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo ">>> Habilitando e iniciando serviços..."
systemctl daemon-reload

# displays virtuais
systemctl enable xvfb@1 xvfb@2 xvfb@3
systemctl start  xvfb@1 xvfb@2 xvfb@3

# VNC servers
systemctl enable x11vnc@1 x11vnc@2 x11vnc-desktop
systemctl start  x11vnc@1 x11vnc@2 x11vnc-desktop

# noVNC proxies
systemctl enable novnc-6080 novnc-6081 novnc-6082
systemctl start  novnc-6080 novnc-6081 novnc-6082

# aplicações
systemctl enable kstars-display phd2-display openbox-desktop
systemctl start  kstars-display phd2-display openbox-desktop

# ttyd — NÃO inicia automaticamente até você alterar a senha acima
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  IMPORTANTE: altere a senha do ttyd!     ║"
echo "║  Edite /etc/systemd/system/ttyd.service  ║"
echo "║  e substitua ALTERE_A_SENHA              ║"
echo "║  Depois: systemctl enable --now ttyd     ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo ">>> Setup noVNC concluído!"
echo "    KStars:  http://astropi.local:6080"
echo "    PHD2:    http://astropi.local:6081"
echo "    Desktop: http://astropi.local:6082 (senha: ${DESKTOP_VNC_PASS})"
echo "    Terminal: http://astropi.local:7681 (configurar senha)"
