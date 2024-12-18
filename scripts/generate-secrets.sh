SESSION_SECRET=$(head -c20 /dev/urandom | base64)
HONEYPOT_SECRET=$(head -c20 /dev/urandom | base64)

echo "SESSION_SECRET=\"$SESSION_SECRET\"" >> .env
echo "HONEYPOT_SECRET=\"$HONEYPOT_SECRET\"" >> .env
