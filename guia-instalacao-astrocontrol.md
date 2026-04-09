# AstroControl — Guia de Instalação Completa e Unificada

> **Versão:** 2.0 (Instalação do Zero)  
> **Sistema:** Raspberry Pi 5 (8GB) · Raspberry Pi OS Lite 64-bit (Bookworm)  
> **Usuário:** samu192 · Hostname: AstroPi

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Pré-Requisitos](#pré-requisitos)
3. [Instalação Rápida](#instalação-rápida)
4. [Detalhamento dos Componentes](#detalhamento-dos-componentes)
5. [Arquitetura do Sistema](#arquitetura-do-sistema)
6. [Resolução de Problemas](#resolução-de-problemas)
7. [Deploy dos Arquivos do Projeto](#deploy-dos-arquivos-do-projeto)

---

## 🎯 Visão Geral

Este guia substitui **todas as instalações fragmentadas anteriores** por um único script que:

✅ Instala e configura **TUDO** em ordem correta  
✅ Resolve todos os problemas identificados (noVNC, resoluções, autenticação)  
✅ Cria **14 serviços systemd** configurados corretamente  
✅ Prepara o ambiente para sensores (SPI, I2C, UART)  
✅ Instala dependências Python e Node.js  
✅ Configura displays virtuais com resolução **1920x1440** (otimizado para tablets)

---

## 🔧 Pré-Requisitos

### Hardware Necessário

- ✅ Raspberry Pi 5 (8GB recomendado)
- ✅ MicroSD 32GB+ (classe 10 ou superior)
- ✅ Fonte oficial Raspberry Pi 27W
- ✅ GPS M8N conectado em `/dev/ttyAMA0`
- ✅ ADXL345 conectado via SPI
- ✅ Compass (HMC5883L ou QMC5883L) via I2C

### Software Pré-Instalado

Antes de executar o script, você **DEVE** ter:

1. ✅ **Raspberry Pi OS Lite 64-bit** (Bookworm) instalado
2. ✅ **KStars 3.8.1** compilado (`/usr/bin/kstars`)
3. ✅ **PHD2** compilado (`/usr/bin/phd2`)
4. ✅ **INDI Framework** instalado
5. ✅ **INDI Web Manager** instalado (`indiweb.service`)

> **Nota:** Se KStars/PHD2/INDI ainda não estão instalados, use o script `nou/astro-soft-build` antes de prosseguir:
> ```bash
> git clone https://gitea.nouspiro.space/nou/astro-soft-build.git
> cd astro-soft-build
> ./build-soft-stable.sh
> ```

---

## 🚀 Instalação Rápida

### Passo 1: Baixar o Script

No Pi, faça login como `samu192`:

```bash
cd ~
wget https://SEU_SERVIDOR/instalacao-astrocontrol-completa.sh
chmod +x instalacao-astrocontrol-completa.sh
```

Ou copie via `scp` do seu computador:

```bash
# No seu computador
scp instalacao-astrocontrol-completa.sh samu192@astropi.local:~/
```

### Passo 2: Executar como Root

```bash
sudo bash instalacao-astrocontrol-completa.sh
```

O script vai:
1. Pedir confirmação antes de começar
2. Executar todos os 14 passos automaticamente
3. Perguntar se deseja reiniciar no final

### Passo 3: Após a Instalação

Depois que o Pi reiniciar, faça login e execute o diagnóstico:

```bash
astro-diagnostico
```

---

## 📦 Detalhamento dos Componentes

### PASSO 1: Atualização do Sistema

```bash
apt update && apt full-upgrade -y
```

**O que faz:** Atualiza todos os pacotes do sistema para as versões mais recentes.

**Por quê:** Garante compatibilidade e segurança.

---

### PASSO 2: Dependências Gerais

Instala ferramentas essenciais:

| Pacote | Finalidade |
|--------|-----------|
| `git`, `curl`, `wget` | Download de arquivos e repositórios |
| `build-essential`, `cmake` | Compilação de software |
| `python3-pip`, `python3-dev` | Desenvolvimento Python |
| `i2c-tools`, `spi-tools` | Ferramentas para sensores |
| `tmux`, `htop` | Gerenciamento de sessões e monitoramento |

---

### PASSO 3: Configuração de Interfaces

**Arquivo modificado:** `/boot/firmware/config.txt`

**Adiciona:**
```ini
dtparam=spi=on          # Habilita SPI (ADXL345)
dtparam=i2c_arm=on      # Habilita I2C (Compass)
enable_uart=1           # Habilita UART (GPS M8N)
dtoverlay=disable-bt    # Desabilita Bluetooth (libera ttyAMA0)
```

**Adiciona usuário aos grupos:**
```bash
usermod -a -G spi,i2c,dialout,gpio samu192
```

**Resultado:** `/dev/spidev0.0`, `/dev/i2c-1`, `/dev/ttyAMA0` ficam acessíveis.

---

### PASSO 4: Display Virtual (Xvfb + x11vnc + noVNC)

#### 4.1 Componentes Instalados

- **Xvfb:** Display X11 virtual (sem monitor físico)
- **x11vnc:** Servidor VNC que compartilha o display virtual
- **noVNC:** Proxy HTTP que expõe VNC via WebSocket no navegador
- **websockify:** Ponte WebSocket ↔ TCP (usado pelo noVNC)

#### 4.2 Arquitetura dos 3 Displays

```
┌─────────────────────────────────────────────────┐
│  Display :1  →  KStars                          │
│  Xvfb :1 (1920x1440) → x11vnc :5901 → noVNC:6080│
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Display :2  →  PHD2                            │
│  Xvfb :2 (1920x1440) → x11vnc :5902 → noVNC:6081│
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Display :3  →  Desktop XFCE (com senha)        │
│  Xvfb :3 (1920x1440) → x11vnc :5903 → noVNC:6082│
└─────────────────────────────────────────────────┘
```

#### 4.3 Resolução 1920x1440

**Por quê essa resolução?**

- ✅ Aspect ratio **4:3** (compatível com iPads)
- ✅ Maior que a anterior (1280x800)
- ✅ Não sobrecarrega o Pi 5
- ✅ Texto legível em tablets de 10"

**Alternativas:**
- `2048x1536` — iPad Pro (mais pesado)
- `1600x1200` — Intermediário
- `1280x960` — Mais leve (4:3)

#### 4.4 Serviços Criados

| Serviço | Função |
|---------|--------|
| `xvfb@1`, `xvfb@2`, `xvfb@3` | Displays virtuais X11 |
| `x11vnc@1`, `x11vnc@2` | VNC sem senha (KStars e PHD2) |
| `x11vnc-desktop` | VNC com senha (Desktop) |
| `novnc-6080`, `novnc-6081`, `novnc-6082` | Proxies HTTP para navegador |

**Dependências entre serviços:**
```
xvfb@1 → x11vnc@1 → novnc-6080
xvfb@2 → x11vnc@2 → novnc-6081
xvfb@3 → x11vnc-desktop → novnc-6082
```

---

### PASSO 5: Desktop XFCE

**Instalado no display :3**

**Componentes:**
- `xfce4` — Ambiente de desktop completo
- `xfce4-goodies` — Ferramentas extras (calculadora, editor de texto, etc.)
- `openbox` — Gerenciador de janelas leve (alternativa ao xfwm4)

**Por quê XFCE?**
- ✅ Leve (funciona bem em displays virtuais)
- ✅ Completo (barra de tarefas, menu, gerenciador de arquivos)
- ✅ Compatível com noVNC

**Acesso:** `http://astropi.local:6082` (senha VNC: `astrocontrol`)

---

### PASSO 6: Serviços KStars e PHD2

#### 6.1 KStars (display :1)

**Arquivo:** `/etc/systemd/system/kstars-display.service`

**Configuração importante:**
```ini
Environment=DISPLAY=:1
Environment=QT_QPA_PLATFORM=xcb
ExecStartPre=/bin/sleep 5
```

**Por quê o delay de 5s?**
- Aguarda o Xvfb inicializar completamente
- Evita erro "Cannot connect to X server"

#### 6.2 PHD2 (display :2)

**Arquivo:** `/etc/systemd/system/phd2-display.service`

**Configuração importante:**
```ini
Environment=DISPLAY=:2
ExecStartPre=/bin/sleep 12
```

**Por quê o delay de 12s?**
- ✅ **CORRIGIDO:** Aguarda KStars inicializar completamente
- KStars sobe o `indiserver` (porta 7624)
- PHD2 depende do INDI estar pronto

**Problema anterior:** PHD2 iniciava antes do INDI → crashava  
**Solução:** Delay de 12s garante ordem correta

---

### PASSO 7: ttyd (Terminal Web)

**Instalado via apt:** `ttyd`

**Arquivo:** `/etc/systemd/system/ttyd.service`

**Configuração:**
```ini
ExecStart=/usr/bin/ttyd --port 7681 login
```

**⚠️ IMPORTANTE:** Sem senha!

**Por quê?**
- A autenticação é gerenciada pelo `server.js` (AstroControl)
- O `server.js` valida credenciais via rota `/api/auth/terminal`
- Usuário digita credenciais na interface PWA → backend valida → libera acesso

**Acesso:** `http://astropi.local:7681`

---

### PASSO 8: gpsd (GPS M8N)

**Arquivo de configuração:** `/etc/default/gpsd`

```bash
START_DAEMON="true"
GPSD_OPTIONS="-n -G -b -F /var/run/gpsd.sock"
DEVICES="/dev/ttyAMA0"
USBAUTO="false"
```

**Explicação das opções:**
- `-n` — Não espera cliente antes de abrir GPS
- `-G` — Escuta em todas as interfaces (localhost + rede)
- `-b` — Não altera baudrate da porta serial
- `-F /var/run/gpsd.sock` — Cria socket Unix

**Arquitetura — Single Source of Truth:**

```
GPS M8N (/dev/ttyAMA0)
        ↓
    gpsd (porta 2947)
        ↓
    ┌───────┬───────────┬──────────┐
    ↓       ↓           ↓          ↓
indi_gpsd  bridge.py  cgps   (outros clientes)
```

**⚠️ CRÍTICO:** Apenas `gpsd` acessa `/dev/ttyAMA0` diretamente!

**Por quê?**
- Evita conflito de acesso à porta serial
- Múltiplos clientes podem usar o GPS simultaneamente
- `bridge.py` lê via socket TCP, não via serial

---

### PASSO 9: Astrometry.net (Plate Solving)

**Instalado via apt:** `astrometry.net`

**Índices instalados:** `astrometry-data-tycho2-10-19`

**Uso:**
- Campo amplo (> 2°) — objetivas curtas, câmeras DSLR
- Para campos menores, baixar índices específicos em:
  - http://data.astrometry.net/4100/
  - Copiar para `/usr/share/astrometry/`

**Teste:**
```bash
solve-field --help
```

---

### PASSO 10: Node.js 20 LTS

**Instalado via NodeSource:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

**Versão:** v20.x.x

**Uso:** Executar o `server.js` do AstroControl

---

### PASSO 11: Python Dependencies

**Instalado via pip3:**
```bash
pip3 install --break-system-packages \
    websockets \   # WebSocket server (bridge.py)
    spidev \       # ADXL345 (SPI)
    smbus2 \       # Compass (I2C)
    gpsd-py3 \     # Cliente GPSD
    pyIGRF \       # Declinação magnética
    pyserial       # Comunicação serial (backup)
```

**Por quê `--break-system-packages`?**
- Python 3.13 não permite instalar via pip sem flag
- Alternativa seria usar `venv`, mas complica automação

---

### PASSO 12: Diretório do Projeto

**Criado:** `/home/samu192/astrocontrol/`

**Estrutura esperada:**
```
~/astrocontrol/
├── server.js              # Backend Node.js (a ser copiado)
├── app.js                 # Frontend JavaScript (a ser copiado)
├── alignment.js           # Lógica de alinhamento (a ser copiado)
├── style.css              # Estilos (a ser copiado)
├── index.html             # Interface HTML (a ser copiado)
├── manifest.json          # PWA manifest (a ser copiado)
├── sw.js                  # Service Worker (a ser copiado)
├── bridge.py              # Sensor bridge (a ser copiado)
├── package.json           # ✅ Criado pelo script
├── node_modules/          # ✅ Criado pelo npm install
└── astrocontrol.service   # ✅ Copiado para /etc/systemd/system/
```

**Serviço criado:** `/etc/systemd/system/astrocontrol.service`

```ini
[Unit]
Description=AstroControl PWA
After=network.target kstars-headless.service indiweb.service

[Service]
Type=simple
User=samu192
WorkingDirectory=/home/samu192/astrocontrol
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
```

---

### PASSO 13: Ativar Serviços

**Ordem de inicialização:**

```
1. gpsd
2. xvfb@{1,2,3}
3. x11vnc@{1,2} + x11vnc-desktop
4. novnc-{6080,6081,6082}
5. kstars-display (display :1)
6. phd2-display (display :2) — 12s após xvfb@2
7. openbox-desktop (display :3)
8. ttyd
9. astrocontrol (quando server.js estiver presente)
```

**Comandos executados:**
```bash
systemctl enable <serviço>   # Habilita boot automático
systemctl start <serviço>    # Inicia imediatamente
```

---

### PASSO 14: Script de Diagnóstico

**Criado:** `/usr/local/bin/astro-diagnostico`

**Uso:**
```bash
astro-diagnostico
```

**O que verifica:**
- ✅ Status de todos os serviços systemd
- ✅ Portas abertas (6080, 6081, 6082, 7681, 3000, 2947, 7624, 8624)
- ✅ Displays virtuais (resolução e disponibilidade)
- ✅ Interfaces SPI, I2C, UART
- ✅ Status do GPS (gpsd)

---

## 🏗️ Arquitetura do Sistema

### Fluxo de Dados Completo

```
┌─────────────────────────────────────────────────────────────┐
│                    TABLET/SMARTPHONE                        │
│              http://astropi.local:3000                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓ HTTP + WebSocket
┌─────────────────────────────────────────────────────────────┐
│              AstroControl PWA (Node.js)                     │
│              Porta 3000 — server.js                         │
│  ┌──────────┬──────────┬──────────┬──────────┐             │
│  │ Montagem │Alinhamento│ Drivers │  Rede   │             │
│  └──────────┴──────────┴──────────┴──────────┘             │
└───┬─────────┬──────────┬──────────────────┬────────────────┘
    │         │          │                  │
    │         │          │                  └→ noVNC iframes
    │         │          │                     (6080,6081,6082)
    │         │          │
    │         │          └→ INDI Web Manager :8624
    │         │
    │         └→ Sensor Bridge :8765
    │            (WebSocket)
    │
    ↓ INDI XML (TCP 7624)
┌─────────────────────────────────────────────────────────────┐
│                 indiserver (KStars)                         │
│  ┌──────────┬──────────┬──────────┬──────────┐             │
│  │ Montagem │ Câmera   │Focalizadora│  GPS  │             │
│  └──────────┴──────────┴──────────┴──────────┘             │
└───┬─────────┬──────────┬──────────────────┬────────────────┘
    │         │          │                  │
    ↓         ↓          ↓                  ↓
OnStep   Canon EOS  Moonlite            gpsd :2947
(WiFi)   (USB)      (USB)                    │
                                              ↓
                                     GPS M8N (/dev/ttyAMA0)
```

### Sensor Bridge (bridge.py)

```
Sensores Físicos → bridge.py → WebSocket :8765 → AstroControl PWA
                       ↓
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
    ADXL345        Compass         gpsd
    (SPI)          (I2C)       (TCP 2947)
        ↓              ↓              ↓
    pitch/roll     heading    lat/lon/fix
```

---

## 🐛 Resolução de Problemas

### Problema: KStars fora de proporção

**Sintoma:** Interface muito pequena ou cortada no navegador

**Causa:** Resolução do Xvfb incorreta

**Solução:**
```bash
# Verificar resolução atual
DISPLAY=:1 xdpyinfo | grep dimensions

# Deve retornar: 1920x1440 pixels
```

**Se estiver errado:**
```bash
sudo systemctl edit xvfb@1
```

Adicionar:
```ini
[Service]
ExecStart=
ExecStart=/usr/bin/Xvfb :1 -screen 0 1920x1440x24 -ac +extension GLX +render -noreset
```

Reiniciar:
```bash
sudo systemctl daemon-reload
sudo systemctl restart xvfb@1 kstars-display
```

---

### Problema: PHD2 não carrega

**Sintoma:** PHD2 inicia mas não conecta ao INDI

**Causa:** PHD2 inicializa antes do INDI estar pronto

**Solução:**
```bash
# Verificar se o delay está configurado
sudo systemctl cat phd2-display | grep ExecStartPre

# Deve retornar: ExecStartPre=/bin/sleep 12
```

**Se o delay não estiver configurado:**
```bash
sudo systemctl edit phd2-display
```

Adicionar:
```ini
[Service]
ExecStartPre=
ExecStartPre=/bin/sleep 12
```

Reiniciar:
```bash
sudo systemctl daemon-reload
sudo systemctl restart phd2-display
```

---

### Problema: Terminal (ttyd) com erro

**Sintoma:** Página de erro ao acessar `:7681`

**Causa:** Autenticação não configurada no backend

**Solução:**

1. Verificar se `server.js` tem a rota `/api/auth/terminal`:
```bash
grep -n "api/auth/terminal" ~/astrocontrol/server.js
```

2. Se não tiver, copiar o `server-CORRIGIDO.js` fornecido anteriormente

3. Reiniciar AstroControl:
```bash
sudo systemctl restart astrocontrol
```

---

### Problema: Serviços noVNC não iniciam

**Sintoma:** `systemctl status novnc-6080` mostra "not found"

**Causa:** Nomenclatura errada dos serviços

**Solução:**
```bash
# Verificar se os arquivos existem
ls /etc/systemd/system/novnc-*.service

# Deve listar:
# novnc-6080.service
# novnc-6081.service
# novnc-6082.service

# Se não existirem, re-executar o script de instalação
```

---

### Problema: GPS sem dados

**Sintoma:** `cgps -s` não mostra sentenças NMEA

**Causas possíveis:**

1. **UART não habilitado:**
```bash
# Verificar se /dev/ttyAMA0 existe
ls -la /dev/ttyAMA0

# Se não existir, adicionar ao config.txt:
sudo nano /boot/firmware/config.txt
# Adicionar: enable_uart=1
# Reiniciar
```

2. **Bluetooth ocupando a porta:**
```bash
# Verificar se disable-bt está ativo
grep disable-bt /boot/firmware/config.txt

# Deve retornar: dtoverlay=disable-bt
```

3. **gpsd não está rodando:**
```bash
sudo systemctl status gpsd
sudo systemctl start gpsd
```

4. **Permissões do usuário:**
```bash
# Adicionar ao grupo dialout
sudo usermod -a -G dialout samu192
# Relogar
```

---

### Problema: Sensores (ADXL345/Compass) não detectados

**Sintoma:** `bridge.py` falha ao iniciar

**Causas possíveis:**

1. **SPI/I2C não habilitados:**
```bash
# Verificar interfaces
ls /dev/spidev*  # ADXL345
ls /dev/i2c-*    # Compass

# Se não existirem:
sudo raspi-config
# Interface Options → SPI → Enable
# Interface Options → I2C → Enable
# Reiniciar
```

2. **Usuário sem permissão:**
```bash
# Adicionar aos grupos
sudo usermod -a -G spi,i2c,gpio samu192
# Relogar
```

3. **Endereço I2C errado:**
```bash
# Detectar compass
sudo i2cdetect -y 1

# Deve mostrar:
# 0x1E (HMC5883L) ou 0x0D (QMC5883L)
```

---

## 📤 Deploy dos Arquivos do Projeto

Após a instalação, você precisa copiar os arquivos do projeto para o Pi.

### Opção 1: Usar o script deploy.sh

**No seu computador, na pasta do projeto:**

```bash
chmod +x deploy.sh
./deploy.sh
```

O script faz:
1. `rsync` dos arquivos para `samu192@astropi.local:~/astrocontrol/`
2. Instala dependências Node.js remotamente
3. Copia `astrocontrol.service` para `/etc/systemd/system/`
4. Reinicia o serviço

### Opção 2: Copiar manualmente

```bash
# Copiar todos os arquivos
scp *.js *.html *.css *.json *.md samu192@astropi.local:~/astrocontrol/

# Copiar bridge.py
scp bridge.py samu192@astropi.local:~/astrocontrol/

# SSH no Pi
ssh samu192@astropi.local

# Instalar dependências Node
cd ~/astrocontrol
npm install

# Reiniciar serviço
sudo systemctl restart astrocontrol
```

### Arquivos Necessários

| Arquivo | Descrição |
|---------|-----------|
| `server.js` | Backend Node.js (use o **CORRIGIDO**) |
| `app.js` | Frontend JavaScript |
| `alignment.js` | Lógica de alinhamento |
| `index.html` | Interface principal |
| `style.css` | Estilos |
| `manifest.json` | Manifest PWA |
| `sw.js` | Service Worker |
| `bridge.py` | Sensor bridge Python |
| `package.json` | ✅ Já criado pelo script |
| `astrocontrol.service` | ✅ Já criado pelo script |

---

## ✅ Checklist Final

Depois de tudo instalado e deployado:

- [ ] Reiniciar o Pi: `sudo reboot`
- [ ] Executar diagnóstico: `astro-diagnostico`
- [ ] Verificar todos os serviços ativos
- [ ] Acessar KStars: `http://astropi.local:6080`
- [ ] Acessar PHD2: `http://astropi.local:6081`
- [ ] Acessar Desktop: `http://astropi.local:6082` (senha: `astrocontrol`)
- [ ] Acessar Terminal: `http://astropi.local:7681`
- [ ] Acessar AstroControl: `http://astropi.local:3000`
- [ ] Testar GPS: `cgps -s`
- [ ] Testar sensores: `python3 ~/astrocontrol/bridge.py`

---

## 📞 Suporte

Se encontrar problemas:

1. Execute o diagnóstico: `astro-diagnostico`
2. Verifique os logs: `sudo journalctl -u <serviço> -n 50`
3. Verifique status: `sudo systemctl status <serviço>`
4. Consulte a seção "Resolução de Problemas" acima

---

## 🎉 Conclusão

Este script unifica **tudo** que foi feito de forma fragmentada anteriormente:

✅ Todas as dependências instaladas  
✅ Todos os serviços configurados corretamente  
✅ Todas as correções aplicadas (resolução, delays, autenticação)  
✅ Script de diagnóstico disponível  
✅ Sistema pronto para uso

**Próximo passo:** Deploy dos arquivos do projeto e começar a usar! 🚀
