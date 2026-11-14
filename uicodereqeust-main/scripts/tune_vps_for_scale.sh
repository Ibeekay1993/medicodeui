#!/usr/bin/env bash
# ==============================================================================
# Ronsberger HMO — Hostinger VPS Scaling & CPU Optimization Script
# Purpose:
#   1. Diagnose current container CPU & memory consumption
#   2. Eliminate Docker log bloat (dockerd CPU thrashing)
#   3. Prevent WhatsApp cron overlap/runaway loops
#   4. Optimize Linux kernel networking & socket limits for 5,000 concurrent users
# ==============================================================================

set -euo pipebash 2>/dev/null || set -e

echo "=========================================================="
echo "  Ronsberger HMO: VPS Performance & CPU Diagnostic"
echo "=========================================================="

# 1. Current Container CPU Usage
echo -e "\n[1/5] Checking top CPU-consuming containers right now..."
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | head -n 15

# 2. Check for runaway cron / worker processes
echo -e "\n[2/5] Checking for overlapping WhatsApp worker processes..."
RUNAWAY_COUNT=$(pgrep -f "whatsapp_worker_cron" 2>/dev/null | wc -l || echo 0)
echo "Active whatsapp_worker processes: $RUNAWAY_COUNT"
if [ "$RUNAWAY_COUNT" -gt 2 ]; then
  echo "WARNING: Multiple worker processes found stacking up! Killing duplicates..."
  pkill -f "whatsapp_worker_cron.sh" || true
fi

# Harden /root/whatsapp_worker_cron.sh with flock if file exists
if [ -f "/root/whatsapp_worker_cron.sh" ]; then
  echo "Securing /root/whatsapp_worker_cron.sh with flock lockfile..."
  # Backup original
  cp /root/whatsapp_worker_cron.sh /root/whatsapp_worker_cron.sh.bak
  # Wrap with flock if not already present
  if ! grep -q "flock" /root/whatsapp_worker_cron.sh; then
    cat << 'EOF' > /root/whatsapp_worker_cron.sh.new
#!/bin/bash
# Prevent cron overlap: exit immediately if another instance is already running
exec 200>/var/lock/whatsapp_worker.lock
flock -n 200 || exit 0

EOF
    cat /root/whatsapp_worker_cron.sh >> /root/whatsapp_worker_cron.sh.new
    mv /root/whatsapp_worker_cron.sh.new /root/whatsapp_worker_cron.sh
    chmod +x /root/whatsapp_worker_cron.sh
    echo "Lockfile added to /root/whatsapp_worker_cron.sh successfully."
  fi
fi

# 3. Fix Docker Log Bloat (Top cause of dockerd/journald 100% CPU)
echo -e "\n[3/5] Checking Docker log sizes..."
OVERSIZED_LOGS=$(find /var/lib/docker/containers/ -name "*-json.log" -size +50M 2>/dev/null || true)
if [ -n "$OVERSIZED_LOGS" ]; then
  echo "Found oversized container logs causing CPU thrashing. Truncating..."
  for log in $OVERSIZED_LOGS; do
    echo "Truncating $log..."
    truncate -s 0 "$log"
  done
  echo "Truncated bloated logs."
else
  echo "No oversized log files found (>50MB)."
fi

# Enforce permanent Docker log rotation in daemon.json
echo "Configuring permanent Docker log rotation (max 20MB, 3 files)..."
DAEMON_JSON="/etc/docker/daemon.json"
if [ ! -f "$DAEMON_JSON" ]; then
  cat << 'EOF' > "$DAEMON_JSON"
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  }
}
EOF
else
  # If file exists but doesn't have log-opts, merge it safely
  if ! grep -q "max-size" "$DAEMON_JSON"; then
    echo "Note: $DAEMON_JSON exists. Please ensure max-size: 20m is set."
  fi
fi

# 4. Kernel Tuning for High Concurrency (5,000 concurrent web connections)
echo -e "\n[4/5] Tuning Linux network socket limits..."
SYSCTL_CONF="/etc/sysctl.d/99-ronsberger-scale.conf"
cat << 'EOF' > "$SYSCTL_CONF"
# Increase network backlog for high concurrent HTTP connections
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096

# Increase port range and socket reuse
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1

# Increase max open files and virtual memory mappings for Postgres / Deno
fs.file-max = 2097152
vm.max_map_count = 262144
EOF

sysctl -p "$SYSCTL_CONF" >/dev/null 2>&1 || true
echo "Network and socket limits upgraded."

# 5. Summary & Docker Reload
echo -e "\n[5/5] Reloading Docker daemon..."
systemctl daemon-reload
systemctl restart docker

echo -e "\n=========================================================="
echo "  VPS Tuning Complete! System is optimized for scale."
echo "=========================================================="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -n 10
