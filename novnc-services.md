# =================================================
# AstroControl — novnc-services.md
# Serviços systemd para Xvfb + x11vnc + noVNC
# 3 instâncias independentes:
#   :1 → KStars  → noVNC :6080
#   :2 → PHD2    → noVNC :6081
#   :3 → Desktop → noVNC :6082 (com senha VNC)
#
# Instalar dependências:
#   sudo apt install xvfb x11vnc novnc -y
#
# Após criar os arquivos abaixo:
#   sudo systemctl daemon-reload
#   sudo systemctl enable xvfb@1 xvfb@2 xvfb@3
#   sudo systemctl enable x11vnc@1 x11vnc@2 x11vnc@3
#   sudo systemctl enable novnc@6080 novnc@6081 novnc@6082
#   sudo systemctl enable kstars-display phd2-display
#   sudo systemctl start xvfb@1 xvfb@2 xvfb@3
#   sudo systemctl start x11vnc@1 x11vnc@2 x11vnc@3
#   sudo systemctl start novnc@6080 novnc@6081 novnc@6082
#   sudo systemctl start kstars-display phd2-display
# =================================================

# ── /etc/systemd/system/xvfb@.service ──
# Display virtual parametrizado pelo número após @
# Uso: systemctl start xvfb@1

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

---

# ── /etc/systemd/system/x11vnc@.service ──
# Servidor VNC parametrizado pelo número do display
# Uso: systemctl start x11vnc@1

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

---

# ATENÇÃO: display :3 (Desktop) usa SENHA VNC
# Crie o arquivo de senha antes de iniciar:
#   x11vnc -storepasswd SUASENHA /etc/x11vnc-desktop.pass
#
# ── /etc/systemd/system/x11vnc-desktop.service ──
# (substitui x11vnc@3 para o desktop com senha)

[Unit]
Description=x11vnc desktop (display :3) com senha
After=xvfb@3.service
Requires=xvfb@3.service

[Service]
Type=simple
ExecStartPre=/bin/sleep 1
ExecStart=/usr/bin/x11vnc -display :3 -rfbauth /etc/x11vnc-desktop.pass -listen 127.0.0.1 -xkb -forever -shared -repeat
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target

---

# ── /etc/systemd/system/novnc@.service ──
# noVNC proxy parametrizado pela porta
# Uso: systemctl start novnc@6080
# Mapeamento de porta → VNC local:
#   6080 → 5901 (display :1, KStars)
#   6081 → 5902 (display :2, PHD2)
#   6082 → 5903 (display :3, Desktop)

[Unit]
Description=noVNC proxy :%i
After=x11vnc@1.service x11vnc@2.service x11vnc-desktop.service

[Service]
Type=simple
Environment=VNC_PORT_6080=5901
Environment=VNC_PORT_6081=5902
Environment=VNC_PORT_6082=5903
ExecStart=/bin/bash -c '/usr/share/novnc/utils/novnc_proxy \
  --vnc 127.0.0.1:$(eval echo \$VNC_PORT_%i) \
  --listen %i \
  --web /usr/share/novnc'
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target

---

# ── /etc/systemd/system/kstars-display.service ──
# KStars no display :1

[Unit]
Description=KStars no display :1
After=xvfb@1.service x11vnc@1.service indiweb.service
Requires=xvfb@1.service

[Service]
Type=simple
User=samu192
Environment=DISPLAY=:1
Environment=QT_QPA_PLATFORM=xcb
ExecStart=/usr/bin/kstars
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target

---

# ── /etc/systemd/system/phd2-display.service ──
# PHD2 no display :2

[Unit]
Description=PHD2 no display :2
After=xvfb@2.service x11vnc@2.service kstars-headless.service
Requires=xvfb@2.service

[Service]
Type=simple
User=samu192
Environment=DISPLAY=:2
ExecStart=/usr/bin/phd2
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target

---

# ── /etc/systemd/system/openbox-desktop.service ──
# Gerenciador de janelas leve para o desktop no display :3

[Unit]
Description=Openbox desktop (display :3)
After=xvfb@3.service x11vnc-desktop.service
Requires=xvfb@3.service

[Service]
Type=simple
User=samu192
Environment=DISPLAY=:3
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/openbox --startup "pcmanfm --desktop"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
