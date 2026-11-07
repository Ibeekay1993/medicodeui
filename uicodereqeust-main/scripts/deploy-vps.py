import paramiko, tarfile, os, sys

HOST = '2.24.58.189'
USER = 'root'
PASS = 'Uideskoffice@123456789'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
LOCAL_DIST = os.path.join(ROOT_DIR, 'dist')
TAR_PATH = os.path.join(ROOT_DIR, 'dist.tar.gz')

if not os.path.exists(LOCAL_DIST):
    print(f"Error: dist directory does not exist at {LOCAL_DIST}. Build first.")
    sys.exit(1)

print("Creating dist.tar.gz...")
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for root, dirs, files in os.walk(LOCAL_DIST):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, LOCAL_DIST)
            tar.add(full_path, arcname=rel_path)

print(f"Connecting to Coolify VPS ({HOST})...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=30)

sftp = client.open_sftp()
print("Uploading dist.tar.gz to VPS /tmp...")
sftp.put(TAR_PATH, "/tmp/dist.tar.gz")
sftp.close()
os.unlink(TAR_PATH)

print("Extracting directly into running frontend container on Coolify...")
cmds = [
    "FE_NAME=$(docker ps --filter 'name=4s2tyq1' --format '{{.Names}}')",
    "if [ -z \"$FE_NAME\" ]; then echo 'Frontend container not found!' && exit 1; fi",
    "mkdir -p /tmp/dist_extract && rm -rf /tmp/dist_extract/*",
    "tar -xzf /tmp/dist.tar.gz -C /tmp/dist_extract",
    "docker cp /tmp/dist_extract/. $FE_NAME:/usr/share/nginx/html/",
    "rm -rf /tmp/dist_extract /tmp/dist.tar.gz",
    "docker exec $FE_NAME ls -la /usr/share/nginx/html/assets | head -10",
]

full_cmd = " && ".join(cmds)
stdin, stdout, stderr = client.exec_command(full_cmd, timeout=60)
out = stdout.read().decode()
print("Deploy output:\n", out)
err = stderr.read().decode()
if err:
    print("Deploy stderr:\n", err)

client.close()
print("[OK] Frontend updated live on Coolify VPS (https://app.ronsbergerhmo.io)!")
